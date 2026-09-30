// Not a port. Messages between the renderer (src/app/SimClient.ts) and the sim worker (src/sim/worker.ts),
// docs/01-architecture.md §1, §7.

import type { InputSnapshot } from '../engine/input/InputSnapshot';

export type SimLogLevel = 'info' | 'warn' | 'error';

/** renderer -> worker */
export type SimIn =
  /** `assetBase`: URL of the assets root, e.g. `app://assets/`. */
  | { t: 'init'; seed: number; assetBase: string }
  /** The last snapshot of the local input (the worker keeps the last one, wheel deltas are summed up). */
  | { t: 'input'; snapshot: InputSnapshot }
  /** Answer to `{t:'saveLoad'}`; `data` is null when nothing is stored under the key. */
  | { t: 'saveLoaded'; key: string; data: unknown }
  /** MessagePort of the network bridge goes in the transfer list (STUB(T3.2): the worker only keeps it). */
  | { t: 'simPort' }
  /** Dev commands: `startLevel` [levelName], `setTimeScale` [k], `recordStart`, `recordStop`. */
  | { t: 'cmd'; name: string; args?: unknown[] };

/** worker -> renderer */
export type SimOut =
  /** The Frame of one tick; `buf` is transferred. */
  | { t: 'frame'; buf: ArrayBuffer }
  /** Write `data` (null = delete) under `key`. */
  | { t: 'save'; key: string; data: unknown }
  /** DEVIATION: request of a save key (the card lists only `save`/`saveLoaded`); the answer is `saveLoaded`. */
  | { t: 'saveLoad'; key: string }
  | { t: 'openExternal'; url: string }
  | { t: 'log'; level: SimLogLevel; msg: string }
  | { t: 'ready' };
