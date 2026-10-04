// T4.1: golden replays (docs/05-verification.md §4). Every replay is played headless and the hash of the state of the world after
// every 35 ticks is compared with tests/golden/expected/<name>.json. A mismatch shows the first block of ticks that differs and the
// key numbers (fuel, hull, coins, ...) that moved. The files are changed only by `npm run golden:update` (with a reason).
// Also here: the determinism check (one replay twice in one process, and in a second process).

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runReplay } from '../../src/sim/headless';
import { hasAssets } from '../unit/helpers/assets';
import { compareWithExpected, expectedPath, loadReplays, readExpected } from './registry';

const replays = loadReplays();

describe('golden set', () => {
  it('has at least 23 replays: 20 idle-then-gas and the 3 scenarios', () => {
    const names = replays.map((r) => r.name);
    for (let n = 1; n <= 20; n++) {
      expect(names).toContain('level' + (n < 10 ? '0' : '') + n + '-idle-then-gas');
    }

    expect(names).toEqual(expect.arrayContaining(['level01-deliver', 'level11-barrels', 'level13-sensor']));
    expect(replays.length).toBeGreaterThanOrEqual(23);
  });
});

describe.skipIf(!hasAssets)('golden replays', () => {
  for (const { name, replay } of replays) {
    it(name, async () => {
      const expected = readExpected(name);
      if (expected === null) {
        throw new Error(`${expectedPath(name)} is missing: run npm run golden:update -- ${name}`);
      }

      const result = await runReplay(replay);
      expect(result.stats.errors).toEqual([]);
      expect(result.hashes).toHaveLength(Math.ceil(replay.ticks / 35));
      expect(compareWithExpected(expected, result), `${name} left the golden run`).toBe('');
    }, 60000);
  }
});

describe.skipIf(!hasAssets)('determinism', () => {
  const pick = replays.find((r) => r.name === 'level13-sensor') ?? (replays[0] as (typeof replays)[number]);

  it('one replay twice in one process gives the same hashes (and a run of another level in between changes nothing)', async () => {
    const a = await runReplay(pick.replay);
    const other = replays.find((r) => r.name === 'level05-idle-then-gas') ?? (replays[1] as (typeof replays)[number]);
    await runReplay(other.replay);
    const b = await runReplay(pick.replay);
    expect(b.hashes).toEqual(a.hashes);
    expect(b.keys).toEqual(a.keys);
  }, 60000);

  it('the same replay in a second process (alone, a fresh process) gives the same hashes', async () => {
    const here = await runReplay(pick.replay);
    const out = execFileSync(process.execPath, ['--import', 'tsx', 'tools/golden/run.ts', pick.name], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const there = JSON.parse(out.trim().split('\n').pop() as string) as { hashes: string[]; keys: Record<string, number>[] };
    expect(there.hashes).toEqual(here.hashes);
    expect(there.keys).toEqual(here.keys);
  }, 120000);
});
