// Not a port. The set of the golden replays of T4.1 and their expected hashes: used by golden.test.ts and by the tools
// `npm run golden:update` / `golden:record` (tools/golden/).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HASH_INTERVAL, parseReplay } from '../../src/sim/replay';
import type { ReplayResult } from '../../src/sim/headless';
import type { Replay } from '../../src/sim/replay';
import { idleThenGasReplays } from './scripts';
import type { NamedReplay } from './scripts';

const GOLDEN_DIR = resolve(process.cwd(), 'tests', 'golden');
export const REPLAYS_DIR = resolve(GOLDEN_DIR, 'replays');
export const EXPECTED_DIR = resolve(GOLDEN_DIR, 'expected');

/** `tests/golden/expected/<name>.json`. */
export interface Expected {
  name: string;
  /** HASH_INTERVAL when the file was made: a changed interval invalidates the files. */
  interval: number;
  ticks: number;
  /** The tick counts of the checkpoints (35, 70, ...). */
  checkpoints: number[];
  hashes: string[];
  /** The key numbers at the checkpoints (the explanation of a mismatch, not compared when the hash is the same). */
  keys: Record<string, number>[];
}

/** The replays of the scripts (made in memory) and the files of tests/golden/replays/, by name. */
export function loadReplays(): NamedReplay[] {
  const out = idleThenGasReplays();
  const files = existsSync(REPLAYS_DIR) ? readdirSync(REPLAYS_DIR).filter((f) => f.endsWith('.json')) : [];
  for (const file of files.sort()) {
    const name = file.slice(0, -'.json'.length);
    out.push({ name, replay: loadReplayFile(resolve(REPLAYS_DIR, file)) });
  }

  const seen = new Set<string>();
  for (const r of out) {
    if (seen.has(r.name)) throw new Error('two golden replays are named ' + r.name);
    seen.add(r.name);
  }

  return out;
}

export function loadReplayFile(aPath: string): Replay {
  return parseReplay(JSON.parse(readFileSync(aPath, 'utf8')));
}

export function expectedPath(aName: string): string {
  return resolve(EXPECTED_DIR, aName + '.json');
}

export function readExpected(aName: string): Expected | null {
  const path = expectedPath(aName);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Expected) : null;
}

export function makeExpected(aName: string, aResult: ReplayResult): Expected {
  return {
    name: aName,
    interval: HASH_INTERVAL,
    ticks: aResult.stats.ticks,
    checkpoints: aResult.checkpoints,
    hashes: aResult.hashes,
    keys: aResult.keys,
  };
}

export function writeExpected(aExpected: Expected): void {
  const text =
    `{\n  "name": ${JSON.stringify(aExpected.name)},\n  "interval": ${aExpected.interval},\n  "ticks": ${aExpected.ticks},\n` +
    `  "checkpoints": ${JSON.stringify(aExpected.checkpoints)},\n  "hashes": ${JSON.stringify(aExpected.hashes)},\n` +
    `  "keys": ${JSON.stringify(aExpected.keys)}\n}\n`;
  writeFileSync(expectedPath(aExpected.name), text, 'utf8');
}

/**
 * Compares a run with its expected file. Returns '' when they are the same; else a report: the first checkpoint
 * that differs (the block of ticks in which the run left the golden one) and the key numbers that differ there.
 */
export function compareWithExpected(aExpected: Expected, aResult: ReplayResult): string {
  const lines: string[] = [];
  if (aExpected.interval !== HASH_INTERVAL) {
    return `the expected file has the hash interval ${aExpected.interval}, the code has ${HASH_INTERVAL}: run npm run golden:update`;
  }

  if (aExpected.hashes.length !== aResult.hashes.length) {
    lines.push(`number of checkpoints: expected ${aExpected.hashes.length}, got ${aResult.hashes.length}`);
  }

  const n = Math.min(aExpected.hashes.length, aResult.hashes.length);
  for (let i = 0; i < n; i++) {
    if (aExpected.hashes[i] !== aResult.hashes[i]) {
      const to = aResult.checkpoints[i] as number;
      const from = i === 0 ? 0 : (aResult.checkpoints[i - 1] as number);
      lines.push(`first different block: ticks ${from + 1}..${to} (checkpoint ${i + 1} of ${n})`);
      const want = aExpected.keys[i] ?? {};
      const got = aResult.keys[i] ?? {};
      const names = Array.from(new Set([...Object.keys(want), ...Object.keys(got)]));
      let differ = 0;
      for (const key of names) {
        if (want[key] !== got[key]) {
          lines.push(`  ${key}: expected ${String(want[key])}, got ${String(got[key])}`);
          differ++;
        }
      }

      if (differ === 0) {
        lines.push('  the key numbers are the same: the bodies of the world differ (positions, angles, velocities)');
      }

      break;
    }
  }

  return lines.join('\n');
}
