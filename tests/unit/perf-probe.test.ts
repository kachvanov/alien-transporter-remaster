// T4.3: the measurement of the tick (src/sim/perfProbe.ts, `--perf-log`) and the parts of the optimisation that are not covered by the
// golden replays: the cells of PhysicalMap, the perf-log file of the main process, the flag and the worker protocol.

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeFlagsArg, encodeFlagsArg, parseDevFlags } from '../../electron/flags';
import { PerfLog, sanitizePerfEntry, summarizePerf } from '../../electron/perfLog';
import { SimClient } from '../../src/app/SimClient';
import type { WorkerLike } from '../../src/app/SimClient';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { AntPluginManager } from '../../src/engine/plugins/AntPluginManager';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { PhysicalCell } from '../../src/game/elements/PhysicalCell';
import { FrameWriter } from '../../src/frame/FrameWriter';
import { GameLoop } from '../../src/sim/GameLoop';
import type { HostApi } from '../../src/sim/GameLoop';
import { PERF_PARTS, PERF_WINDOW_TICKS, PerfProbe, quantile } from '../../src/sim/perfProbe';
import type { PerfSample } from '../../src/sim/perfProbe';
import { replayInput } from '../../src/sim/replay';
import { makeReplayState } from '../../src/sim/replayState';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import type { SimIn, SimOut } from '../../src/sim/protocol';
import { idleThenGasReplays } from '../golden/scripts';
import { assetsRoot, hasAssets } from './helpers/assets';

describe('PerfProbe', () => {
  it('quantile: the index floor(q * n) of the sorted values', () => {
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.95)).toBe(4);
    expect(quantile([7], 0.99)).toBe(7);
  });

  it('take(): p50/p95/max of the ticks, the mean of the parts per tick, a new window afterwards', () => {
    let now = 0;
    const probe = new PerfProbe(() => now);
    for (let i = 1; i <= 20; i++) {
      probe.begin();
      now += i; // the tick takes i ms
      probe.add('physics.step', i / 2);
      probe.end();
    }

    expect(probe.ticks).toBe(20);
    const s = probe.take() as PerfSample;
    expect(s.ticks).toBe(20);
    expect(s.tickMax).toBe(20);
    expect(s.tickP50).toBe(11);
    expect(s.tickP95).toBe(20);
    expect(s.tickMean).toBeCloseTo(10.5, 9);
    expect(s.parts['physics.step']).toBeCloseTo(5.25, 9);
    expect(s.parts['frameWriter']).toBe(0);
    expect(Object.keys(s.parts)).toEqual([...PERF_PARTS]);
    expect(probe.ticks).toBe(0);
    expect(probe.take()).toBeNull();
  });

  it('install() wraps the methods and uninstall() puts them back; the result of a wrapped method is the same', () => {
    const before = AntPluginManager.prototype.update;
    const writeBefore = FrameWriter.prototype.write;
    const probe = new PerfProbe(() => 0);
    probe.install();
    expect(AntPluginManager.prototype.update).not.toBe(before);
    expect(FrameWriter.prototype.write).not.toBe(writeBefore);
    probe.uninstall();
    expect(AntPluginManager.prototype.update).toBe(before);
    expect(FrameWriter.prototype.write).toBe(writeBefore);
  });
});

describe.skipIf(!hasAssets)('GameLoop with the probe', () => {
  const replay = (idleThenGasReplays().find((r) => r.name === 'level01-idle-then-gas') as ReturnType<typeof idleThenGasReplays>[number]).replay;

  async function run(aPerf: boolean, aClock: () => number, aTicks: number): Promise<{ frames: string; samples: PerfSample[] }> {
    const samples: PerfSample[] = [];
    const host: HostApi = {
      onFrame: () => undefined,
      openExternal: () => undefined,
      onPerf: (s) => samples.push(s),
      log: () => undefined,
    };
    const loop = new GameLoop({
      assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
      save: new MemorySaveStorage(),
      seed: replay.seed,
      host,
      initialState: makeReplayState(replay),
      clock: aClock,
      perf: aPerf,
    });
    await loop.init();
    const input = replayInput(replay);
    const hash = createHash('sha256');
    for (let i = 0; i < aTicks; i++) {
      hash.update(new Uint8Array(loop.tick(i < 35 ? emptyInputSnapshot() : input(i))));
    }

    return { frames: hash.digest('hex'), samples };
  }

  it('does not change the game: the frames are the same with and without the probe', async () => {
    const plain = await run(false, () => 0, 90);
    const probed = await run(true, () => 0, 90);
    PerfProbe.active?.uninstall();
    expect(probed.frames).toBe(plain.frames);
    expect(plain.samples).toHaveLength(0);
    expect(probed.samples).toHaveLength(Math.floor(90 / PERF_WINDOW_TICKS));
  }, 60000);

  it('measures the parts: with a clock that moves, physics and the writer of the frame have a share', async () => {
    let t = 0;
    const probed = await run(true, () => (t += 0.01), PERF_WINDOW_TICKS);
    PerfProbe.active?.uninstall();
    expect(probed.samples).toHaveLength(1);
    const s = probed.samples[0] as PerfSample;
    expect(s.ticks).toBe(PERF_WINDOW_TICKS);
    expect(s.parts['plugins.update']).toBeGreaterThan(0);
    expect(s.parts['physics.step']).toBeGreaterThan(0);
    expect(s.parts['frameWriter']).toBeGreaterThan(0);
    expect(s.parts['plugins.update']).toBeGreaterThanOrEqual(s.parts['physics.step']);
    expect(s.tickMean).toBeGreaterThan(s.parts['plugins.update']);
  }, 60000);
});

describe('PhysicalCell (the cell keeps its array between two ticks)', () => {
  it('clearFixtures() only resets the count; the readers look at [0, numFixtures)', () => {
    const cell = new PhysicalCell();
    const a = { id: 'a' } as never;
    const b = { id: 'b' } as never;
    const c = { id: 'c' } as never;
    cell.addFixture(a);
    cell.addFixture(b);
    expect(cell.numFixtures).toBe(2);
    const storage = cell.fixtures;
    cell.clearFixtures();
    expect(cell.numFixtures).toBe(0);
    expect(cell.fixtures).toBe(storage);
    cell.addFixture(c);
    expect(cell.numFixtures).toBe(1);
    expect((cell.fixtures as unknown[])[0]).toBe(c);
  });

  it('destroy() releases the array', () => {
    const cell = new PhysicalCell();
    cell.addFixture({} as never);
    const storage = cell.fixtures as unknown[];
    cell.destroy();
    expect(cell.fixtures).toBeNull();
    expect(storage).toHaveLength(0);
  });
});

describe('--perf-log', () => {
  it('the flag is parsed, survives main -> preload and is absent by default', () => {
    expect(parseDevFlags([])).toEqual({ startLevel: null, tier: null, classic: false });
    const flags = parseDevFlags(['--perf-log=perf.json', '--start-level=Level11']);
    expect(flags.perfLog).toBe('perf.json');
    expect(decodeFlagsArg(['electron', encodeFlagsArg(flags)]).perfLog).toBe('perf.json');
    expect(parseDevFlags(['--perf-log=']).perfLog).toBeUndefined();
  });

  it('sanitizePerfEntry keeps the numbers only', () => {
    expect(sanitizePerfEntry(null)).toBeNull();
    const e = sanitizePerfEntry({ t: 3, fps: 'x', tickP95: 1.5, tickMax: NaN, parts: { a: 1, b: 'x' }, evil: 1 });
    expect(e).toMatchObject({ t: 3, fps: 0, tickP95: 1.5, tickMax: 0, parts: { a: 1, b: 0 } });
    expect(e).not.toHaveProperty('evil');
  });

  it('PerfLog writes { meta, summary, entries } after every line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'perflog-'));
    try {
      const path = resolve(dir, 'perf.json');
      const log = new PerfLog(path, { platform: 'test' });
      await log.add({ t: 1, fps: 60, tickP50: 0.4, tickP95: 0.8, tickMax: 1.2, frameBytesMax: 100, parts: { 'physics.step': 0.2 } }, 300);
      await log.add({ t: 2, fps: 58, tickP50: 0.5, tickP95: 1, tickMax: 2, frameBytesMax: 120, parts: { 'physics.step': 0.3 } }, 310);
      const file = JSON.parse(await readFile(path, 'utf8')) as {
        meta: { platform: string };
        summary: { seconds: number; fps: { min: number; max: number }; tickP95: { max: number }; ramMB: { max: number } };
        entries: { ramMB: number; parts: Record<string, number> }[];
      };
      expect(file.meta.platform).toBe('test');
      expect(file.entries).toHaveLength(2);
      expect(file.entries[1]?.ramMB).toBe(310);
      expect(file.summary.seconds).toBe(2);
      expect(file.summary.fps.min).toBe(58);
      expect(file.summary.fps.max).toBe(60);
      expect(file.summary.tickP95.max).toBe(1);
      expect(file.summary.ramMB.max).toBe(310);
      expect(summarizePerf([]).fps).toEqual({ min: 0, mean: 0, max: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('the worker protocol of the measurement', () => {
  class FakeWorker implements WorkerLike {
    sent: SimIn[] = [];
    onmessage: ((ev: MessageEvent<SimOut>) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;
    postMessage(m: SimIn): void {
      this.sent.push(m);
    }

    terminate(): void {}
    emit(m: SimOut): void {
      this.onmessage?.({ data: m } as MessageEvent<SimOut>);
    }
  }

  const at = { save: { load: async () => null, write: async () => undefined }, app: { openExternal: async () => true } };

  it('without onPerf the init message is the one it always was; with it the worker is asked to measure', () => {
    const plain = new FakeWorker();
    new SimClient({ seed: 1, assetBase: 'app://assets/', onFrame: () => undefined, at, createWorker: () => plain }).start();
    expect(plain.sent[0]).toEqual({ t: 'init', seed: 1, assetBase: 'app://assets/' });

    const w = new FakeWorker();
    const got: PerfSample[] = [];
    new SimClient({ seed: 1, assetBase: 'app://assets/', onFrame: () => undefined, onPerf: (s) => got.push(s), at, createWorker: () => w }).start();
    expect(w.sent[0]).toEqual({ t: 'init', seed: 1, assetBase: 'app://assets/', perf: true });
    const sample = new PerfProbe(() => 0);
    sample.begin();
    sample.end();
    w.emit({ t: 'perf', sample: sample.take() as PerfSample });
    expect(got).toHaveLength(1);
  });
});
