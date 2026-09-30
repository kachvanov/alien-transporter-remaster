// Port of ru/antkarlov/anthill/AntG.as
//
// Differences from the original (no Flash stage, no debugger):
//  - the stage, the debugger (AntDebugger, AntMemory, console/monitor commands) and the mouse/context
//    menu Flash API are gone; `track/registerCommand/log/watchValue/...` stay as no-op functions because
//    the game calls them;
//  - updateInput() takes the InputSnapshot instead of reading stage.mouseX/Y and the key events;
//  - the fields have the values AntG.init() would give them from the start (elapsed = 0.02, timeScale = 1,
//    ...), and plugins/keys/mouse/sounds are created on first access (or by init()), so the class is
//    usable without an Anthill (headless tests) and module cycles cannot trip over construction order;
//  - `simTimeMs` (getTimer() replacement) and the 800x600 screen size (init(anthill, width, height)).

import type { InputSnapshot } from '../input/InputSnapshot';
import { AntKeyboard } from '../input/AntKeyboard';
import { AntMouse } from '../input/AntMouse';
import { AntPluginManager } from '../plugins/AntPluginManager';
import { AntSignal } from '../signals/AntSignal';
import type { AntPoint } from '../utils/AntPoint';
import type { AnyFunction } from '../utils/types';
import { AntBasic } from './AntBasic';
import type { AntCamera } from './AntCamera';
import type { AntState } from './AntState';
import type { Anthill } from './Anthill';
import { AntSoundManagerStub } from './AntSoundManagerStub'; // STUB(T1.8)

const noop: AnyFunction = () => undefined;

export class AntG {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly LIB_NAME = 'Anthill Alpha';
  static readonly LIB_MAJOR_VERSION = 0; // uint
  static readonly LIB_MINOR_VERSION = 3; // uint
  static readonly LIB_MAINTENANCE = 6; // uint

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  static width = 800; // int
  static height = 600; // int
  static widthHalf = 400; // int
  static heightHalf = 300; // int
  static timeScale = 1;
  static elapsed = 0.02;
  static maxElapsed = 0.0333333;
  static fixedElapsed = false;
  static cameras: (AntCamera | null)[] = [];
  static camera: AntCamera | null = null;
  static debugDraw = false;
  static waterMarkPosition: AntPoint | null = null;
  static waterMark: string[] = ['Development Build'];
  static lockExternalLinks = false;
  static eventTakeFocus: AntSignal = new AntSignal();
  static eventGiveFocus: AntSignal = new AntSignal();

  /** Debug console hooks of the original: nothing to do without the debugger. */
  static track: AnyFunction = noop;
  static registerCommand: AnyFunction = noop;
  static registerCommandWithArgs: AnyFunction = noop;
  static unregisterCommand: AnyFunction = noop;
  static log: AnyFunction = noop;
  static watchValue: AnyFunction = noop;
  static unwatchValue: AnyFunction = noop;
  static beginWatch: AnyFunction = noop;
  static endWatch: AnyFunction = noop;

  /**
   * Simulation clock in milliseconds (replaces flash.utils.getTimer()): Anthill.tick() adds 1000 / 35
   * per tick.
   */
  static simTimeMs = 0;

  /** Host hook for openUrl() (navigateToURL): the sim worker forwards it to the renderer. */
  static onOpenUrl: ((url: string, window: string) => void) | null = null;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  static _anthill: Anthill | null = null;
  private static _debugMode = true;
  private static _frameRate = 35; // uint
  private static _plugins: AntPluginManager | null = null;
  private static _mouse: AntMouse | null = null;
  private static _keys: AntKeyboard | null = null;
  private static _sounds: AntSoundManagerStub | null = null; // STUB(T1.8): AntSoundManager

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {}

  //---------------------------------------
  // STATIC METHODS
  //---------------------------------------

  static init(aAnthill: Anthill, aWidth = 800, aHeight = 600): void {
    AntG.timeScale = 1;
    AntG.elapsed = 0.02;
    AntG.maxElapsed = 0.0333333;
    AntG.fixedElapsed = false;
    AntG._anthill = aAnthill;
    AntG._debugMode = true;
    AntG.width = aWidth | 0;
    AntG.height = aHeight | 0;
    AntG.widthHalf = (AntG.width * 0.5) | 0;
    AntG.heightHalf = (AntG.height * 0.5) | 0;
    AntG.cameras = [];
    AntG.camera = null;
    AntG._plugins = new AntPluginManager();
    AntG._mouse = new AntMouse();
    AntG._mouse.init();
    AntG._keys = new AntKeyboard();
    AntG._sounds = new AntSoundManagerStub();
    AntG.debugDraw = false;
    AntG.lockExternalLinks = false;
    AntG.eventTakeFocus = new AntSignal();
    AntG.eventGiveFocus = new AntSignal();
    AntG.simTimeMs = 0;
  }

  static setScreenSize(aWidth: number, aHeight: number): void {
    AntG.width = aWidth | 0;
    AntG.height = aHeight | 0;
    AntG.widthHalf = (aWidth * 0.5) | 0;
    AntG.heightHalf = (aHeight * 0.5) | 0;
  }

  static resetInput(): void {
    AntG.mouse.reset();
    AntG.keys.reset();
  }

  /**
   * AntG.updateInput(): the stage events that arrived since the previous frame (here: the difference
   * to the previous snapshot) are applied first, then the mouse and the keyboard shift their
   * pressed/released states, exactly as `mouse.update(); keys.update();` does at the start of a frame.
   */
  static updateInput(aSnapshot: InputSnapshot): void {
    AntG.keys.applySnapshot(aSnapshot.keysDown);
    AntG.mouse.applySnapshot(aSnapshot);
    AntG.mouse.update(aSnapshot.mouseX, aSnapshot.mouseY);
    AntG.keys.update();
  }

  static createDefaultCamera(aWidth = 0, aHeight = 0): void {
    if (AntG._anthill != null) {
      AntG._anthill.createDefaultCamera(aWidth, aHeight);
    }
  }

  static addCamera(aCamera: AntCamera): AntCamera {
    if (AntG.cameras.indexOf(aCamera) > -1) {
      return aCamera;
    }

    if ((AntG._anthill as Anthill).state == null) {
      throw new Error('Before adding the Camera need to initialize game state.');
    }

    let i = 0;
    const n = AntG.cameras.length | 0;
    while (i < n) {
      if (AntG.cameras[i] == null) {
        AntG.cameras[i] = aCamera;
        AntG.camera = aCamera;
        return aCamera;
      }
      i++;
    }

    AntG.cameras.push(aCamera);
    AntG.camera = aCamera;
    return aCamera;
  }

  static removeCamera(aCamera: AntCamera, aSplice = false): AntCamera {
    const i = AntG.cameras.indexOf(aCamera) | 0;
    if (i < 0 || i >= AntG.cameras.length) {
      return aCamera;
    }

    AntG.cameras[i] = null;
    if (aSplice) {
      AntG.cameras.splice(i, 1);
    }

    if (AntG.camera == aCamera) {
      AntG.camera = null;
    }

    return aCamera;
  }

  static getCamera(aIndex = -1): AntCamera | null {
    aIndex = aIndex | 0;
    if (aIndex == -1) {
      return AntG.camera;
    }

    if (aIndex >= 0 && aIndex < AntG.cameras.length) {
      return AntG.cameras[aIndex] ?? null;
    }

    return null;
  }

  static switchState(aState: AntState): AntState {
    if (AntG._anthill != null) {
      AntG._anthill.switchState(aState);
    }

    return aState;
  }

  static openUrl(aUrl: string, aWindow = '_blank'): void {
    if (!AntG.lockExternalLinks && AntG.onOpenUrl != null) {
      AntG.onOpenUrl(aUrl, aWindow);
    }
  }

  static onGiveFocus(): void {
    AntG.eventGiveFocus.dispatch();
  }

  static onTakeFocus(): void {
    AntG.mouse.reset();
    AntG.keys.reset();
    AntG.eventTakeFocus.dispatch();
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  static get plugins(): AntPluginManager {
    if (AntG._plugins == null) {
      AntG._plugins = new AntPluginManager();
    }
    return AntG._plugins;
  }
  static set plugins(value: AntPluginManager) {
    AntG._plugins = value;
  }

  static get mouse(): AntMouse {
    if (AntG._mouse == null) {
      AntG._mouse = new AntMouse();
      AntG._mouse.init();
    }
    return AntG._mouse;
  }
  static set mouse(value: AntMouse) {
    AntG._mouse = value;
  }

  static get keys(): AntKeyboard {
    if (AntG._keys == null) {
      AntG._keys = new AntKeyboard();
    }
    return AntG._keys;
  }
  static set keys(value: AntKeyboard) {
    AntG._keys = value;
  }

  /** STUB(T1.8): becomes AntSoundManager. */
  static get sounds(): AntSoundManagerStub {
    if (AntG._sounds == null) {
      AntG._sounds = new AntSoundManagerStub();
    }
    return AntG._sounds;
  }
  static set sounds(value: AntSoundManagerStub) {
    AntG._sounds = value;
  }

  static get debugMode(): boolean {
    return AntG._debugMode;
  }
  static set debugMode(value: boolean) {
    AntG._debugMode = value;
  }

  static get useSystemCursor(): boolean {
    return AntG._anthill != null ? AntG._anthill._useSystemCursor : true;
  }
  static set useSystemCursor(value: boolean) {
    if (AntG._anthill != null) {
      if (AntG._anthill._useSystemCursor != value) {
        AntG._anthill._useSystemCursor = value;
      }
    }
  }

  /** Stored only: the logic always runs at 35 Hz (docs/04-porting-guide.md §4). */
  static get frameRate(): number {
    return AntG._frameRate;
  }
  static set frameRate(value: number) {
    AntG._frameRate = value >>> 0;
  }

  static get state(): AntState | null {
    return AntG._anthill != null ? AntG._anthill.state : null;
  }

  static get anthill(): Anthill | null {
    return AntG._anthill;
  }

  static get numOfActive(): number {
    return AntBasic.NUM_OF_ACTIVE;
  }

  static get numOfVisible(): number {
    return AntBasic.NUM_OF_VISIBLE;
  }

  static get numOnScreen(): number {
    return AntBasic.NUM_ON_SCREEN;
  }
}
