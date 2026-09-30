// Port of ru/antkarlov/anthill/AntMouse.as
//
// DEVIATION: the original subscribes to the Flash stage (MOUSE_WHEEL, buttons) and reads stage.mouseX/Y;
// here everything comes from the InputSnapshot (AntG.updateInput -> applySnapshot -> update).
// Not ported (Flash-only, unused by the game): the context menu (contextMenu, addMenuItem, ...),
// makeCursor() and the software cursor drawing (draw()); `cursor` stays a plain field.

import type { AntActor } from '../core/AntActor';
import type { AntCamera } from '../core/AntCamera';
import { AntG } from '../core/AntG';
import { AntPoint } from '../utils/AntPoint';
import type { InputSnapshot } from './InputSnapshot';
import { AntMouseButton } from './AntMouseButton';

export class AntMouse extends AntPoint {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  wheelDelta = 0; // int
  screenX = 0; // int
  screenY = 0; // int
  cursor: AntActor | null = null;
  defCursorAnim: string | null = null;
  leftButton: AntMouseButton;
  middleButton: AntMouseButton;
  rightButton: AntMouseButton;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _cursorOffset: AntPoint;
  protected _globalScreenPos: AntPoint;
  protected _currentWheel = 0; // int
  protected _lastWheel = 0; // int
  /** Snapshot side: left button state in the previous snapshot. */
  protected _snapshotDown = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.leftButton = new AntMouseButton(AntMouseButton.LEFT_BUTTON);
    this.middleButton = new AntMouseButton(AntMouseButton.MIDDLE_BUTTON);
    this.rightButton = new AntMouseButton(AntMouseButton.RIGHT_BUTTON);
    this._cursorOffset = new AntPoint();
    this._globalScreenPos = new AntPoint();
    this.wheelDelta = 0;
    this.screenX = 0;
    this.screenY = 0;
    this.cursor = null;
    this.defCursorAnim = null;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** AntMouse.init(stage): only the left button listens (the other two stay disabled). */
  init(): void {
    this.leftButton.enabled = true;
  }

  show(): void {
    if (this.cursor != null) {
      this.cursor.revive();
    }
  }

  hide(): void {
    if (this.cursor != null) {
      this.cursor.kill();
    }
  }

  changeCursor(aAnimName: string | null = null): void {
    if (aAnimName == null) {
      if (this.cursor != null && this.defCursorAnim != null) {
        this.cursor.switchAnimation(this.defCursorAnim);
      }
    } else if (this.cursor != null) {
      this.cursor.switchAnimation(aAnimName);
    }
  }

  getScreenPosition(aCamera: AntCamera | null = null, aResult: AntPoint | null = null): AntPoint {
    if (aCamera == null) {
      aCamera = AntG.getCamera();
    }

    if (aResult == null) {
      aResult = new AntPoint();
    }

    const camera = aCamera as AntCamera;
    aResult.x = (this._globalScreenPos.x - camera.x) / camera.zoom;
    aResult.y = (this._globalScreenPos.y - camera.y) / camera.zoom;
    return aResult;
  }

  getWorldPosition(aCamera: AntCamera | null = null, aResult: AntPoint | null = null): AntPoint {
    if (aCamera == null) {
      aCamera = AntG.camera;
    }

    if (aResult == null) {
      aResult = new AntPoint();
    }

    const camera = aCamera as AntCamera;
    this.getScreenPosition(camera, aResult);
    let dx;
    let dy;
    if (camera.zoomStyle == 'styleCenter') {
      // AntCamera.ZOOM_STYLE_CENTER
      dx = camera.scroll.x * -1 + camera.width * 0.5;
      dy = camera.scroll.y * -1 + camera.height * 0.5;
      dx -= (camera.width / camera.zoom) * 0.5;
      dy -= (camera.height / camera.zoom) * 0.5;
    } else {
      dx = camera.scroll.x * -1;
      dy = camera.scroll.y * -1;
    }

    aResult.x += dx;
    aResult.y += dy;
    return aResult;
  }

  /**
   * Not in the original: feeds the snapshot as the stage events would have arrived since the previous
   * frame (wheel first is irrelevant: independent state), then update() has to be called.
   */
  applySnapshot(aSnapshot: InputSnapshot): void {
    if (aSnapshot.mouseDown && !this._snapshotDown) {
      this.leftButton.onMouseDown();
    } else if (!aSnapshot.mouseDown && this._snapshotDown) {
      this.leftButton.onMouseUp();
    }

    this._snapshotDown = aSnapshot.mouseDown;

    if (aSnapshot.wheelDelta != 0) {
      this.onMouseWheel(aSnapshot.wheelDelta);
    }
  }

  update(aStageMouseX: number, aStageMouseY: number): void {
    aStageMouseX = aStageMouseX | 0; // param1:int
    aStageMouseY = aStageMouseY | 0; // param2:int
    this._globalScreenPos.x = aStageMouseX;
    this._globalScreenPos.y = aStageMouseY;
    this.updateCursor();
    this.updateButtons();
    this.updateWheel();
  }

  reset(): void {
    this.leftButton.reset();
    this.middleButton.reset();
    this.rightButton.reset();
    this._currentWheel = 0;
    this._lastWheel = 0;
    // Snapshot side (not in the original): a button that is still held gives a fresh MOUSE_DOWN.
    this._snapshotDown = false;
  }

  isDown(): boolean {
    return this.leftButton.isDown();
  }

  isPressed(): boolean {
    return this.leftButton.isPressed();
  }

  isReleased(): boolean {
    return this.leftButton.isReleased();
  }

  isWheelDown(): boolean {
    return this._currentWheel < 0;
  }

  isWheelUp(): boolean {
    return this._currentWheel > 0;
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected updateCursor(): void {
    if (this.cursor != null && this.cursor.exists && this.cursor.active) {
      this.cursor.update();
      this.cursor.globalX = this._globalScreenPos.x + this._cursorOffset.x;
      this.cursor.globalY = this._globalScreenPos.y + this._cursorOffset.y;
    }

    const camera = AntG.camera;
    // DEVIATION: the original dereferences AntG.camera without a check (TypeError before the first camera
    // exists, which cannot happen there: the loop starts after switchState). A tick without a camera just
    // skips the screen/world position here.
    if (camera == null) {
      return;
    }

    this.screenX = ((this._globalScreenPos.x - camera.x) / camera.zoom) | 0;
    this.screenY = ((this._globalScreenPos.y - camera.y) / camera.zoom) | 0;
    this.x = this.screenX + camera.scroll.x;
    this.y = this.screenY + camera.scroll.y;
  }

  protected updateButtons(): void {
    this.leftButton.update();
    this.middleButton.update();
    this.rightButton.update();
  }

  protected updateWheel(): void {
    if (Math.abs(this._lastWheel) == 1 && Math.abs(this._currentWheel) == 1) {
      this._currentWheel = 0;
    } else if (Math.abs(this._lastWheel) == 2 && Math.abs(this._currentWheel) == 2) {
      this._currentWheel = this._currentWheel < 0 ? (this._currentWheel + 1) | 0 : (this._currentWheel - 1) | 0;
    }

    this._lastWheel = this._currentWheel;
  }

  /** MouseEvent.MOUSE_WHEEL handler; the argument is `MouseEvent.delta`. */
  protected onMouseWheel(aDelta: number): void {
    this.wheelDelta = aDelta | 0;
    if (this.wheelDelta > 0) {
      this._currentWheel = this._currentWheel > 0 ? 1 : 2;
    } else {
      this._currentWheel = this._currentWheel > 0 ? -1 : -2;
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get target(): object | null {
    return this.leftButton.target;
  }

  get currentTarget(): object | null {
    return this.leftButton.currentTarget;
  }

  get cursorAnim(): string | null {
    return this.cursor != null ? this.cursor.currentAnimation : null;
  }
}
