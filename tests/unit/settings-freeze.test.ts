// T2.8: while the F2 panel is open the renderer stops the simulation with the command `freeze` (the worker pump makes no
// ticks) and lets it run again afterwards, without a burst of ticks to catch up.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../src/sim/headless';
import { TICK_MS } from '../../src/sim/GameLoop';
import { Level01State } from '../golden/scripts/level01-bot';
import { hasAssets } from './helpers/assets';

const ready = hasAssets && existsSync(resolve(process.cwd(), 'assets', 'sounds.json'));

describe.skipIf(!ready)('the simulation frozen by the settings panel', () => {
  it('pump() makes no ticks while frozen, and no catch-up burst after it', async () => {
    const { loop } = await runHeadless({ seed: 4242, ticks: 5, initialState: Level01State, keepFrames: false });
    const ticks = loop.tickCount;
    expect(loop.pump(0)).toBe(0); // the first call only takes the time
    expect(loop.pump(TICK_MS * 2)).toBe(2);
    expect(loop.tickCount).toBe(ticks + 2);

    loop.command('freeze', [true]);
    for (let t = 1; t <= 50; t++) expect(loop.pump(TICK_MS * 2 + t * 100)).toBe(0); // five seconds
    expect(loop.tickCount).toBe(ticks + 2);

    loop.command('freeze', [false]);
    const resumed = TICK_MS * 2 + 5000;
    expect(loop.pump(resumed)).toBe(0); // (the time of the pause is dropped, not owed)
    expect(loop.pump(resumed + TICK_MS)).toBe(1);
    expect(loop.tickCount).toBe(ticks + 3);
  }, 60_000);
});
