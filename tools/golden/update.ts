// Not a port. `npm run golden:update -- <name>|--all`: runs the golden replays and overwrites their expected files
// (tests/golden/expected/<name>.json). docs/05-verification.md §4: only with a reason ("the port was fixed: ..."), and never in T4.3.

import { mkdirSync } from 'node:fs';
import { runReplay } from '../../src/sim/headless';
import { EXPECTED_DIR, loadReplays, makeExpected, readExpected, writeExpected } from '../../tests/golden/registry';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const all = loadReplays();
  if (args.length === 0) {
    console.error('usage: npm run golden:update -- <name> [<name>...] | --all\nreplays: ' + all.map((r) => r.name).join(', '));
    process.exit(1);
  }

  const wanted = args.includes('--all') ? all : args.map((n) => all.find((r) => r.name === n) ?? null);
  const missing = args.filter((n, i) => n !== '--all' && wanted[i] === null);
  if (missing.length > 0) {
    console.error('no such replay: ' + missing.join(', '));
    process.exit(1);
  }

  mkdirSync(EXPECTED_DIR, { recursive: true });
  console.log('!!! OVERWRITING the golden hashes. Commit this only with a reason (the port was fixed: what and why).');
  let changed = 0;
  for (const item of wanted) {
    if (item === null) continue;
    const result = await runReplay(item.replay);
    if (result.stats.errors.length > 0) {
      console.error(`${item.name}: the log has errors, the expected file is not written:\n  ` + result.stats.errors.join('\n  '));
      process.exit(1);
    }

    const before = readExpected(item.name);
    const same = before !== null && JSON.stringify(before.hashes) === JSON.stringify(result.hashes);
    writeExpected(makeExpected(item.name, result));
    if (!same) changed++;
    console.log(`${same ? 'unchanged' : before === null ? 'CREATED  ' : 'CHANGED  '} ${item.name}: ${result.hashes.length} checkpoints`);
  }

  console.log(`done: ${changed} of ${wanted.length} expected files are new or changed`);
}

void main();
