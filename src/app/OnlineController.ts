// Not a port (T3.4). The renderer side of the screens of the LAN game (src/game/screens/{Online,Host,Join}Screen.ts):
// the simulation cannot open a socket, so its screens send requests (`{t:'online'}`, game/online/OnlineBridge.ts) and
// this class carries them out with `window.at` (docs/03 §2, §7, §8) and reports back with events.
//
//  - Host: the addresses of the machine and the UDP beacon (T3.5); the WebSocket server is a hook (STUB(T3.2)).
//  - Join: the scan of the beacons (T3.5); the client session is a hook (STUB(T3.3)).
//  - A join that fails, or a session that is lost: `joinFailed(reason)` restarts the worker (the game is at the main menu
//    again) and opens JoinScreen with the message (`onWorkerReady` sends it as soon as the new worker is ready).

import type { JoinFailure, OnlineEvent, OnlineGame, OnlineRequest } from '../game/online/OnlineBridge';
import { formatJoinAddress } from '../game/online/OnlineBridge';
import type { AtApi, DiscoveredGame } from './at';
import type { RemasterSettings } from './settings';

/** The WebSocket server of the host (T3.2): the card T3.2 fills it in. */
export interface HostServerHook {
  start(aPort: number): Promise<void>;
  stop(): void;
}

/** What the controller needs from the settings (SettingsStore). */
export interface OnlineSettings {
  readonly value: Readonly<RemasterSettings>;
  update(aPatch: Partial<RemasterSettings>): void;
}

/** The part of SimClient that the controller uses. */
export interface OnlineSim {
  sendOnline(aEvent: OnlineEvent): void;
  restart(): void;
}

export interface OnlineControllerOptions {
  at: Pick<AtApi, 'app' | 'discovery'>;
  settings: OnlineSettings;
  /** `manifest.buildHash`: the games of another build are "different version" (docs/03 §3). */
  buildHash: string;
  /** STUB(T3.2): the WebSocket server of the host. Without it the host announces itself, but nobody can connect. */
  server?: HostServerHook;
  /**
   * STUB(T3.3): starts the client session (stops the worker, connects). Without it the connection always fails.
   * The session reports its end with `controller.joinFailed(reason)`.
   */
  startClient?: (aHost: string, aPort: number) => void;
  onLog?: (aLevel: 'info' | 'warn' | 'error', aMessage: string) => void;
}

export class OnlineController {
  private readonly _opts: OnlineControllerOptions;
  private _sim: OnlineSim | null = null;
  private _hostGeneration = 0;
  private _hosting = false;
  private _unsubscribeScan: (() => void) | null = null;
  private _scanning = false;
  private _pendingFailure: JoinFailure | null = null;

  constructor(aOpts: OnlineControllerOptions) {
    this._opts = aOpts;
  }

  /** The simulation that the answers go to (the controller is made before the SimClient, which needs its `onOnline`). */
  bind(aSim: OnlineSim): void {
    this._sim = aSim;
  }

  /** The worker is ready (also after `restart()`): the settings for the screens, the failure to show, if any. */
  onWorkerReady(): void {
    const settings = this._opts.settings.value;
    this.emit({ k: 'info', port: settings.netPort, lastJoinAddress: settings.lastJoinAddress });
    const reason = this._pendingFailure;
    if (reason !== null) {
      this._pendingFailure = null;
      this.emit({ k: 'openJoin', reason });
    }
  }

  /** A request of the screens. */
  handle(aRequest: OnlineRequest): void {
    switch (aRequest.k) {
      case 'hostOpen':
        void this.openHost();
        break;
      case 'hostClose':
        this.closeHost();
        break;
      case 'hostBegin':
        // STUB(T3.6): the host goes to the level selection with the server up; the remote P2 comes with T3.6.
        this.log('info', 'host: begin');
        break;
      case 'scanOpen':
        void this.openScan();
        break;
      case 'scanClose':
        this.closeScan();
        break;
      case 'joinRequest':
        this.join(aRequest.host, aRequest.port);
        break;
    }
  }

  /** T3.2: a player came in. The beacon tells "full" and the Host screen shows the name. */
  peerConnected(aName: string): void {
    if (!this._hosting) {
      return;
    }

    this.beacon('full');
    this.emit({ k: 'host', status: 'connected', peerName: aName });
  }

  /** T3.2: the player has gone; the host waits for the next one. */
  peerDisconnected(): void {
    if (!this._hosting) {
      return;
    }

    this.beacon('waiting');
    this.emit({ k: 'host', status: 'waiting' });
  }

  /**
   * T3.3 (or a join that failed here): the worker is restarted and JoinScreen opens with the reason as soon as the new
   * worker is ready.
   */
  joinFailed(aReason: JoinFailure): void {
    this._pendingFailure = aReason;
    this._sim?.restart();
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private async openHost(): Promise<void> {
    const generation = ++this._hostGeneration;
    this._hosting = true;
    this.emit({ k: 'host', status: 'starting' });
    const port = this._opts.settings.value.netPort;
    try {
      const addresses = await this._opts.at.app.getLocalIPv4();
      await this._opts.server?.start(port);
      await this._opts.at.discovery.startBeacon({ buildHash: this._opts.buildHash, hostName: '', port, status: 'waiting' });
      if (generation !== this._hostGeneration) {
        return; // (closed while it was starting: closeHost has stopped what was started)
      }

      this.emit({ k: 'host', status: 'waiting', addresses, port });
    } catch (e) {
      this.log('error', 'host: ' + messageOf(e));
      if (generation === this._hostGeneration) {
        this.closeHost();
        this.emit({ k: 'host', status: 'error', message: 'Cannot start the host: ' + messageOf(e) });
      }
    }
  }

  private closeHost(): void {
    this._hostGeneration++;
    if (!this._hosting) {
      return;
    }

    this._hosting = false;
    try {
      this._opts.server?.stop();
    } catch (e) {
      this.log('warn', 'host: ' + messageOf(e));
    }

    this._opts.at.discovery.stopBeacon().catch((e: unknown) => this.log('warn', 'beacon: ' + messageOf(e)));
  }

  private beacon(aStatus: 'waiting' | 'full'): void {
    const port = this._opts.settings.value.netPort;
    this._opts.at.discovery
      .startBeacon({ buildHash: this._opts.buildHash, hostName: '', port, status: aStatus })
      .catch((e: unknown) => this.log('warn', 'beacon: ' + messageOf(e)));
  }

  private async openScan(): Promise<void> {
    if (this._scanning) {
      return;
    }

    this._scanning = true;
    this._unsubscribeScan = this._opts.at.discovery.onUpdate((aGames) => {
      this.emit({ k: 'games', games: aGames.map(toOnlineGame) });
    });
    try {
      await this._opts.at.discovery.startScan(this._opts.buildHash);
    } catch (e) {
      this.log('warn', 'scan: ' + messageOf(e));
      if (this._scanning) {
        this.emit({ k: 'games', games: [], error: messageOf(e) });
      }
    }
  }

  private closeScan(): void {
    if (!this._scanning) {
      return;
    }

    this._scanning = false;
    this._unsubscribeScan?.();
    this._unsubscribeScan = null;
    this._opts.at.discovery.stopScan().catch((e: unknown) => this.log('warn', 'scan: ' + messageOf(e)));
  }

  private join(aHost: string, aPort: number): void {
    const settings = this._opts.settings;
    settings.update({ lastJoinAddress: formatJoinAddress(aHost, aPort, settings.value.netPort) });
    this.closeScan();
    if (this._opts.startClient === undefined) {
      // STUB(T3.3): there is no client session yet.
      this.joinFailed('failed');
      return;
    }

    try {
      this._opts.startClient(aHost, aPort);
    } catch (e) {
      this.log('error', 'join: ' + messageOf(e));
      this.joinFailed('failed');
    }
  }

  private emit(aEvent: OnlineEvent): void {
    this._sim?.sendOnline(aEvent);
  }

  private log(aLevel: 'info' | 'warn' | 'error', aMessage: string): void {
    if (this._opts.onLog !== undefined) {
      this._opts.onLog(aLevel, aMessage);
    } else {
      console[aLevel]('[online] ' + aMessage);
    }
  }
}

function toOnlineGame(aGame: DiscoveredGame): OnlineGame {
  return {
    ip: aGame.ip,
    hostName: aGame.hostName,
    port: aGame.port,
    status: aGame.status,
    buildHashMatches: aGame.buildHashMatches,
  };
}

function messageOf(aError: unknown): string {
  return aError instanceof Error ? aError.message : String(aError);
}
