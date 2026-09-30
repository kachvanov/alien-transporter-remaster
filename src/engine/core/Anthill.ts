// Port of ru/antkarlov/anthill/Anthill.as (docs/01-architecture.md §3)
//
// A thin class: no Flash display list, no debugger, no real-time frame handler. The enterFrame body is
// tick(snapshot), which the sim loop calls at a fixed 35 Hz. The order inside a tick is the original's:
//   1. AntG.elapsed (fixed 1/35 * timeScale instead of the measured frame time);
//   2. update(): AntG.updateInput(), AntG.sounds.update(), state.preUpdate/update/postUpdate;
//   3. render(): camera.update() for every camera, then the render point (onRender callback: the
//      FrameWriter serialises the scene here); AntG.plugins.draw(camera) for every camera;
//   4. AntG.plugins.update() (onPlugins callback, default: AntG.plugins.update()).

import type { InputSnapshot } from '../input/InputSnapshot';
import type { Ctor } from '../utils/types';
import { AntBasic } from './AntBasic';
import { AntCamera } from './AntCamera';
import { AntEntity } from './AntEntity';
import { AntG } from './AntG';
import type { AntState } from './AntState';

/** Simulation step in seconds and in milliseconds. */
const TICK_SECONDS = 1 / 35;
const TICK_MS = 1000 / 35;

export interface AnthillCallbacks {
  /**
   * Step 3, the render point. Called after the cameras were updated, with the cameras of AntG.
   * Default (null): `state.draw(camera)` for every camera, i.e. the original render() traversal, which
   * has the side effects of AntActor.draw() (updateBounds) and of game overrides of draw().
   * A FrameWriter replaces it and must then do those side effects itself.
   */
  onRender?: ((cameras: readonly (AntCamera | null)[]) => void) | null;
  /** Step 4. Default (null): `AntG.plugins.update()`. */
  onPlugins?: (() => void) | null;
}

export class Anthill {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  state: AntState | null = null;
  cameras: (AntCamera | null)[] | null = null;
  onRender: AnthillCallbacks['onRender'] = null;
  onPlugins: AnthillCallbacks['onPlugins'] = null;

  /** `internal var _useSystemCursor:Boolean` */
  _useSystemCursor: boolean;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _defaultCamera: AntCamera | null = null;
  protected _initialState: Ctor<AntState> | null;
  protected _isCreated = false;
  protected _isStarted = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aInitialState: Ctor<AntState> | null = null, aUseSystemCursor = true, aCallbacks: AnthillCallbacks = {}) {
    this._useSystemCursor = aUseSystemCursor;
    this._initialState = aInitialState;
    this._isCreated = false;
    this._isStarted = false;
    this.onRender = aCallbacks.onRender ?? null;
    this.onPlugins = aCallbacks.onPlugins ?? null;
    this.create();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  protected create(): void {
    AntG.init(this);
    this._isCreated = true;
    if (this._initialState != null) {
      this.switchState(new this._initialState());
      this.start();
    }
  }

  start(): void {
    if (!this._isStarted && this._isCreated) {
      this._isStarted = true;
    }
  }

  stop(): void {
    if (this._isStarted && this._isCreated) {
      this._isStarted = false;
    }
  }

  get isStarted(): boolean {
    return this._isStarted;
  }

  switchState(aState: AntState): void {
    if (this.state != null) {
      this.state.destroy();
      if (this._defaultCamera != null && AntG.camera == this._defaultCamera) {
        AntG.removeCamera(this._defaultCamera);
      }
    }

    this.state = aState;
    this.state.create();
    if (AntG.camera == null) {
      this.createDefaultCamera();
    } else if (AntG.camera != null && this._defaultCamera != null && AntG.camera != this._defaultCamera) {
      this.destroyDefaultCamera();
    }

    if (!this._isStarted) {
      this.start();
    }
  }

  createDefaultCamera(aWidth = 0, aHeight = 0): void {
    aWidth = aWidth | 0;
    aHeight = aHeight | 0;
    if (this._defaultCamera == null) {
      aWidth = aWidth == 0 ? AntG.width : aWidth;
      aHeight = aHeight == 0 ? AntG.height : aHeight;
      this._defaultCamera = new AntCamera(0, 0, aWidth, aHeight);
      this._defaultCamera.fillBackground = true;
    }

    AntG.addCamera(this._defaultCamera);
  }

  destroyDefaultCamera(): void {
    (this._defaultCamera as AntCamera).destroy();
    this._defaultCamera = null;
  }

  /** One frame of the game (the body of `enterFrameHandler`). */
  tick(aSnapshot: InputSnapshot): void {
    AntG.simTimeMs += TICK_MS;
    // DEVIATION: the original measures the frame time (min(real, maxElapsed), or maxElapsed with
    // fixedElapsed) and multiplies it by timeScale; the port is deterministic: a fixed step.
    AntG.elapsed = TICK_SECONDS;
    AntG.elapsed *= AntG.timeScale;
    this.update(aSnapshot);
    this.render();
    if (this.onPlugins != null) {
      this.onPlugins();
    } else {
      AntG.plugins.update();
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected update(aSnapshot: InputSnapshot): void {
    AntG.updateInput(aSnapshot);
    AntG.sounds.update();
    AntBasic.NUM_OF_ACTIVE = 0;
    AntEntity.DEPTH_ID = 0;
    if (this.state != null) {
      this.state.preUpdate();
      this.state.update();
      this.state.postUpdate();
    }
  }

  protected render(): void {
    AntBasic.NUM_OF_VISIBLE = 0;
    AntBasic.NUM_ON_SCREEN = 0;
    AntBasic.BUFFERS_SIZE = 0;
    if (this.cameras == null) {
      this.cameras = AntG.cameras;
    }

    const cameras = this.cameras;
    const n = cameras.length | 0;
    let i = 0;
    while (i < n) {
      const camera = cameras[i++] ?? null;
      if (camera != null && camera.exists) {
        camera.update();
      }
    }

    if (this.onRender != null) {
      this.onRender(cameras);
    } else if (this.state != null) {
      i = 0;
      while (i < n) {
        const camera = cameras[i++] ?? null;
        if (camera != null && camera.exists) {
          this.state.draw(camera);
        }
      }
    }

    i = 0;
    while (i < n) {
      const camera = cameras[i++] ?? null;
      if (camera != null && camera.exists) {
        AntG.plugins.draw(camera);
      }
    }
  }
}
