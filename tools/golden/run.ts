// Not a port. `tsx tools/golden/run.ts <name>`: plays one golden replay in this process and prints its hashes as JSON.
// tests/golden/golden.test.ts runs it in a second process to check that the hashes do not depend on the process.

import { runReplay } from '../../src/sim/headless';
import { loadReplays } from '../../tests/golden/registry';

async function main(): Promise<void> {
  const name = process.argv[2];
  const item = loadReplays().find((r) => r.name === name);
  if (item === undefined) {
    console.error('no such replay: ' + String(name));
    process.exit(1);
  }

  const result = await runReplay(item.replay);
  console.log(JSON.stringify({ hashes: result.hashes, keys: result.keys, errors: result.stats.errors }));
}

void main();
