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
import { AntEffectManager } from '../engine/effects/AntEffectManager';
import type { InputSnapshot } from '../engine/input/InputSnapshot';
import { AntMath } from '../engine/utils/AntMath';
import type { Ctor } from '../engine/utils/types';
import { Config } from '../game/Config';
import { GameData } from '../game/data/GameData';
import { FONT_DATA_NAMES } from '../game/Fonts';
import { G } from '../game/G';
import { Ground } from '../game/map/Ground';
import { GameState } from '../game/states/GameState';
import { PrepareState } from '../game/states/PrepareState';
import { MenuSystem } from '../game/systems/MenuSystem';
import { collectDebugLines, DEBUG_LINE_STRIDE } from '../physics/anthill/debugLines';
import { collectFrameAudio } from '../frame/collectAudio';
import { NO_LEVEL_GROUP } from '../frame/constants';
import { FrameWriter } from '../frame/FrameWriter';
import type { FrameScene } from '../frame/types';
import { InputRouter } from './InputRouter';
import type { SimLogLevel } from './protocol';
import type { SaveStorage } from './SaveStorage';
import { CachedGameSaveStorage } from './SaveStorage';

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
  /** The Quality switch of the pause (T2.7): the renderer sets the filter of the atlas textures (`{t:'quality'}`). */
  onQuality?(smooth: boolean): void;
  log(level: SimLogLevel, msg: string): void;
}

export interface GameLoopOptions {
  assets: AssetSource;
  save: SaveStorage;
  seed: number;
  host: HostApi;
  /** The initial state; default `PrepareState` (it switches to the `GameState` at once). */
  initialState?: Ctor<AntState>;
  /**
   * `levelGroup` of the frame header (1..20) of a loop that runs a state without a level manager (tests);
   * the game reads it from the level that is loaded (`G.levelManager`).
   */
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
  private _screenName: string | null = null;
  private _frozen = false;

  /** The 1..20 level group of the frame header (see GameLoopOptions.levelGroup). */
  levelGroup: number;
  /** The recording of the last `recordStop` (STUB(T4.1): the replay format and its files). */
  lastRecording: Recording | null = null;

  constructor(aOpts: GameLoopOptions) {
    this._opts = aOpts;
    this._clock = aOpts.clock ?? (() => performance.now());
    this.levelGroup = aOpts.levelGroup ?? NO_LEVEL_GROUP;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** Loads the assets, seeds the PRNG, preloads the save, creates the Anthill and the initial state. */
  async init(): Promise<void> {
    const opts = this._opts;
    const registry = new AssetRegistry(opts.assets);
    await registry.load();
    // The data the game reads synchronously: levels, models, fonts, effects, missions, texts (files that the
    // pipeline did not produce are skipped, the getters then throw where the game needs them).
    await registry.loadAllData(FONT_DATA_NAMES);
    // The original registers the effects in PrepareState (loadEmbeddedXML); a run that starts from another initial
    // state (tests, dev) has them too. PrepareState registers them again: addData replaces the effect of a name.
    AntEffectManager.getInstance().loadEmbeddedXML();
    try {
      await registry.loadSounds();
    } catch (e) {
      // the simulation runs without sounds (AntG.sounds then has no catalog and plays nothing)
      opts.host.log('warn', 'sounds.json: ' + String(e));
    }

    const cache = new CachedGameSaveStorage(opts.save, (e) => opts.host.log('error', 'save failed: ' + String(e)));
    await cache.preload([GameData.SAVE_KEY]);
    GameData.storage = cache;

    // Everything that makes a run reproducible is reset here (the statics live as long as the process).
    AntBasic.resetEntityIds();
    AntMath.seed(opts.seed);
    // The ground of the level lives in statics (a body that LevelCore.clear() of the previous level of this process
    // has not cleared when a run is cut off): a new game starts without it, as a new Flash process would.
    Ground.body = null;
    Ground.stopperList = null;
    this._tick = 0;
    this._tickCost = 0;
    this._acc = 0;
    this._last = -1;
    this._sceneReset = true;
    this._recording = null;
    this._screenName = null;
    this._writer = new FrameWriter();

    // AntG.log of the original writes to the debug console; here it goes to the log of the host.
    AntG.log = (aMessage: string, aType = 'data'): void => opts.host.log(aType === 'error' ? 'error' : 'info', aMessage);
    // Before the Anthill: its first state is created at once and the main menu loads the save (the Quality switch).
    G.onQuality = (smooth) => opts.host.onQuality?.(smooth);
    this._anthill = new Anthill(opts.initialState ?? PrepareState, false, {
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
    this.logScreenChange();
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
    if (this._frozen) {
      // (T2.8, the settings panel of the renderer is open) no ticks, and no catch-up burst when the time runs again
      this._last = aNowMs;
      this._acc = 0;
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

  /** Commands of the worker protocol (`{t:'cmd'}`): `setTimeScale`, `freeze`, and the dev ones. */
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
      case 'freeze':
        // The settings panel of the renderer (F2, T2.8) stops the simulation while it is open: `freeze` [true|false].
        this._frozen = aArgs[0] === true;
        break;
      case 'startLevel': {
        // `--start-level=Level01`: the dev entry, the level without the menu (GameState.debugStartLevel).
        const state = this._anthill?.state;
        let name = String(aArgs[0]);
        if (/^\d+$/.test(name)) {
          name = 'Level' + (name.length < 2 ? '0' + name : name); // `--start-level=5` is Level05
        }

        if (!(state instanceof GameState)) {
          host.log('warn', 'startLevel(' + name + '): the state is not the GameState');
        } else if (!G.levelManager.hasLevel(name)) {
          host.log('warn', 'startLevel(' + name + '): no such level');
        } else {
          state.debugStartLevel(name);
          this.requestSceneReset();
          host.log('info', 'level ' + name + ' started');
        }

        break;
      }
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

  /** `screen <name>` in the log when the screen of the MenuSystem changes (the e2e test of the flow reads it). */
  private logScreenChange(): void {
    const name = G.core?.getSystem(MenuSystem)?.currentScreenName ?? null;
    if (name !== this._screenName) {
      this._screenName = name;
      if (name !== null) {
        this._opts.host.log('info', 'screen ' + name);
      }
    }
  }

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
    // The level that is loaded is the atlas group of the frame; tests of a loop without a level manager give it.
    const level = G.levelManager?.currentLevelNumber ?? 0;
    const levelGroup = level > 0 ? level : this.levelGroup;
    let debugLines: FrameScene['debugLines'] = null;
    if (Config.debugSettings.allowBox2DDebug && G.physics != null) {
      debugLines = this.collectDebugLines();
    }

    const music = G.music ?? null; // null until the GameState has run G.init()
    this._frame = (this._writer as FrameWriter).write({
      root: state.defGroup,
      camera,
      tick: this._tick,
      paused: G.physics != null && G.gamePause,
      levelGroup,
      tickCost: this._tickCost,
      sceneReset: reset,
      audio: collectFrameAudio(AntG.sounds, music != null ? music.manager : null, music != null ? music.mute : false),
      debugLines,
    });
  }

  /** Box2D debug picture (Config.debugSettings.allowBox2DDebug) as the lines of the Frame. */
  private collectDebugLines(): FrameScene['debugLines'] {
    const packed = collectDebugLines(G.physics.box2dWorld as NonNullable<typeof G.physics.box2dWorld>);
    const count = Math.floor(packed.length / DEBUG_LINE_STRIDE);
    const lines = new Float32Array(count * 4);
    const colors = new Uint32Array(count);
    const bits = new Uint32Array(packed.buffer, packed.byteOffset, packed.length);
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < 4; j++) {
        lines[i * 4 + j] = packed[i * DEBUG_LINE_STRIDE + j] as number;
      }

      colors[i] = bits[i * DEBUG_LINE_STRIDE + 4] as number;
    }

    return { count, lines, colors };
  }
}
