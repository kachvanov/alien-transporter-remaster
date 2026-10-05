// T1.9e acceptance (M1): Level01 from the spawn to the portal with one player. A pilot (tests/golden/scripts/level01-bot.ts)
// presses the keys of Player1 in the real game (GameState with all systems, real physics, HUD, sounds), the Frames are
// read like the renderer reads them.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SoundsSchema } from '../../src/engine/assets/schemas';
import type { Manifest } from '../../src/engine/assets/schemas';
import { readFrame } from '../../src/frame/FrameReader';
import type { FrameData } from '../../src/frame/types';
import { G } from '../../src/game/G';
import { GoalManagerNode } from '../../src/game/nodes/GoalManagerNode';
import { LevelCompleteScreen } from '../../src/game/screens/LevelCompleteScreen';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { runHeadless } from '../../src/sim/headless';
import type { HeadlessResult } from '../../src/sim/headless';
import { Level01Bot, Level01State } from '../golden/scripts/level01-bot';
import { hasAssets } from './helpers/assets';

const assetsRoot = resolve(process.cwd(), 'assets');
const ready = hasAssets && existsSync(resolve(assetsRoot, 'sounds.json'));

// T2.6: the screens (tweens of the buttons, AntTaskManager of the menu and of GameScreen) are plugins and change the
// order of the plugins (AntPluginManager.add sorts them with the AVM2 sort, all priorities are equal), so the timing of the
// passengers moved. T2.1: SensorSystem and MissileSystem are in the list of the systems now (the AVM2 sort of
// AntCore.updatePriority gives another order): the deliveries are at ticks 1118 and 1601, the portal takes the shuttle at
// 1914 and the level complete screen comes 84 ticks later (the fade of MenuSystem), at 1998. T2.3: the effects (the snow of
// Level01, the dust, the engines) draw from the PRNG now, so the passengers wait and walk otherwise: the deliveries are at
// 683 and 969, the portal takes the shuttle at 1283 and the level complete screen comes at 1367 (the bot counts a delivery
// also when the next passenger boards at once). FIX-5: AntG.elapsed is the fixed 0.0333 s of the original (it was 1/35): the
// deliveries are at 632 and 923, the portal takes the shuttle at 1255; the pilot flies to the open portal before it takes the
// next passenger. The budget of 2300 ticks of T1.9e is enough as before.
const TICKS = 2300;

interface Run {
  bot: Level01Bot;
  result: HeadlessResult;
  frames: FrameData[];
  logs: string[];
  goalComplete: boolean;
  /** The tick at which the LevelCompleteScreen is the current screen (-1: it never came). */
  levelCompleteAt: number;
  soundNames: (id: number) => string;
  keyOf: (texId: number) => string;
}

let run: Run;

async function play(): Promise<Run> {
  const bot = new Level01Bot();
  const logs: string[] = [];
  let goalComplete = false;
  let levelCompleteAt = -1;
  const result = await runHeadless({
    seed: 12345,
    ticks: TICKS,
    initialState: Level01State,
    input: (t) => {
      const keys = bot.step(t);
      const goal = G.core.getNodes(GoalManagerNode).get(0);
      if (goal != null && goal.goal.isCompleted()) {
        goalComplete = true;
      }

      if (levelCompleteAt < 0 && G.core.getSystem(MenuSystem)?.currentScreen instanceof LevelCompleteScreen) {
        levelCompleteAt = t;
      }

      return keys;
    },
    onLog: (level, msg) => logs.push(level + ': ' + msg),
  });
  const sounds = SoundsSchema.parse(JSON.parse(readFileSync(resolve(assetsRoot, 'sounds.json'), 'utf8')));
  const manifest = JSON.parse(readFileSync(resolve(assetsRoot, 'manifest.json'), 'utf8')) as Manifest;
  return {
    bot,
    result,
    frames: result.frames.map((buf) => readFrame(buf)),
    logs,
    goalComplete,
    levelCompleteAt,
    soundNames: (id) => (sounds.find((s) => s.id === id) as { name: string }).name,
    keyOf: (texId) => (manifest.frames[texId] as { key: string }).key,
  };
}

beforeAll(async () => {
  if (ready) {
    run = await play();
  }
});

describe.skipIf(!ready)('Level01 played by a pilot who presses keys', () => {
  it('two passengers are delivered, the goal opens the portal, the shuttle flies into it: level complete', () => {
    const { bot } = run;
    expect(bot.deliveredAt).toHaveLength(2);
    expect(run.goalComplete).toBe(true);
    expect(bot.portalFlightAt).toBeGreaterThan(bot.deliveredAt[1] as number);
    expect(bot.portalTookAt).toBeGreaterThan(bot.portalFlightAt);
    expect(run.levelCompleteAt).toBeGreaterThan(bot.portalTookAt); // the LevelCompleteScreen comes after the fade
    expect(run.logs.filter((l) => l.startsWith('error'))).toEqual([]);
    expect(run.logs.filter((l) => l.startsWith('warn'))).toEqual([]);
  });

  it('the flight is a flight, not a crash: the hull is whole, the fuel lasts, the level is Level01', () => {
    expect(run.bot.minHull).toBeGreaterThan(0.5);
    expect(run.bot.minFuel).toBeGreaterThan(0.3);
    // (until the level complete screen: it clears the level, the frames after it have no level group)
    expect(run.levelCompleteAt).toBeGreaterThan(0);
    expect(run.frames.slice(0, run.levelCompleteAt - 1).every((f) => f.levelGroup === 1)).toBe(true);
  });

  it('every frame is the level and the HUD: the glyphs of the labels are in the Frame', () => {
    const middle = run.frames[1000] as FrameData;
    const keys = middle.nodes.map((n) => run.keyOf(n.texId));
    expect(keys.filter((k) => k.startsWith('Font:')).length).toBeGreaterThan(3); // 0/2, the lives, the coins
    for (const wanted of ['PassengerBar_mc#', 'ShuttleBarLeftBG_mc#', 'LivesIcon_mc#', 'CoinsIcon_mc#', 'TitleLevel_mc#']) {
      expect(keys.some((k) => k.startsWith(wanted)), wanted).toBe(true);
    }

    expect(keys.some((k) => k.startsWith('Level01BG_mc#'))).toBe(true);
    expect(keys.some((k) => k.startsWith('Shuttle01Body_mc#'))).toBe(true);
  });

  it('the sounds of the engine, the passengers and the portal are in the frames; the pan follows the shuttle', () => {
    const heard = new Set<string>();
    const enginePans: number[] = [];
    for (const f of run.frames) {
      for (const o of f.oneShots) heard.add(run.soundNames(o.soundId));
      for (const l of f.loops) {
        const name = run.soundNames(l.soundId);
        heard.add(name);
        if (name === 'SndEngineGas') enginePans.push(l.pan);
      }
    }

    for (const wanted of [
      'SndShuttleSpawn',
      'SndEngineGas',
      'SndPassengerComeIn',
      'SndLoadPassenger',
      'SndPassengerComeOut',
      'SndPortalOpen',
      'SndPortalIdle',
      'SndPortalAction',
    ]) {
      expect(heard.has(wanted), wanted).toBe(true);
    }

    // the coins of the fare: one of the three sounds (AntMath.random picks it, the pick depends on the PRNG sequence)
    expect(['SndSpawnCoin01', 'SndSpawnCoin02', 'SndSpawnCoin03'].some((n) => heard.has(n))).toBe(true);

    // the shuttle flies from the left platform to the right one and back: the pan goes from left to right
    expect(Math.min(...enginePans)).toBeLessThan(-10);
    expect(Math.max(...enginePans)).toBeGreaterThan(10);
  });

  it('the run is deterministic: the same seed and the same pilot give the same frames', async () => {
    const again = await play();
    expect(again.result.hashes).toEqual(run.result.hashes);
    expect(again.bot.deliveredAt).toEqual(run.bot.deliveredAt);
  });
});
