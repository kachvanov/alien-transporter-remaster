// T4.1: the replay format (src/sim/replay.ts), the recording of the GameLoop (`recordStart` / `recordStop`, F9 of the dev build),
// the file of electron/replayFile.ts, and the report of a golden mismatch.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { readFile } from 'node:fs/promises';
import { hotkeyOf } from '../../src/render/InputCollector';
import { GameState } from '../../src/game/states/GameState';
import { GameLoop } from '../../src/sim/GameLoop';
import { hashWorldState, runReplay } from '../../src/sim/headless';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import {
  DEFAULT_SHIP,
  decodeInputs,
  encodeInputs,
  HASH_INTERVAL,
  InputRecorder,
  parseReplay,
  scriptToReplay,
  stringifyReplay,
} from '../../src/sim/replay';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import { replayTimestamp, saveReplayFile } from '../../electron/replayFile';
import { compareWithExpected, makeExpected } from '../golden/registry';
import { assetsRoot, hasAssets } from './helpers/assets';

const SNAP = (keys: number[]): InputSnapshot => ({ keysDown: keys, mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 });

describe('replay format', () => {
  it('RLE: only the ticks where the set of keys changes; the order of the keys and repeats do not matter', () => {
    const keys = [[], [], [38], [38], [39, 38], [38, 39], [], [37]];
    expect(encodeInputs(keys)).toEqual([[2, 38], [4, 38, 39], [6], [7, 37]]);
    expect(decodeInputs(encodeInputs(keys), keys.length)).toEqual([[], [], [38], [38], [38, 39], [38, 39], [], [37]]);
  });

  it('the recorder gives the same RLE as encodeInputs', () => {
    const keys = [[38], [38], [37, 38], [], [], [39]];
    const rec = new InputRecorder();
    for (const k of keys) rec.push(k);
    expect(rec.ticks).toBe(6);
    expect(rec.inputs).toEqual(encodeInputs(keys));
  });

  it('a script becomes a replay that survives the JSON text', () => {
    const replay = scriptToReplay({ level: 'Level07', ticks: 100, keys: (t) => (t >= 40 ? [38] : []), seed: 7, casualMode: false });
    expect(replay).toMatchObject({ version: 1, seed: 7, level: 'Level07', casualMode: false, twoPlayers: false, ticks: 100 });
    expect(replay.inputs).toEqual([[40, 38]]);
    expect(replay.ship).toEqual(DEFAULT_SHIP);
    expect(parseReplay(JSON.parse(stringifyReplay(replay)))).toEqual(replay);
    expect(stringifyReplay({ ...replay, inputs: [] })).toContain('"inputs": []');
  });

  it('parseReplay rejects what is not a replay', () => {
    const good = scriptToReplay({ level: 'Level01', ticks: 10, keys: () => [] });
    expect(() => parseReplay(null)).toThrow(/Bad replay/);
    expect(() => parseReplay({ ...good, version: 2 })).toThrow(/version/);
    expect(() => parseReplay({ ...good, level: 'Level1' })).toThrow(/level/);
    expect(() => parseReplay({ ...good, ticks: 0 })).toThrow(/ticks/);
    expect(() => parseReplay({ ...good, ship: { shuttleKind: 1 } })).toThrow(/ship/);
    expect(() => parseReplay({ ...good, inputs: [[5, 38], [3]] })).toThrow(/ascending/);
    expect(() => parseReplay({ ...good, inputs: [['x']] })).toThrow(/entry/);
  });

  it('F9 is the hotkey of the recording and does not go to the game', () => {
    expect(hotkeyOf({ code: 'F9' })).toBe('record');
  });

  it('the file name of a saved replay is <level>-<time>.json', async () => {
    expect(replayTimestamp(new Date(2026, 6, 4, 9, 5, 7))).toBe('20260704-090507');
    const dir = mkdtempSync(join(tmpdir(), 'replay-'));
    try {
      const replay = scriptToReplay({ level: 'Level03', ticks: 5, keys: () => [38] });
      const path = await saveReplayFile(dir, replay, new Date(2026, 6, 4, 9, 5, 7));
      expect(path).toBe(join(dir, 'Level03-20260704-090507.json'));
      expect(parseReplay(JSON.parse(readFileSync(path, 'utf8')))).toEqual(replay);
      await expect(saveReplayFile(dir, { nonsense: true })).rejects.toThrow(/Bad replay/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('golden report', () => {
  const result = {
    hashes: ['a', 'b', 'c'],
    keys: [{ 'p1.fuel': 1 }, { 'p1.fuel': 0.9 }, { 'p1.fuel': 0.8 }],
    checkpoints: [35, 70, 100],
    stats: { ticks: 100, final: {}, errors: [] },
  };
  const expected = makeExpected('x', result);

  it('is empty for the same run', () => {
    expect(compareWithExpected(expected, result)).toBe('');
  });

  it('names the first block of ticks that differs and the key numbers that moved', () => {
    const run = { ...result, hashes: ['a', 'B', 'C'], keys: [{ 'p1.fuel': 1 }, { 'p1.fuel': 0.85 }, { 'p1.fuel': 0.7 }] };
    expect(compareWithExpected(expected, run)).toBe(
      'first different block: ticks 36..70 (checkpoint 2 of 3)\n  p1.fuel: expected 0.9, got 0.85',
    );
    const sameKeys = { ...result, hashes: ['a', 'b', 'C'] };
    expect(compareWithExpected(expected, sameKeys)).toContain('ticks 71..100');
    expect(compareWithExpected(expected, sameKeys)).toContain('the bodies of the world differ');
  });

  it('notices a run of another length and another interval', () => {
    expect(compareWithExpected(expected, { ...result, hashes: ['a', 'b'], keys: [{}, {}], checkpoints: [35, 70] })).toContain(
      'number of checkpoints',
    );
    expect(compareWithExpected({ ...expected, interval: HASH_INTERVAL + 1 }, result)).toContain('golden:update');
  });
});

describe.skipIf(!hasAssets)('replays play', () => {
  it('a hash is taken after every 35 ticks and after the last one', async () => {
    const replay = scriptToReplay({ level: 'Level01', ticks: 80, keys: () => [] });
    const r = await runReplay(replay);
    expect(r.checkpoints).toEqual([35, 70, 80]);
    expect(r.hashes).toHaveLength(3);
    expect(r.hashes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    expect(r.stats.final['shuttles']).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('another input is another game (the hashes see the physics)', async () => {
    const idle = await runReplay(scriptToReplay({ level: 'Level01', ticks: 140, keys: () => [] }));
    const gas = await runReplay(scriptToReplay({ level: 'Level01', ticks: 140, keys: () => [38] }));
    expect(gas.hashes[0]).not.toBe(idle.hashes[0]);
    expect(gas.keys[3]!['p1.fuel']).toBeLessThan(idle.keys[3]!['p1.fuel'] as number);
  }, 30000);

  it('another seed is another game, the mode of the replay is applied', async () => {
    const base = { level: 'Level05', ticks: 70, keys: () => [38, 37] };
    const a = await runReplay(scriptToReplay(base));
    const b = await runReplay(scriptToReplay({ ...base, seed: 99 }));
    const c = await runReplay(scriptToReplay({ ...base, casualMode: false }));
    expect(b.hashes).not.toEqual(a.hashes);
    expect(c.hashes).not.toEqual(a.hashes);
  }, 30000);
});

describe.skipIf(!hasAssets)('recording in the game (F9)', () => {
  it('recordStart restarts the level, recordStop gives a replay that plays to the same hashes', async () => {
    const hashes: string[] = [];
    const logs: string[] = [];
    const replays: unknown[] = [];
    const loop = new GameLoop({
      assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
      save: new MemorySaveStorage(),
      seed: 4242,
      host: { onFrame: () => undefined, openExternal: () => undefined, onReplay: (r) => replays.push(r), log: (_l, m) => logs.push(m) },
      initialState: class extends GameState {
        override create(): void {
          super.create();
          this.debugStartLevel('Level03');
        }
      },
      clock: () => 0,
    });
    await loop.init();
    // play for a while: the game is not at tick 0 of the level when F9 is pressed
    for (let i = 0; i < 20; i++) loop.tick(SNAP(i < 10 ? [] : [38]));
    loop.command('recordStart');
    await loop.whenIdle();
    expect(logs.some((m) => m.includes('recording Level03'))).toBe(true);
    const keys = (t: number): number[] => (t < 30 ? [] : t % 50 < 25 ? [38, 37] : [38]);
    for (let t = 0; t < 120; t++) {
      loop.tick(SNAP(keys(t)));
      if ((t + 1) % HASH_INTERVAL === 0 || t === 119) hashes.push(hashWorldState().hash);
    }

    loop.command('recordStop');
    expect(replays).toHaveLength(1);
    const replay = parseReplay(replays[0]);
    expect(replay).toMatchObject({ seed: 4242, level: 'Level03', ticks: 120, casualMode: true, twoPlayers: false, ship: DEFAULT_SHIP });
    expect(decodeInputs(replay.inputs, replay.ticks)).toEqual(Array.from({ length: 120 }, (_, t) => keys(t).slice().sort((a, b) => a - b)));
    expect(loop.lastReplay).toEqual(replay);

    const played = await runReplay(replay);
    expect(played.hashes).toEqual(hashes);
  }, 60000);

  it('outside a level only the raw inputs are recorded', async () => {
    const logs: string[] = [];
    const loop = new GameLoop({
      assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
      save: new MemorySaveStorage(),
      seed: 1,
      host: { onFrame: () => undefined, openExternal: () => undefined, log: (_l, m) => logs.push(m) },
      clock: () => 0,
    });
    await loop.init();
    loop.command('recordStart');
    loop.tick(SNAP([]));
    loop.command('recordStop');
    expect(loop.lastReplay).toBeNull();
    expect(loop.lastRecording?.inputs).toHaveLength(1);
    expect(logs.some((m) => m.includes('no level is being played'))).toBe(true);
  }, 30000);
});
