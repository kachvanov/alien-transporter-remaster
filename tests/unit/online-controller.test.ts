// T3.4: the renderer side of the screens of the LAN game (app/OnlineController.ts) with a fake `window.at`, the worker
// protocol of the messages (`{t:'online'}`), SimClient.restart() and GameLoop.online().

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OnlineController } from '../../src/app/OnlineController';
import type { OnlineSim } from '../../src/app/OnlineController';
import { SimClient } from '../../src/app/SimClient';
import type { WorkerLike } from '../../src/app/SimClient';
import type { BeaconInfo, DiscoveredGame } from '../../src/app/at';
import { DEFAULT_SETTINGS } from '../../src/app/settings';
import type { RemasterSettings } from '../../src/app/settings';
import type { OnlineEvent, OnlineRequest } from '../../src/game/online/OnlineBridge';
import { OnlineBridge } from '../../src/game/online/OnlineBridge';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { G } from '../../src/game/G';
import { runHeadless } from '../../src/sim/headless';
import type { SimIn, SimOut } from '../../src/sim/protocol';
import { hasAssets } from './helpers/assets';

interface Fake {
  controller: OnlineController;
  events: OnlineEvent[];
  restarts: number;
  beacons: BeaconInfo[];
  calls: string[];
  settings: Partial<RemasterSettings>[];
  pushGames(games: DiscoveredGame[]): void;
  failStart: { error: Error | null };
  clientCalls: [string, number][];
}

function makeFake(aOpts: { server?: boolean; client?: boolean } = {}): Fake {
  const events: OnlineEvent[] = [];
  const beacons: BeaconInfo[] = [];
  const calls: string[] = [];
  const settings: Partial<RemasterSettings>[] = [];
  const clientCalls: [string, number][] = [];
  const failStart = { error: null as Error | null };
  let listener: ((g: DiscoveredGame[]) => void) | null = null;
  const sim: OnlineSim = {
    sendOnline: (e) => events.push(e),
    restart: () => {
      fake.restarts++;
    },
  };
  const at = {
    app: { getLocalIPv4: () => Promise.resolve(['192.168.1.20', '10.0.0.7']) },
    discovery: {
      startBeacon: (info: BeaconInfo) => {
        calls.push('startBeacon');
        beacons.push(info);
        return failStart.error === null ? Promise.resolve() : Promise.reject(failStart.error);
      },
      stopBeacon: () => {
        calls.push('stopBeacon');
        return Promise.resolve();
      },
      startScan: (hash: string) => {
        calls.push('startScan:' + hash);
        return failStart.error === null ? Promise.resolve() : Promise.reject(failStart.error);
      },
      stopScan: () => {
        calls.push('stopScan');
        return Promise.resolve();
      },
      onUpdate: (cb: (g: DiscoveredGame[]) => void) => {
        listener = cb;
        calls.push('subscribe');
        return () => {
          listener = null;
          calls.push('unsubscribe');
        };
      },
    },
  };
  const current: RemasterSettings = { ...DEFAULT_SETTINGS, lastJoinAddress: '1.2.3.4', netPort: 5000 };
  const controller = new OnlineController({
    at: at as never,
    settings: {
      get value() {
        return current;
      },
      update: (p) => {
        settings.push(p);
        Object.assign(current, p);
      },
    },
    buildHash: 'hash1',
    server: aOpts.server === true ? { start: (p) => (calls.push('serverStart:' + p), Promise.resolve()), stop: () => void calls.push('serverStop') } : undefined,
    startClient: aOpts.client === true ? (h, p) => void clientCalls.push([h, p]) : undefined,
    onLog: () => undefined,
  });
  controller.bind(sim);
  const fake: Fake = {
    controller,
    events,
    restarts: 0,
    beacons,
    calls,
    settings,
    pushGames: (g) => listener?.(g),
    failStart,
    clientCalls,
  };
  return fake;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const GAME: DiscoveredGame = {
  ip: '192.168.1.20',
  hostName: 'MacBook',
  port: 47020,
  status: 'waiting',
  buildHashMatches: true,
  lastSeen: 1,
};

describe('OnlineController', () => {
  it('tells the settings when the worker is ready', () => {
    const f = makeFake();
    f.controller.onWorkerReady();
    expect(f.events).toEqual([{ k: 'info', port: 5000, lastJoinAddress: '1.2.3.4' }]);
  });

  it('host: addresses, server, beacon; the status "waiting" comes when all is up', async () => {
    const f = makeFake({ server: true });
    f.controller.handle({ k: 'hostOpen' });
    expect(f.events).toEqual([{ k: 'host', status: 'starting' }]);
    await flush();
    expect(f.calls).toEqual(['serverStart:5000', 'startBeacon']);
    expect(f.beacons).toEqual([{ buildHash: 'hash1', hostName: '', port: 5000, status: 'waiting' }]);
    expect(f.events[1]).toEqual({ k: 'host', status: 'waiting', addresses: ['192.168.1.20', '10.0.0.7'], port: 5000 });
  });

  it('host: a player comes (the beacon says full) and goes (waiting again); Stop stops the server and the beacon', async () => {
    const f = makeFake({ server: true });
    f.controller.handle({ k: 'hostOpen' });
    await flush();
    f.controller.peerConnected('Windows');
    expect(f.beacons[1]?.status).toBe('full');
    expect(f.events[f.events.length - 1]).toEqual({ k: 'host', status: 'connected', peerName: 'Windows' });
    f.controller.peerDisconnected();
    expect(f.beacons[2]?.status).toBe('waiting');
    f.controller.handle({ k: 'hostClose' });
    expect(f.calls.slice(-2)).toEqual(['serverStop', 'stopBeacon']);
    f.controller.handle({ k: 'hostClose' }); // (twice: nothing more)
    expect(f.calls.filter((c) => c == 'stopBeacon').length).toBe(1);
    const n = f.events.length;
    f.controller.peerConnected('late');
    expect(f.events.length).toBe(n);
  });

  it('host: Stop while it starts: nothing is announced', async () => {
    const f = makeFake();
    f.controller.handle({ k: 'hostOpen' });
    f.controller.handle({ k: 'hostClose' });
    await flush();
    expect(f.events).toEqual([{ k: 'host', status: 'starting' }]);
  });

  it('host: a beacon that cannot start is an error of the host', async () => {
    const f = makeFake();
    f.failStart.error = new Error('EADDRINUSE');
    f.controller.handle({ k: 'hostOpen' });
    await flush();
    expect(f.events[f.events.length - 1]).toEqual({ k: 'host', status: 'error', message: 'Cannot start the host: EADDRINUSE' });
  });

  it('scan: the list of the games goes to the screen, Back stops it', async () => {
    const f = makeFake();
    f.controller.handle({ k: 'scanOpen' });
    f.controller.handle({ k: 'scanOpen' }); // (twice: once)
    await flush();
    expect(f.calls).toEqual(['subscribe', 'startScan:hash1']);
    f.pushGames([GAME]);
    expect(f.events).toEqual([
      { k: 'games', games: [{ ip: '192.168.1.20', hostName: 'MacBook', port: 47020, status: 'waiting', buildHashMatches: true }] },
    ]);
    f.controller.handle({ k: 'scanClose' });
    expect(f.calls.slice(-2)).toEqual(['unsubscribe', 'stopScan']);
  });

  it('scan: a UDP port that cannot be listened to is reported to the screen', async () => {
    const f = makeFake();
    f.failStart.error = new Error('EADDRINUSE');
    f.controller.handle({ k: 'scanOpen' });
    await flush();
    expect(f.events).toEqual([{ k: 'games', games: [], error: 'EADDRINUSE' }]);
  });

  it('join: the address goes to the settings (the default port is left out), the scan stops, the client starts', async () => {
    const f = makeFake({ client: true });
    f.controller.handle({ k: 'scanOpen' });
    await flush();
    f.controller.handle({ k: 'joinRequest', host: '192.168.1.20', port: 5000 });
    expect(f.settings).toEqual([{ lastJoinAddress: '192.168.1.20' }]);
    f.controller.handle({ k: 'joinRequest', host: '192.168.1.20', port: 6000 });
    expect(f.settings[1]).toEqual({ lastJoinAddress: '192.168.1.20:6000' });
    expect(f.clientCalls).toEqual([
      ['192.168.1.20', 5000],
      ['192.168.1.20', 6000],
    ]);
    expect(f.calls).toContain('stopScan');
    expect(f.restarts).toBe(0);
  });

  it('join without a client session (STUB(T3.3)), or a client that throws: the worker is restarted, JoinScreen opens with the reason', () => {
    const f = makeFake();
    f.controller.handle({ k: 'joinRequest', host: '10.0.0.1', port: 5000 });
    expect(f.restarts).toBe(1);
    expect(f.events).toEqual([]); // (the new worker is not ready yet)
    f.controller.onWorkerReady();
    expect(f.events).toEqual([
      { k: 'info', port: 5000, lastJoinAddress: '10.0.0.1' },
      { k: 'openJoin', reason: 'failed' },
    ]);
    f.controller.onWorkerReady(); // (the reason is told once)
    expect(f.events.length).toBe(3);

    const g = makeFake({ client: true });
    g.controller.joinFailed('lost');
    g.controller.onWorkerReady();
    expect(g.events[1]).toEqual({ k: 'openJoin', reason: 'lost' });
  });
});

//---------------------------------------
// The worker protocol
//---------------------------------------

class FakeWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent<SimOut>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  sent: SimIn[] = [];
  terminated = false;
  postMessage(m: SimIn): void {
    this.sent.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  say(m: SimOut): void {
    this.onmessage?.({ data: m } as MessageEvent<SimOut>);
  }
}

describe('SimClient: the messages of the LAN game', () => {
  it('{t:online} requests of the worker go to onOnline, answers go to the worker, restart() makes a new worker', () => {
    const workers: FakeWorker[] = [];
    const got: OnlineRequest[] = [];
    let ready = 0;
    const sim = new SimClient({
      seed: 1,
      assetBase: 'app://assets/',
      onFrame: () => undefined,
      at: { save: {} as never, app: {} as never },
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      onOnline: (r) => got.push(r),
      onReady: () => ready++,
    });
    sim.start();
    const first = workers[0] as FakeWorker;
    expect(first.sent[0]?.t).toBe('init');
    first.say({ t: 'online', req: { k: 'hostOpen' } });
    first.say({ t: 'online', req: { k: 'joinRequest', host: '1.2.3.4', port: 5 } });
    expect(got).toEqual([{ k: 'hostOpen' }, { k: 'joinRequest', host: '1.2.3.4', port: 5 }]);
    sim.sendOnline({ k: 'openJoin', reason: 'full' });
    expect(first.sent[1]).toEqual({ t: 'online', ev: { k: 'openJoin', reason: 'full' } });

    first.say({ t: 'ready' });
    expect([sim.ready, ready]).toEqual([true, 1]);
    sim.restart();
    expect(first.terminated).toBe(true);
    expect(sim.ready).toBe(false);
    const second = workers[1] as FakeWorker;
    expect(second.sent[0]).toEqual({ t: 'init', seed: 1, assetBase: 'app://assets/' });
    first.say({ t: 'online', req: { k: 'hostClose' } }); // (the old worker is silent)
    expect(got.length).toBe(2);
    second.say({ t: 'ready' });
    expect(ready).toBe(2);
  });
});

const hasSounds = hasAssets && existsSync(resolve(process.cwd(), 'assets', 'sounds.json'));

describe.skipIf(!hasSounds)('GameLoop: the LAN game', () => {
  it('the requests of the screens go to the host, `openJoin` opens JoinScreen with the failure', async () => {
    const { loop } = await runHeadless({ seed: 77, ticks: 150, keepFrames: false });
    const sent: OnlineRequest[] = [];
    OnlineBridge.send = (r) => sent.push(r);
    OnlineBridge.send({ k: 'hostOpen' });
    expect(sent).toEqual([{ k: 'hostOpen' }]);
    expect(G.core.getSystem(MenuSystem)?.currentScreenName).toBe(MenuSystem.MAIN_MENU_SCREEN);

    loop.online({ k: 'openJoin', reason: 'lost' });
    expect(G.core.getSystem(MenuSystem)?.currentScreenName).toBe(MenuSystem.JOIN_SCREEN);
    expect(OnlineBridge.joinFailure).toBeNull(); // (the screen is made at once and has taken the failure)
    expect(sent).toEqual([{ k: 'hostOpen' }, { k: 'scanOpen' }]); // (JoinScreen listens for the games)
    for (let i = 0; i < 40; i++) loop.tick({ keysDown: [], mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 });
    expect(G.core.getSystem(MenuSystem)?.currentScreenName).toBe(MenuSystem.JOIN_SCREEN);
  }, 60_000);
});
