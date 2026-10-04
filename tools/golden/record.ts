// Not a port. `npm run golden:record -- <name>|--all`: flies the scenario replays with their pilot (tests/golden/scripts/index.ts,
// BOT_SCRIPTS) and saves the keys it pressed to tests/golden/replays/<name>.json. Then `npm run golden:update -- <name>`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runHeadless } from '../../src/sim/headless';
import { DEFAULT_SHIP, scriptToReplay, stringifyReplay } from '../../src/sim/replay';
import { makeReplayState } from '../../src/sim/replayState';
import { REPLAYS_DIR } from '../../tests/golden/registry';
import { BOT_SCRIPTS } from '../../tests/golden/scripts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: npm run golden:record -- <name> | --all\nscenarios: ' + BOT_SCRIPTS.map((s) => s.name).join(', '));
    process.exit(1);
  }

  const wanted = args.includes('--all') ? BOT_SCRIPTS : BOT_SCRIPTS.filter((s) => args.includes(s.name));
  if (wanted.length === 0) {
    console.error('no such scenario: ' + args.join(', '));
    process.exit(1);
  }

  mkdirSync(REPLAYS_DIR, { recursive: true });
  for (const script of wanted) {
    const base = { level: script.level, casualMode: true, ship: DEFAULT_SHIP };
    const pilot = script.makeKeys();
    const keysOfTick: number[][] = [];
    await runHeadless({
      seed: 12345,
      ticks: script.ticks,
      initialState: makeReplayState(base),
      input: (tick) => {
        const keys = pilot(tick);
        keysOfTick.push(keys);
        return { keysDown: keys.slice(), mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
      },
      keepFrames: false,
    });
    const replay = scriptToReplay({ ...base, ticks: script.ticks, keys: (t) => keysOfTick[t] as number[] });
    const path = resolve(REPLAYS_DIR, script.name + '.json');
    writeFileSync(path, stringifyReplay(replay), 'utf8');
    console.log(`recorded ${script.name}: ${replay.ticks} ticks, ${replay.inputs.length} key changes -> ${path}`);
  }
}

void main();
