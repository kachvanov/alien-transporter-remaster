// Not a port. The sim worker (docs/01-architecture.md §1, §3): GameLoop at 35 Hz, protocol of src/sim/protocol.ts.
//
// The loop is `setInterval(() => loop.pump(performance.now()), 4)`: no requestAnimationFrame in a worker.

import { FetchAssetSource } from '../engine/assets/AssetSource';
import { GameLoop } from './GameLoop';
import type { SimIn, SimLogLevel, SimOut } from './protocol';
import { WorkerSaveStorage } from './SaveStorage';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<SimIn>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const PUMP_INTERVAL_MS = 4;

function post(msg: SimOut, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

function log(level: SimLogLevel, msg: string): void {
  post({ t: 'log', level, msg });
}

let loop: GameLoop | null = null;
let save: WorkerSaveStorage | null = null;
let starting = false;
// STUB(T3.2): the MessagePort of the network bridge is only kept (the bridge reads it).
export let simPort: MessagePort | null = null;
/** Messages that arrive while `init()` is loading (input, commands) are applied when it has finished. */
const early: SimIn[] = [];

async function start(seed: number, assetBase: string): Promise<void> {
  const storage = new WorkerSaveStorage(post);
  save = storage;
  const gameLoop = new GameLoop({
    assets: new FetchAssetSource(assetBase),
    save: storage,
    seed,
    host: {
      onFrame: (buf) => post({ t: 'frame', buf }, [buf]),
      openExternal: (url) => post({ t: 'openExternal', url }),
      onQuality: (smooth) => post({ t: 'quality', smooth }),
      log,
    },
  });
  await gameLoop.init();
  loop = gameLoop;
  for (const msg of early.splice(0)) handle(msg);
  post({ t: 'ready' });
  setInterval(() => {
    gameLoop.pump(performance.now());
  }, PUMP_INTERVAL_MS);
}

function handle(msg: SimIn): void {
  switch (msg.t) {
    case 'init':
      if (starting) return;
      starting = true;
      start(msg.seed, msg.assetBase).catch((e: unknown) => log('error', 'sim init failed: ' + String(e)));
      break;
    case 'input':
      if (loop === null) early.push(msg);
      else loop.input.setLocal(msg.snapshot);
      break;
    case 'saveLoaded':
      save?.handleLoaded(msg.key, msg.data);
      break;
    case 'cmd':
      if (loop === null) early.push(msg);
      else loop.command(msg.name, msg.args);
      break;
    case 'simPort':
      break; // taken from the event in onmessage
  }
}

scope.onmessage = (ev) => {
  if (ev.data.t === 'simPort') {
    simPort = ev.ports[0] ?? null;
    return;
  }
  handle(ev.data);
};
