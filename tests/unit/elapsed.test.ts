// FIX-5: the time step of the game. The original sets AntG.fixedElapsed = true and AntG.maxElapsed = 0.0333 in PrepareState, so
// every tick of the game is 0.0333 s whatever the real frame time (Anthill.enterFrameHandler). The port had 1/35 s, which
// made the steering, the fuel burn and every other time-based quantity 1.17 times slower than the recording of the original
// in Ruffle (tools/parity/video.ts, docs/05 §5).

import { describe, expect, it } from 'vitest';
import { AntG } from '../../src/engine/core/AntG';
import { GameState } from '../../src/game/states/GameState';
import { runHeadless } from '../../src/sim/headless';
import { hasAssets } from './helpers/assets';

class PlainState extends GameState {}

describe.skipIf(!hasAssets)('AntG.elapsed', () => {
  it('a run that starts with the game state has the fixed step of PrepareState: 0.0333 s per tick', async () => {
    const seen: number[] = [];
    await runHeadless({ seed: 1, ticks: 3, initialState: PlainState, keepFrames: false, afterTick: () => seen.push(AntG.elapsed) });
    expect(seen).toEqual([0.0333, 0.0333, 0.0333]);
  });

  it('the real first state (PrepareState) gives the same step', async () => {
    const seen: number[] = [];
    await runHeadless({ seed: 1, ticks: 3, keepFrames: false, afterTick: () => seen.push(AntG.elapsed) });
    expect(seen).toEqual([0.0333, 0.0333, 0.0333]);
  });

  it('timeScale multiplies the step', async () => {
    const seen: number[] = [];
    await runHeadless({
      seed: 1,
      ticks: 2,
      initialState: PlainState,
      keepFrames: false,
      afterTick: (tick) => {
        seen.push(AntG.elapsed);
        AntG.timeScale = tick === 0 ? 0.5 : 1;
      },
    });
    expect(seen[0]).toBe(0.0333);
    expect(seen[1]).toBeCloseTo(0.01665, 10);
    AntG.timeScale = 1;
  });
});
