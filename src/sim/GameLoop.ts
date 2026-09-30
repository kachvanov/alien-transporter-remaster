// Not a port. The fixed-step game loop of the simulation (docs/01-architecture.md §3): 35 ticks per second,
// the same code in the Web Worker (src/sim/worker.ts) and in Node (src/sim/headless.ts).
//
// One tick is `Anthill.tick(snapshot)`: AntG.elapsed = 1/35 * timeScale, input, sounds, state update, cameras,
// the render point (FrameWriter.write), plugins (G.physics, G.core, ...). The Frame is the result.
// `performance.now()` is read only here (the tick cost of the frame header) and in worker.ts.

import { AssetRegistry } from '../engine/assets/AssetRegistry';
import type { AssetSource } from '../engine/assets/AssetSource';
import { AntBasic } from '../engine/core/AntBasic';
import { AntG } from '../engine/core/AntG';
import type { AntState } from '../engine/core/AntState';
import { Anthill } from '../engine/core/Anthill';
import type { InputSnapshot } from '../engine/input/InputSnapshot';
import { AntMath } from '../engine/utils/AntMath';
import type { Ctor } from '../engine/utils/types';
import { GameData } from '../game/data/GameData';
import { FrameWriter } from '../frame/FrameWriter';
import { InputRouter } from './InputRouter';
import type { SimLogLevel } from './protocol';
import type { SaveStorage } from './SaveStorage';
import { CachedGameSaveStorage } from './SaveStorage';
import { TestState } from './TestState';

/** Simulation step, ms. */
export const TICK_MS = 1000 / 35;
/** At most this many ticks per pump; when the loop lags behind more, the rest of the time is dropped. */
export const MAX_TICKS_PER_PUMP = 3;
/** Float noise of the accumulator: 35 steps of 1000/35 ms must be exactly 1000 ms. */
const EPSILON_MS = 1e-6;

/** What the loop needs from its host (the worker, the headless runner, a test). */
export interface HostApi {
  /** A Frame of a tick that `pump()` made (the buffer is the callee's). */
  onFrame(buf: ArrayBuffer): void;
  openExternal(url: string): void;
  log(level: SimLogLevel, msg: string): void;
}

export interface GameLoopOptions {
  assets: AssetSource;
  save: SaveStorage;
  seed: number;
  host: HostApi;
  /** STUB(T1.9e): the initial state; the real GameState/PrepareState replaces the default TestState. */
  initialState?: Ctor<AntState>;
  /** `levelGroup` of the frame header (1..20). STUB(T1.9e): the level state sets it. */
  levelGroup?: number;
  /** Clock of the tick cost measurement, ms. Default `performance.now()`; headless runs pass `() => 0`. */
  clock?: () => number;
}

export interface Recording {
  seed: number;
  inputs: InputSnapshot[];
}

export class GameLoop {
  readonly input = new InputRouter();

  private readonly _opts: GameLoopOptions;
  private readonly _clock: () => number;
  private _anthill: Anthill | null = null;
  private _writer: FrameWriter | null = null;
  private _frame: ArrayBuffer | null = null;
  private _tick = 0;
  private _tickCost = 0;
  private _acc = 0;
  private _last = -1;
  private _sceneReset = true;
  private _recording: Recording | null = null;

  /** The 1..20 level group of the frame header. */
  levelGroup: number;
  /** The recording of the last `recordStop` (STUB(T4.1): the replay format and its files). */
  lastRecording: Recording | null = null;

  constructor(aOpts: GameLoopOptions) {
    this._opts = aOpts;
    this._clock = aOpts.clock ?? (() => performance.now());
    this.levelGroup = aOpts.levelGroup ?? 1;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** Loads the assets, seeds the PRNG, preloads the save, creates the Anthill and the initial state. */
  async init(): Promise<void> {
    const opts = this._opts;
    const registry = new AssetRegistry(opts.assets);
    await registry.load();

    const cache = new CachedGameSaveStorage(opts.save, (e) => opts.host.log('error', 'save failed: ' + String(e)));
    await cache.preload([GameData.SAVE_KEY]);
    GameData.storage = cache;

    // Everything that makes a run reproducible is reset here (the statics live as long as the process).
    AntBasic.resetEntityIds();
    AntMath.seed(opts.seed);
    this._tick = 0;
    this._tickCost = 0;
    this._acc = 0;
    this._last = -1;
    this._sceneReset = true;
    this._recording = null;
    this._writer = new FrameWriter();

    this._anthill = new Anthill(opts.initialState ?? TestState, false, {
      onRender: () => this.renderFrame(),
    });
    AntG.onOpenUrl = (url) => opts.host.openExternal(url);
    AntG.timeScale = 1;
  }

  /** The next frame makes every node teleport (screen or level change). */
  requestSceneReset(): void {
    this._sceneReset = true;
  }

  get tickCount(): number {
    return this._tick;
  }

  get inited(): boolean {
    return this._anthill !== null;
  }

  /** One tick with the given input; returns the Frame (docs/01 §3). */
  tick(aInput: InputSnapshot): ArrayBuffer {
    const anthill = this._anthill;
    if (anthill === null) {
      throw new Error('GameLoop.tick(): init() has not finished.');
    }
    if (this._recording !== null) {
      this._recording.inputs.push(aInput);
    }
    const t0 = this._clock();
    anthill.tick(aInput);
    this._tickCost = Math.max(0, Math.round((this._clock() - t0) * 100));
    this._tick++;
    const frame = this._frame;
    this._frame = null;
    if (frame === null) {
      throw new Error('GameLoop.tick(): the render point produced no frame (no camera or no state).');
    }
    return frame;
  }

  /**
   * The accumulator: called every few ms with the current time. Makes the ticks that are due (at most
   * MAX_TICKS_PER_PUMP, the time that is left over after that is dropped), hands every Frame to
   * `host.onFrame` and returns the number of ticks. The first call only takes the time.
   */
  pump(aNowMs: number): number {
    if (this._anthill === null) {
      return 0;
    }
    if (this._last < 0) {
      this._last = aNowMs;
      return 0;
    }
    this._acc += aNowMs - this._last;
    this._last = aNowMs;

    let steps = 0;
    while (this._acc + EPSILON_MS >= TICK_MS && steps < MAX_TICKS_PER_PUMP) {
      this._acc -= TICK_MS;
      steps++;
      this._opts.host.onFrame(this.tick(this.input.compose()));
    }
    if (this._acc + EPSILON_MS >= TICK_MS) {
      this._acc = 0;
    }
    return steps;
  }

  /** Dev commands of the worker protocol (`{t:'cmd'}`). */
  command(aName: string, aArgs: readonly unknown[] = []): void {
    const host = this._opts.host;
    switch (aName) {
      case 'setTimeScale': {
        const k = Number(aArgs[0]);
        if (Number.isFinite(k) && k >= 0) {
          AntG.timeScale = k;
        } else {
          host.log('warn', 'setTimeScale: bad argument ' + String(aArgs[0]));
        }
        break;
      }
      case 'startLevel':
        // STUB(T1.9e): GameState / PrepareState start the level.
        host.log('warn', 'startLevel(' + String(aArgs[0]) + '): not implemented yet');
        break;
      case 'recordStart':
        this._recording = { seed: this._opts.seed, inputs: [] };
        host.log('info', 'recording started');
        break;
      case 'recordStop': {
        const rec = this._recording;
        this._recording = null;
        host.log('info', rec === null ? 'not recording' : `recording stopped: ${rec.inputs.length} ticks`);
        this.lastRecording = rec;
        break;
      }
      default:
        host.log('warn', 'unknown command: ' + aName);
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  /** The render point (docs/01 §3, step 3): serialises the scene. */
  private renderFrame(): void {
    const anthill = this._anthill as Anthill;
    const camera = AntG.camera;
    const state = anthill.state;
    if (camera === null || state === null) {
      return;
    }
    const reset = this._sceneReset;
    this._sceneReset = false;
    // TODO(T1.9e): paused / audio / debugLines of the real GameState (G.gamePause, AntG.sounds, G.physics).
    this._frame = (this._writer as FrameWriter).write({
      root: state.defGroup,
      camera,
      tick: this._tick,
      levelGroup: this.levelGroup,
      tickCost: this._tickCost,
      sceneReset: reset,
    });
  }
}
