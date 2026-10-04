// Not a port. The scripted replays of T4.1 (docs/05-verification.md §4).
//
// - `idle-then-gas` of every level (`levelNN-idle-then-gas`): the keys are a function of the tick, the replay is made in memory.
// - The scenario replays (`level01-deliver`, `level11-barrels`, `level13-sensor`) are flown by a pilot that reads the game
//   (BOT_SCRIPTS); `npm run golden:record` saves the keys it pressed to tests/golden/replays/<name>.json and the tests play that file,
//   so a change of the pilot never changes a replay by itself.

import type { Replay } from '../../../src/sim/replay';
import { scriptToReplay } from '../../../src/sim/replay';
import { idleThenGas, GAS_TICKS, IDLE_TICKS, levelName } from './idle-then-gas';
import { Level01Bot } from './level01-bot';
import { WaypointBot } from './waypoint-bot';
import type { WaypointStop } from './waypoint-bot';

export interface NamedReplay {
  name: string;
  replay: Replay;
}

/** `level01-idle-then-gas` .. `level20-idle-then-gas`. */
export function idleThenGasReplays(): NamedReplay[] {
  const out: NamedReplay[] = [];
  for (let n = 1; n <= 20; n++) {
    const level = levelName(n);
    out.push({
      name: level.toLowerCase() + '-idle-then-gas',
      replay: scriptToReplay({ level, ticks: IDLE_TICKS + GAS_TICKS, keys: idleThenGas }),
    });
  }

  return out;
}

/** A pilot that reads the game and presses keys: the source of a recorded replay. */
export interface BotScript {
  name: string;
  level: string;
  ticks: number;
  /** A fresh pilot; `keys(tick)` is called once per tick, before the tick, in order. */
  makeKeys(): (aTick: number) => number[];
}

function waypointScript(aName: string, aLevel: string, aTicks: number, aRoute: WaypointStop[]): BotScript {
  return {
    name: aName,
    level: aLevel,
    ticks: aTicks,
    makeKeys: () => {
      const bot = new WaypointBot(aRoute);
      return (tick) => bot.step(tick);
    },
  };
}

export const BOT_SCRIPTS: BotScript[] = [
  // Level01 from the spawn to the portal: two passengers delivered (the bot of T1.9e, the acceptance of M1).
  {
    name: 'level01-deliver',
    level: 'Level01',
    ticks: 2300,
    makeKeys: () => {
      const bot = new Level01Bot();
      return (tick) => bot.step(tick).keysDown;
    },
  },
  // Level11: up the right side to the barrels and hover among them for 40 s: hits of barrels, boxes and rocks, a barrel that blows up.
  waypointScript('level11-barrels', 'Level11', 1400, [
    { x: 372, y: 430 },
    { x: 450, y: 400 },
    { x: 480, y: 330 },
    { x: 520, y: 310, radius: 10 },
  ]),
  // Level13: under the sensor, in its beam: it fires the missiles, the missiles blow up barrels and boxes.
  waypointScript('level13-sensor', 'Level13', 1050, [
    { x: 222, y: 330 },
    { x: 300, y: 300 },
    { x: 358, y: 330, radius: 15 },
  ]),
];
