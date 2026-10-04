// Not a port (T3.4, DEVIATION: online). The link between the screens of the LAN game (screens/OnlineScreen, HostScreen,
// JoinScreen) and the renderer, which owns the network (docs/01-architecture.md §1, docs/03 §3, §7).
//
// The simulation lives in the worker and has no sockets. A screen asks the renderer for something with
// `OnlineBridge.send(request)` (the worker posts it as `{t:'online', req}`, src/sim/protocol.ts); what the renderer
// answers (`{t:'online', ev}`) comes into `OnlineBridge.receive(event)` and is kept here as plain state, which the
// screens read in their update(). Statics, like G: there is one game in a process. `GameLoop.init()` calls `reset()`.

/** What a screen asks the renderer to do (worker -> renderer). */
export type OnlineRequest =
  /** HostScreen was opened: start the WebSocket server and the UDP beacon. Answered with `{k:'host'}` events. */
  | { k: 'hostOpen' }
  /** STOP / BACK of HostScreen: `bye` to the client, close the server, stop the beacon. */
  | { k: 'hostClose' }
  /** TEST of HostScreen (T3.7): the renderer connects to its own addresses and port; answered with `{k:'selfTest'}`. */
  | { k: 'hostTest' }
  /** START of HostScreen: the host goes to the level selection with the server up (the session goes on until the main menu). */
  | { k: 'hostBegin' }
  /** JoinScreen was opened: listen for the beacons. Answered with `{k:'games'}` events. */
  | { k: 'scanOpen' }
  | { k: 'scanClose' }
  /** The card T3.4: `{t:'joinRequest', host, port}`; the renderer stops this worker and starts the client session. */
  | { k: 'joinRequest'; host: string; port: number };

/** Why a join attempt or a client session ended (the renderer restarts the worker and opens JoinScreen). */
export type JoinFailure = 'failed' | 'full' | 'version' | 'lost';

/** What the renderer tells the screens (renderer -> worker). */
export type OnlineEvent =
  /** The settings: sent when the worker is ready. `lastJoinAddress` fills the field of JoinScreen. */
  | { k: 'info'; port: number; lastJoinAddress: string }
  /** The state of the host. `addresses` and `port` come with `waiting`; `peerName` with `connected`. */
  | { k: 'host'; status: HostStatus; addresses?: string[]; port?: number; peerName?: string; message?: string }
  /** The progress of the TEST of HostScreen: `text` is the line to show (`OK`, `FAIL ECONNREFUSED 192.168.0.5`). */
  | { k: 'selfTest'; state: SelfTestState; text?: string }
  /** The list of the games of the LAN (docs/03 §7); `error` when the UDP port cannot be listened to. */
  | { k: 'games'; games: OnlineGame[]; error?: string }
  /** Open JoinScreen with the message of the failure (after the worker was restarted). */
  | { k: 'openJoin'; reason: JoinFailure | null };

export type SelfTestState = 'idle' | 'running' | 'ok' | 'fail';

export type HostStatus = 'idle' | 'starting' | 'waiting' | 'connected' | 'error';

/** A game found in the LAN (the part of `DiscoveredGame` of src/app/at.d.ts that the screens use). */
export interface OnlineGame {
  ip: string;
  hostName: string;
  port: number;
  status: 'waiting' | 'full';
  /** false: another build or protocol ("different version"). */
  buildHashMatches: boolean;
}

export interface HostInfo {
  status: HostStatus;
  addresses: string[];
  port: number;
  peerName: string;
  message: string;
}

/** The texts of the failures (docs/tasks/T3.4 step 6), in the style of the original: capital letters. */
export const JOIN_FAILURE_TEXTS: Readonly<Record<JoinFailure, string>> = {
  failed: 'CONNECTION FAILED',
  full: 'HOST IS FULL',
  version: 'DIFFERENT GAME VERSION',
  lost: 'CONNECTION LOST',
};

export const DEFAULT_ONLINE_PORT = 47020;

export class OnlineBridge {
  /** Sends a request to the renderer. Set by GameLoop; nothing happens until then (tests, the headless run). */
  static send: (aRequest: OnlineRequest) => void = () => undefined;

  /** The port of the host (settings `netPort`) and the address that was typed last (`lastJoinAddress`). */
  static port = DEFAULT_ONLINE_PORT;
  static lastJoinAddress = '';

  static host: HostInfo = OnlineBridge.emptyHost();
  static games: OnlineGame[] = [];
  /** Text of the problem with the scan of the LAN (null: none). */
  static scanError: string | null = null;
  /** The failure of the last join; JoinScreen shows it once and clears it. */
  static joinFailure: JoinFailure | null = null;
  /** The result of the TEST button of HostScreen (T3.7). */
  static selfTest: { state: SelfTestState; text: string } = { state: 'idle', text: '' };
  /** Counts the events: a screen redraws when it has changed. */
  static version = 0;

  static reset(): void {
    OnlineBridge.send = () => undefined;
    OnlineBridge.port = DEFAULT_ONLINE_PORT;
    OnlineBridge.lastJoinAddress = '';
    OnlineBridge.host = OnlineBridge.emptyHost();
    OnlineBridge.games = [];
    OnlineBridge.scanError = null;
    OnlineBridge.joinFailure = null;
    OnlineBridge.selfTest = { state: 'idle', text: '' };
    OnlineBridge.version = 0;
  }

  /** An event of the renderer. */
  static receive(aEvent: OnlineEvent): void {
    OnlineBridge.version++;
    switch (aEvent.k) {
      case 'info':
        OnlineBridge.port = aEvent.port;
        OnlineBridge.lastJoinAddress = aEvent.lastJoinAddress;
        break;
      case 'host':
        OnlineBridge.host = {
          status: aEvent.status,
          addresses: aEvent.addresses ?? OnlineBridge.host.addresses,
          port: aEvent.port ?? OnlineBridge.host.port,
          peerName: aEvent.peerName ?? '',
          message: aEvent.message ?? '',
        };
        break;
      case 'selfTest':
        OnlineBridge.selfTest = { state: aEvent.state, text: aEvent.text ?? '' };
        break;
      case 'games':
        OnlineBridge.games = aEvent.games.slice(0, 64);
        OnlineBridge.scanError = aEvent.error ?? null;
        break;
      case 'openJoin':
        OnlineBridge.joinFailure = aEvent.reason;
        break;
    }
  }

  /** Forgets the state of the host (HostScreen was left). */
  static resetHost(): void {
    OnlineBridge.host = OnlineBridge.emptyHost();
    OnlineBridge.selfTest = { state: 'idle', text: '' };
    OnlineBridge.version++;
  }

  private static emptyHost(): HostInfo {
    return { status: 'idle', addresses: [], port: DEFAULT_ONLINE_PORT, peerName: '', message: '' };
  }
}

/**
 * The address of the Join screen: `ip` or `ip:port` (docs/03 §2). IPv4 only: four numbers 0..255 and, after a colon,
 * a port 1..65535. null when it is not an address.
 */
export function parseJoinAddress(aText: string, aDefaultPort: number): { host: string; port: number } | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/.exec(aText.trim());
  if (m === null) {
    return null;
  }

  for (let i = 1; i <= 4; i++) {
    if (Number(m[i]) > 255) {
      return null;
    }
  }

  let port = aDefaultPort;
  if (m[5] !== undefined) {
    port = Number(m[5]);
    if (port < 1 || port > 65535) {
      return null;
    }
  }

  return { host: `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}.${Number(m[4])}`, port };
}

/** `ip` when the port is the default one, else `ip:port` (what goes into the field and into the settings). */
export function formatJoinAddress(aHost: string, aPort: number, aDefaultPort: number): string {
  return aPort === aDefaultPort ? aHost : `${aHost}:${aPort}`;
}
