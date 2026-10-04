// Not a port. Messages between the renderer (src/app/SimClient.ts) and the sim worker (src/sim/worker.ts),
// docs/01-architecture.md §1, §7.

import type { InputSnapshot } from '../engine/input/InputSnapshot';
import type { OnlineEvent, OnlineRequest } from '../game/online/OnlineBridge';
import type { PerfSample } from './perfProbe';
import type { Replay } from './replay';

export type SimLogLevel = 'info' | 'warn' | 'error';

/** renderer -> worker */
export type SimIn =
  /** `assetBase`: URL of the assets root, e.g. `app://assets/`. */
  | { t: 'init'; seed: number; assetBase: string; perf?: boolean }
  /** The last snapshot of the local input (the worker keeps the last one, wheel deltas are summed up). */
  | { t: 'input'; snapshot: InputSnapshot }
  /** Answer to `{t:'saveLoad'}`; `data` is null when nothing is stored under the key. */
  | { t: 'saveLoaded'; key: string; data: unknown }
  /** MessagePort of the network bridge of the host goes in the transfer list (T3.2, sim/HostBridge.ts). */
  | { t: 'simPort' }
  /** The answer of the renderer to a request of the screens of the LAN game (T3.4, game/online/OnlineBridge.ts). */
  | { t: 'online'; ev: OnlineEvent }
  /** Commands: `freeze` [bool] (the settings panel), dev: `startLevel` [levelName], `setTimeScale` [k], `recordStart`, `recordStop`. */
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
  /** The Quality switch of the pause: `smooth` is `linear` (true) or `nearest` (false) filtering of the atlases. */
  | { t: 'quality'; smooth: boolean }
  /**
   * A request of the screens of the LAN game (T3.4): the host starts and stops, the scan of the LAN, and
   * `{k:'joinRequest', host, port}` - the renderer then stops this worker and starts the client session (T3.3).
   */
  | { t: 'online'; req: OnlineRequest }
  /** T4.1: the replay of a recording that has stopped (`recordStop`, F9 of the dev build). */
  | { t: 'replay'; replay: Replay }
  /** T4.3 (`--perf-log`): the measurement of the last 35 ticks. */
  | { t: 'perf'; sample: PerfSample }
  | { t: 'log'; level: SimLogLevel; msg: string }
  | { t: 'ready' };
