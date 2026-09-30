// Not a port. TEMPORARY worker of the renderer (T1.7): runs the TestScene at 35 Hz and posts the frames.
// T1.6 (GameLoop, SimClient) and T1.9e replace it; src/sim/worker.ts stays untouched for them.
//
// Messages out: `{ type: 'tick', n }` (the scaffold contract) and `{ type: 'frame', buffer }` (transferred).
// Messages in: `{ type: 'input', snapshot }` (ignored for now).

import { AssetRegistry } from '../engine/assets/AssetRegistry';
import { FetchAssetSource } from '../engine/assets/AssetSource';
import { TestScene } from './TestScene';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const TICK_MS = 1000 / 35;

async function main(): Promise<void> {
  const registry = new AssetRegistry(new FetchAssetSource('app://assets/'));
  await registry.load();
  const scene = new TestScene();

  // Fixed-step accumulator (the same idea as the GameLoop of docs/01 §3): 4 ms pump, at most 3 ticks per pump.
  let last = performance.now();
  let acc = 0;
  let n = 0;
  let cost = 0;
  setInterval(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    let steps = 0;
    while (acc >= TICK_MS && steps < 3) {
      acc -= TICK_MS;
      steps++;
      const t0 = performance.now();
      const buffer = scene.tick(cost);
      cost = Math.round((performance.now() - t0) * 100);
      n++;
      scope.postMessage({ type: 'frame', buffer }, [buffer]);
      scope.postMessage({ type: 'tick', n });
    }
    if (steps === 3) acc = 0;
  }, 4);
}

void main().catch((e: unknown) => {
  scope.postMessage({ type: 'error', message: String(e) });
});
