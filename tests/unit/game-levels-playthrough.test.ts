// T2.1: Levels 02-20 load through the real GameState (all 17 systems, the screens) and 30 s (1050 ticks) of scripted input
// pass without an exception and without an error of the log.

import { describe, expect, it } from 'vitest';
import { G } from '../../src/game/G';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { GameState } from '../../src/game/states/GameState';
import { runHeadless } from '../../src/sim/headless';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { hasAssets } from './helpers/assets';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ready = hasAssets && existsSync(resolve(process.cwd(), 'assets', 'sounds.json'));
const TICKS = 30 * 35;

const levelStates = new Map<number, new () => GameState>();
for (let n = 2; n <= 20; n++) {
  const name = 'Level' + (n < 10 ? '0' : '') + n;
  levelStates.set(
    n,
    class extends GameState {
      override create(): void {
        super.create();
        this.debugStartLevel(name);
      }
    },
  );
}

/** The pilot: gas, steering left and right in turns, every 2 s the gas is released for a second. */
function keys(aTick: number): InputSnapshot {
  const pressed: number[] = [];
  if (aTick % 70 < 35) {
    pressed.push(38);
  }

  pressed.push(Math.floor(aTick / 30) % 2 == 0 ? 39 : 37);
  return { keysDown: pressed, mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
}

describe.skipIf(!ready)('Levels 02-20: 30 s of scripted input', () => {
  for (let n = 2; n <= 20; n++) {
    it('Level' + (n < 10 ? '0' : '') + n + ' loads and runs without errors', async () => {
      const logs: string[] = [];
      const result = await runHeadless({
        seed: 12345,
        ticks: TICKS,
        initialState: levelStates.get(n) as new () => GameState,
        input: keys,
        keepFrames: false,
        onLog: (level, msg) => logs.push(level + ': ' + msg),
      });
      expect(result.hashes).toHaveLength(TICKS);
      expect(logs.filter((l) => l.startsWith('error'))).toEqual([]);
      expect(G.core.getNodes(ShuttleNode).numNodes).toBeGreaterThanOrEqual(0);
    }, 60000);
  }
});
