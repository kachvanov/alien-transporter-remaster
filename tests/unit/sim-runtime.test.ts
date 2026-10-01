import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AntState } from '../../src/engine/core/AntState';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { FRAME_SCENE_RESET } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { GameLoop, MAX_TICKS_PER_PUMP, TICK_MS } from '../../src/sim/GameLoop';
import type { HostApi } from '../../src/sim/GameLoop';
import { runHeadless } from '../../src/sim/headless';
import { InputRouter, KEY_P2_GAS, KEY_P2_LEFT, KEY_PAUSE } from '../../src/sim/InputRouter';
import type { SimOut } from '../../src/sim/protocol';
import { CachedGameSaveStorage, MemorySaveStorage, WorkerSaveStorage } from '../../src/sim/SaveStorage';
import { SimClient } from '../../src/app/SimClient';
import type { WorkerLike } from '../../src/app/SimClient';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { readFile } from 'node:fs/promises';
import { Level01State } from './helpers/game';

const assetsRoot = resolve(process.cwd(), 'assets');
const hasAssets = existsSync(resolve(assetsRoot, 'manifest.json'));

function snap(keys: number[], wheel = 0): InputSnapshot {
  return { keysDown: keys, mouseX: 10, mouseY: 20, mouseDown: false, wheelDelta: wheel };
}

//---------------------------------------
// InputRouter
//---------------------------------------

describe('InputRouter', () => {
  it('solo: passes the local snapshot, sums the wheel deltas between two ticks', () => {
    const r = new InputRouter();
    r.setLocal(snap([38], 1));
    r.setLocal(snap([38, 37], 2));
    const a = r.compose();
    expect(a.keysDown).toEqual([38, 37]);
    expect(a.wheelDelta).toBe(3);
    expect(r.compose().wheelDelta).toBe(0);
  });

  it('host: P2 keys come from the remote bits, local presses of them are ignored', () => {
    const r = new InputRouter();
    r.setHostMode(true);
    r.setLocal(snap([38, KEY_P2_GAS, KEY_P2_LEFT]));
    r.setRemote({ gas: false, left: false, right: true, pauseReq: false });
    const a = r.compose();
    expect(a.keysDown).toContain(38);
    expect(a.keysDown).not.toContain(KEY_P2_GAS);
    expect(a.keysDown).not.toContain(KEY_P2_LEFT);
    expect(a.keysDown).toContain(68); // D
  });

  it('host: pauseReq is a one-tick press of P', () => {
    const r = new InputRouter();
    r.setHostMode(true);
    r.setLocal(snap([]));
    r.setRemote({ gas: false, left: false, right: false, pauseReq: true });
    expect(r.compose().keysDown).toContain(KEY_PAUSE);
    r.setRemote({ gas: false, left: false, right: false, pauseReq: false });
    expect(r.compose().keysDown).not.toContain(KEY_PAUSE);
  });
});

//---------------------------------------
// SaveStorage
//---------------------------------------

describe('SaveStorage', () => {
  it('MemorySaveStorage: round trip, null deletes', async () => {
    const s = new MemorySaveStorage();
    expect(await s.load('a')).toBeNull();
    const obj = { x: 1, y: [1, 2] };
    await s.save('a', obj);
    obj.x = 5; // the stored copy must not change
    expect(await s.load('a')).toEqual({ x: 1, y: [1, 2] });
    await s.save('a', null);
    expect(await s.load('a')).toBeNull();
  });

  it('WorkerSaveStorage: load asks the renderer once and waits for saveLoaded; save posts', async () => {
    const posted: SimOut[] = [];
    const s = new WorkerSaveStorage((m) => posted.push(m));
    const p1 = s.load('k');
    const p2 = s.load('k');
    expect(posted).toEqual([{ t: 'saveLoad', key: 'k' }]);
    s.handleLoaded('k', { v: 1 });
    expect(await p1).toEqual({ v: 1 });
    expect(await p2).toEqual({ v: 1 });
    expect(await s.load('k')).toEqual({ v: 1 }); // cached, no new request
    expect(posted).toHaveLength(1);
    await s.save('k', { v: 2 });
    expect(posted[1]).toEqual({ t: 'save', key: 'k', data: { v: 2 } });
    expect(await s.load('k')).toEqual({ v: 2 });
    const p3 = s.load('other');
    s.handleLoaded('other', null);
    expect(await p3).toBeNull();
  });

  it('CachedGameSaveStorage: sync read after preload, write goes through', async () => {
    const mem = new MemorySaveStorage();
    await mem.save('k', { a: 1 });
    const c = new CachedGameSaveStorage(mem);
    expect(c.read('k')).toBeNull(); // not preloaded yet
    await c.preload(['k']);
    expect(c.read('k')).toEqual({ a: 1 });
    c.write('k', { a: 2 });
    expect(c.read('k')).toEqual({ a: 2 });
    await Promise.resolve();
    expect(await mem.load('k')).toEqual({ a: 2 });
    c.clear('k');
    expect(c.read('k')).toBeNull();
  });
});

//---------------------------------------
// GameLoop (needs assets/)
//---------------------------------------

function makeLoop(frames: ArrayBuffer[] = [], logs: string[] = []): GameLoop {
  const host: HostApi = {
    onFrame: (b) => frames.push(b),
    openExternal: () => undefined,
    log: (_l, m) => logs.push(m),
  };
  return new GameLoop({
    assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
    save: new MemorySaveStorage(),
    seed: 1234,
    host,
    initialState: AntState, // an empty scene: no test content
    clock: () => 0,
  });
}

describe.skipIf(!hasAssets)('GameLoop.pump', () => {
  it('1000 ms of simulated time (4 ms pumps) make exactly 35 ticks', async () => {
    const frames: ArrayBuffer[] = [];
    const loop = makeLoop(frames);
    await loop.init();
    expect(loop.pump(0)).toBe(0); // the first call only takes the time
    let ticks = 0;
    for (let t = 4; t <= 1000; t += 4) ticks += loop.pump(t);
    expect(ticks).toBe(35);
    expect(frames).toHaveLength(35);
    expect(loop.tickCount).toBe(35);
  });

  it('1000 ms in one pump per frame of 16.7 ms (60 Hz) also make 35 ticks', async () => {
    const loop = makeLoop();
    await loop.init();
    loop.pump(0);
    let ticks = 0;
    for (let i = 1; i <= 60; i++) ticks += loop.pump((i * 1000) / 60);
    expect(ticks).toBe(35);
  });

  it('a stall of 500 ms makes at most 3 ticks per call and drops the rest', async () => {
    const loop = makeLoop();
    await loop.init();
    loop.pump(0);
    expect(loop.pump(500)).toBe(MAX_TICKS_PER_PUMP);
    // the remaining ~414 ms were dropped: the next call at +1 ms has nothing to do
    expect(loop.pump(501)).toBe(0);
    // and then it ticks normally again
    expect(loop.pump(501 + TICK_MS + 0.5)).toBe(1);
  });

  it('frames come out as valid Frames; only the first is a scene reset', async () => {
    const frames: ArrayBuffer[] = [];
    const loop = makeLoop(frames);
    await loop.init();
    loop.pump(0);
    loop.pump(100);
    expect(frames.length).toBe(3);
    const f = frames.map((b) => readFrame(b));
    expect(f.map((x) => x.tick)).toEqual([0, 1, 2]);
    expect(f[0]!.flags & FRAME_SCENE_RESET).not.toBe(0);
    expect(f[1]!.flags & FRAME_SCENE_RESET).toBe(0);
  });

  it('commands: setTimeScale, unknown, recording', async () => {
    const logs: string[] = [];
    const loop = makeLoop([], logs);
    await loop.init();
    loop.command('nope');
    expect(logs.some((m) => m.includes('unknown command'))).toBe(true);
    loop.command('recordStart');
    loop.tick(emptyInputSnapshot());
    loop.tick(snap([38]));
    loop.command('recordStop');
    expect(loop.lastRecording?.inputs).toHaveLength(2);
    loop.command('setTimeScale', [0.5]);
  });
});

describe.skipIf(!hasAssets)('headless run', () => {
  const input = (t: number): InputSnapshot => snap(t % 10 < 5 ? [38] : [37, 39], t % 7 === 0 ? 1 : 0);

  it('100 ticks are deterministic: two runs with one seed give identical frame buffers', async () => {
    const a = await runHeadless({ seed: 42, ticks: 100, input, initialState: Level01State });
    const b = await runHeadless({ seed: 42, ticks: 100, input, initialState: Level01State });
    expect(a.frames).toHaveLength(100);
    expect(a.hashes).toEqual(b.hashes);
    for (let i = 0; i < 100; i++) {
      expect(Buffer.from(a.frames[i]!).equals(Buffer.from(b.frames[i]!))).toBe(true);
    }
    // Level01 (the real game: the level, the HUD, the shuttle) draws something and moves
    expect(readFrame(a.frames[0]!).nodes.length).toBeGreaterThan(0);
    expect(a.hashes[0]).not.toBe(a.hashes[50]);
  });

  it('the hashes are hex SHA-256', async () => {
    const r = await runHeadless({ seed: 1, ticks: 2, keepFrames: false });
    expect(r.frames).toHaveLength(0);
    expect(r.hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

//---------------------------------------
// SimClient (fake worker)
//---------------------------------------

class FakeWorker implements WorkerLike {
  sent: { msg: unknown; transfer?: Transferable[] }[] = [];
  onmessage: ((ev: MessageEvent<SimOut>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  terminated = false;
  postMessage(msg: unknown, transfer?: Transferable[]): void {
    this.sent.push({ msg, transfer });
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(msg: SimOut): void {
    this.onmessage?.({ data: msg } as MessageEvent<SimOut>);
  }
}

describe('SimClient', () => {
  function make(worker: FakeWorker, clock: { t: number }) {
    const frames: ArrayBuffer[] = [];
    const writes: [string, unknown][] = [];
    const opened: string[] = [];
    const logs: string[] = [];
    const client = new SimClient({
      seed: 7,
      assetBase: 'app://assets/',
      onFrame: (b) => frames.push(b),
      at: {
        save: {
          load: async (k) => (k === 'k' ? { v: 1 } : null),
          write: async (k, d) => {
            writes.push([k, d]);
          },
        },
        app: {
          openExternal: async (u) => {
            opened.push(u);
            return true;
          },
        },
      },
      createWorker: () => worker,
      now: () => clock.t,
      onLog: (l, m) => logs.push(`${l}:${m}`),
    });
    return { client, frames, writes, opened, logs };
  }

  it('sends init, forwards input and commands', () => {
    const w = new FakeWorker();
    const { client } = make(w, { t: 0 });
    client.start();
    client.sendInput(snap([1]));
    client.command('setTimeScale', [2]);
    expect(w.sent.map((s) => (s.msg as { t: string }).t)).toEqual(['init', 'input', 'cmd']);
    expect(w.sent[0]!.msg).toEqual({ t: 'init', seed: 7, assetBase: 'app://assets/' });
  });

  it('passes frames on, counts frames per second', () => {
    const w = new FakeWorker();
    const clock = { t: 0 };
    const { client, frames } = make(w, clock);
    for (let i = 0; i < 71; i++) {
      clock.t = i * (1000 / 35);
      w.emit({ t: 'frame', buf: new ArrayBuffer(4) });
    }
    expect(frames).toHaveLength(71);
    expect(client.frameCount).toBe(71);
    expect(client.framesPerSecond).toBeGreaterThan(33);
    expect(client.framesPerSecond).toBeLessThan(37);
  });

  it('serves save, saveLoad and openExternal through window.at', async () => {
    const w = new FakeWorker();
    const { client, writes, opened } = make(w, { t: 0 });
    w.emit({ t: 'save', key: 'a', data: { z: 1 } });
    w.emit({ t: 'openExternal', url: 'http://zombotron.com' });
    w.emit({ t: 'saveLoad', key: 'k' });
    w.emit({ t: 'saveLoad', key: 'none' });
    await new Promise((r) => setTimeout(r, 0));
    expect(writes).toEqual([['a', { z: 1 }]]);
    expect(opened).toEqual(['http://zombotron.com']);
    expect(w.sent.map((s) => s.msg)).toEqual([
      { t: 'saveLoaded', key: 'k', data: { v: 1 } },
      { t: 'saveLoaded', key: 'none', data: null },
    ]);
    expect(client.ready).toBe(false);
    w.emit({ t: 'ready' });
    expect(client.ready).toBe(true);
    client.dispose();
    expect(w.terminated).toBe(true);
  });
});
