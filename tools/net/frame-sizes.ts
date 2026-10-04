// Not a port (T3.7). The size of the Frames that the host sends, by level: runs every level headless for 30 s of scripted
// input (gas, steering in turns, the second player flies too) and prints the average and the biggest Frame and what that
// is at 35 Frames/s (the budget of docs/05-verification.md §9: host -> client <= 500 KB/s).
//
//   npx tsx tools/net/frame-sizes.ts [levels, e.g. 11 or 1-20]     (needs `npm run extract` first)

import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { G } from '../../src/game/G';
import { GameState } from '../../src/game/states/GameState';
import { KEY_P2_GAS, KEY_P2_LEFT, KEY_P2_RIGHT } from '../../src/sim/InputRouter';
import { runHeadless } from '../../src/sim/headless';
import { readFrame } from '../../src/frame/FrameReader';

const TICKS = 35 * 30;

function levelState(aN: number): new () => GameState {
  const name = 'Level' + (aN < 10 ? '0' : '') + aN;
  return class extends GameState {
    override create(): void {
      super.create();
      this.debugStartLevel(name);
    }
  };
}

function keys(aTick: number): InputSnapshot {
  const pressed: number[] = [];
  if (aTick % 70 < 35) pressed.push(38);
  pressed.push(Math.floor(aTick / 30) % 2 == 0 ? 39 : 37);
  pressed.push(KEY_P2_GAS, Math.floor(aTick / 45) % 2 == 0 ? KEY_P2_LEFT : KEY_P2_RIGHT);
  return { keysDown: pressed, mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
}

function parseRange(aArg: string | undefined): number[] {
  if (aArg === undefined) return Array.from({ length: 20 }, (_, i) => i + 1);
  const m = /^(\d+)(?:-(\d+))?$/.exec(aArg);
  if (m === null) throw new Error('levels: 11 or 1-20');
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

async function main(): Promise<void> {
  let worst = 0;
  console.log('level  nodes(max)  frame avg  frame max   avg KB/s  max KB/s (at 35 Frames/s)');
  for (const n of parseRange(process.argv[2])) {
    const r = await runHeadless({ seed: 12345, ticks: TICKS, initialState: levelState(n), input: keys });
    let sum = 0;
    let max = 0;
    let nodes = 0;
    for (const f of r.frames) {
      sum += f.byteLength;
      max = Math.max(max, f.byteLength);
      nodes = Math.max(nodes, readFrame(f).nodes.length);
    }
    const avg = sum / r.frames.length;
    worst = Math.max(worst, (max * 35) / 1024);
    console.log(
      `${String(n).padStart(5)}  ${String(nodes).padStart(10)}  ${avg.toFixed(0).padStart(9)}  ${String(max).padStart(9)}  ${((avg * 35) / 1024).toFixed(1).padStart(9)}  ${((max * 35) / 1024).toFixed(1).padStart(8)}`,
    );
    G.physics?.stop();
  }

  console.log(`worst case (the biggest Frame sent 35 times a second): ${worst.toFixed(1)} KB/s`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
