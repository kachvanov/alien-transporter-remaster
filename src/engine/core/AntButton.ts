// Port of ru/antkarlov/anthill/AntButton.as
//
// docs/04 §6 does not port AntButton "unless the game uses it": the game does (screens/Button, ButtonSwitch,
// ui/ButtonBarView, the buttons of GameScreen), so it is ported here.
//
// Like AntActor it is ported without BitmapData: the "pixels" of the current frame are its FrameMeta, the
// colour/alpha (`ColorTransform`) are plain state and the drawing is `writeFrame(sink)` (IFrameWritable): the
// FrameWriter calls it where AntButton.draw would draw the button itself, before its children (the label).
// The frames of a button are its states: 1 = NORMAL, 2 = OVER, 3 = DOWN (`switchFrame(status)`).
//
// DEVIATION: the system mouse cursor (`flash.ui.Mouse.cursor = "button"/"auto"`, useSystemCursor) is not
// ported: the simulation has no stage; the field stays so that call sites can set it.
// DEVIATION: `makeButton()` (a static helper with AntLabel, never called by the game) is not ported.
// DEVIATION: the pixel-perfect hitTest needs the alpha of a frame; without the AntActor.pixelAlphaTest hook (the
// simulation has no pixels) it is the test against the polygon of the button (as for AntActor).

import type { FrameMeta } from '../assets/AssetRegistry';
import { blendCode, makeUid } from '../../frame/FrameWriter';
import type { FrameSink, IFrameWritable } from '../../frame/types';
import { AntSignal } from '../signals/AntSignal';
import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import { AntStorage } from '../utils/AntStorage';
import { AntActor } from './AntActor';
import { AntAnimation } from './AntAnimation';
import { AntBasic } from './AntBasic';
import type { AntCamera } from './AntCamera';
import { AntEntity } from './AntEntity';
import { AntG } from './AntG';

export class AntButton extends AntEntity implements IFrameWritable {
  static readonly className = 'AntButton';

  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  static defOverCursorAnim: string | null = null;
  static defDownCursorAnim: string | null = null;
  static defSoundClick: string | null = null;
  static defSoundOver: string | null = null;
  static defSoundOut: string | null = null;

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly NORMAL = 1; // uint
  static readonly OVER = 2; // uint
  static readonly DOWN = 3; // uint

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  soundClick: string | null;
  soundOver: string | null;
  soundOut: string | null;
  useSystemCursor: boolean;
  camera: AntCamera | null;
  blend: string | null = null;
  smoothing = true;
  status = AntButton.NORMAL; // uint
  eventDown: AntSignal<[AntButton]> | null;
  eventOver: AntSignal<[AntButton]> | null;
  eventOut: AntSignal<[AntButton]> | null;
  eventUp: AntSignal<[AntButton]> | null;
  eventClick: AntSignal<[AntButton]> | null;
  labelOffset: AntPoint;
  overCursorAnim: string | null;
  downCursorAnim: string | null;
  enabled: boolean;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  private _label: AntEntity | null = null;
  protected _labelPosition: AntPoint = new AntPoint();
  protected _over = false;
  protected _down = false;
  protected _selected = false;
  protected _toggle = false;
  protected _alpha = 1;
  protected _color = 16777215; // uint
  protected _animations: AntStorage<AntAnimation> | null = new AntStorage<AntAnimation>();
  protected _curAnim: AntAnimation | null = null;
  protected _curAnimName: string | null = null;
  protected _prevFrame = -1; // int
  /** The current frame (the original: its BitmapData). */
  protected _pixels: FrameMeta | null = null;
  protected _iChangeCursor = false;
  protected _point: AntPoint = new AntPoint();

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.soundOver = null;
    this.soundOut = null;
    this.soundClick = null;
    this.useSystemCursor = true;
    this.camera = AntG.getCamera();
    this.eventDown = new AntSignal<[AntButton]>(AntButton);
    this.eventOver = new AntSignal<[AntButton]>(AntButton);
    this.eventOut = new AntSignal<[AntButton]>(AntButton);
    this.eventUp = new AntSignal<[AntButton]>(AntButton);
    this.eventClick = new AntSignal<[AntButton]>(AntButton);
    this.label = null;
    this.labelOffset = new AntPoint(0, 1);
    this.overCursorAnim = AntButton.defOverCursorAnim;
    this.downCursorAnim = AntButton.defDownCursorAnim;
    this.enabled = true;
    this.soundClick = AntButton.defSoundClick;
    this.soundOver = AntButton.defSoundOver;
    this.soundOut = AntButton.defSoundOut;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    (this.eventDown as AntSignal<[AntButton]>).destroy();
    (this.eventOver as AntSignal<[AntButton]>).destroy();
    (this.eventOut as AntSignal<[AntButton]>).destroy();
    (this.eventUp as AntSignal<[AntButton]>).destroy();
    (this.eventClick as AntSignal<[AntButton]>).destroy();
    this.eventDown = null;
    this.eventOver = null;
    this.eventOut = null;
    this.eventUp = null;
    this.eventClick = null;
    (this._animations as AntStorage<AntAnimation>).clear();
    this._animations = null;
    this._curAnim = null;
    this._curAnimName = null;
    this._pixels = null;
    super.destroy();
  }

  override update(): void {
    this.updateButton();
    super.update();
  }

  /** `draw(aCamera)` of the original without the drawing: the FrameWriter calls `writeFrame` (see the header). */
  override draw(aCamera: AntCamera): void {
    this.updateBounds();
    this.drawButton(aCamera);
    super.draw(aCamera);
  }

  /** `draw()` of the original: `updateBounds(); drawButton(); super.draw()` (the children are drawn by the writer). */
  writeFrame(aSink: FrameSink): void {
    this.updateBounds();
    ++AntBasic.NUM_OF_VISIBLE;
    if (this._pixels == null || !this.onScreen(aSink.camera)) {
      return;
    }

    ++AntBasic.NUM_ON_SCREEN;
    let alpha = Math.round(this._alpha * 255);
    alpha = alpha < 0 ? 0 : alpha > 255 ? 255 : alpha;
    aSink.node(
      makeUid(this.entityId),
      this._pixels.texId,
      aSink.screenX(this, this.globalX),
      aSink.screenY(this, this.globalY),
      Math.PI * 2 * (this.globalAngle / 360),
      this.scaleX,
      this.scaleY,
      alpha,
      this._color,
      blendCode(this.blend),
      this.justReset,
    );
  }

  addAnimation(aAnimation: AntAnimation, aName: string | null = null, aSwitchNow = true): void {
    if (aName == null) {
      aName = aAnimation.name;
    }

    AntAnimation.useAnimation(aAnimation.name);
    (this._animations as AntStorage<AntAnimation>).set(aName, aAnimation);
    if (aSwitchNow) {
      this.switchAnimation(aName);
    }
  }

  addAnimationFromCache(aName: string, aKey: string | null = null, aSwitchNow = true): void {
    this.addAnimation(AntAnimation.getFromCache(aName), aKey, aSwitchNow);
  }

  switchAnimation(aName: string): void {
    if (this._curAnimName == aName) {
      return;
    }

    const animations = this._animations as AntStorage<AntAnimation>;
    if (animations.containsKey(aName)) {
      this._curAnim = animations.get(aName) as AntAnimation;
      this._curAnimName = aName;
      this._prevFrame = -1;
      this.resetHelpers();
      this.updateVisualStatus();
      return;
    }

    throw new Error('Missing button animation "' + aName + '".');
  }

  removeAnimation(aName: string): void {
    const animations = this._animations as AntStorage<AntAnimation>;
    if (animations.containsKey(aName)) {
      const anim = animations.remove(aName) as AntAnimation | null;
      if (anim != null) {
        AntAnimation.unuseAnimation(anim.name);
      }
    }
  }

  /** The current animation stays as it is (the original does not clear `_curAnim`), see switchAnimation(). */
  clearAnimations(): void {
    for (const key of (this._animations as AntStorage<AntAnimation>).getAllKeys()) {
      this.removeAnimation(key);
    }
  }

  override hitTest(aX: number, aY: number, aPixelPerfect = false): boolean {
    let hit = super.hitTest(aX, aY);
    if (hit && aPixelPerfect) {
      const pixelTest = AntActor.pixelAlphaTest;
      if (pixelTest != null && this._pixels != null) {
        const o = new AntPoint(Math.abs(this.origin.x), Math.abs(this.origin.y));
        const px = Math.floor((aX - this.globalX) / this.scaleX + o.x) | 0; // :int
        const py = Math.floor((aY - this.globalY) / this.scaleY + o.y) | 0; // :int
        const p = AntMath.rotateDeg(px, py, o.x, o.y, -this.globalAngle);
        // p is a point of the BitmapData of the original; the hook reads the untrimmed frame (see bitmapRect)
        const rect = AntAnimation.bitmapRect(this._pixels, (this._curAnim as AntAnimation).bitmapFrames);
        hit = pixelTest(this._pixels, p.x + rect[0], p.y + rect[1]);
      }
    }

    return hit;
  }

  override hitTestPoint(aPoint: AntPoint, aPixelPerfect = false): boolean {
    return this.hitTest(aPoint.x, aPoint.y, aPixelPerfect);
  }

  override kill(): void {
    if (this.useSystemCursor && this._iChangeCursor) {
      // Mouse.cursor = "auto": not ported, see the header.
      this._iChangeCursor = false;
    }

    super.kill();
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected updateLabel(): void {
    const label = this.label;
    if (label != null) {
      label.x = this.width * 0.5 - label.width * 0.5 + this.origin.x + this._labelPosition.x;
      label.y = this.height * 0.5 - label.height * 0.5 + this.origin.y + this._labelPosition.y;
      if (this._down) {
        label.x += this.labelOffset.x;
        label.y += this.labelOffset.y;
      }
    }
  }

  protected getVisibility(): boolean {
    let entity = this.parent;
    while (entity != null) {
      if (!entity.visible) {
        return false;
      }

      entity = entity.parent;
    }

    return true;
  }

  protected updateButton(): void {
    if (this.camera == null) {
      this.camera = AntG.getCamera();
    }

    if (this.camera != null && this.visible && this.getVisibility() && this.enabled) {
      if (this.isScrolled) {
        AntG.mouse.getWorldPosition(this.camera, this._point);
      } else {
        AntG.mouse.getScreenPosition(this.camera, this._point);
      }

      if (this.hitTestPoint(this._point, true)) {
        this.onMouseOver();
        if (AntG.mouse.isPressed()) {
          this.onMouseDown();
        } else if (AntG.mouse.isReleased()) {
          this.onMouseUp();
        }
      } else {
        if (this._over) {
          this.onMouseOut();
        }

        if (this._down && AntG.mouse.isReleased()) {
          this.onMouseUp();
        }
      }
    } else if (this._iChangeCursor) {
      this._iChangeCursor = false; // Mouse.cursor = "auto"
    }

    this.updateVisualStatus();
  }

  protected onMouseOver(): void {
    const wasOver = this._over;
    this._over = true;
    if (wasOver != this._over) {
      (this.eventOver as AntSignal<[AntButton]>).dispatch(this);
      AntG.sounds.play(this.soundOver);
    }

    if (!this._down) {
      if (this.overCursorAnim != null) {
        AntG.mouse.changeCursor(this.overCursorAnim);
      }

      if (this.useSystemCursor) {
        this._iChangeCursor = true; // Mouse.cursor = "button"
      }
    }
  }

  protected onMouseOut(): void {
    const wasOver = this._over;
    this._over = false;
    if (wasOver != this._over) {
      (this.eventOut as AntSignal<[AntButton]>).dispatch(this);
      if (!this._down) {
        AntG.mouse.changeCursor();
        if (this.useSystemCursor) {
          this._iChangeCursor = false; // Mouse.cursor = "auto"
        }
      }
    }

    AntG.sounds.play(this.soundOut);
  }

  protected onMouseDown(): void {
    const wasDown = this._down;
    this._down = true;
    if (wasDown != this._down) {
      (this.eventDown as AntSignal<[AntButton]>).dispatch(this);
      AntG.mouse.changeCursor(this.downCursorAnim);
    }
  }

  protected onMouseUp(): void {
    (this.eventUp as AntSignal<[AntButton]>).dispatch(this);
    if (this._toggle && this._over) {
      this._selected = !this._selected;
    }

    const wasDown = this._down;
    this._down = false;
    if (this._over && wasDown) {
      (this.eventClick as AntSignal<[AntButton]>).dispatch(this);
      AntG.sounds.play(this.soundClick);
      AntG.mouse.changeCursor(this.getVisibility() ? this.overCursorAnim : null);
    } else {
      AntG.mouse.changeCursor();
    }
  }

  protected updateVisualStatus(): void {
    if ((this._over && this._down) || (!this._over && this._down) || this._selected) {
      this.status = AntButton.DOWN;
    } else if (this._over && !this._down) {
      this.status = AntButton.OVER;
    } else {
      this.status = AntButton.NORMAL;
    }

    this.switchFrame(this.status);
    this.updateLabel();
  }

  /** The counters of drawButton(); the drawing itself is writeFrame(). */
  protected drawButton(aCamera: AntCamera): void {
    ++AntBasic.NUM_OF_VISIBLE;
    if (this._pixels == null || !this.onScreen(aCamera)) {
      return;
    }

    ++AntBasic.NUM_ON_SCREEN;
  }

  protected resetHelpers(): void {
    this.calcFrame();
    this.updateBounds();
  }

  /** Takes origin and size of the frame `aIndex` (0-based) of the current animation. */
  protected calcFrame(aIndex = 0): void {
    aIndex = aIndex | 0;
    const anim = this._curAnim as AntAnimation;
    this.origin.set(anim.offsetX[aIndex] as number, anim.offsetY[aIndex] as number);
    const frame = anim.frames[aIndex];
    if (frame === undefined) {
      throw new TypeError("AntButton: animation '" + anim.name + "' has no frame " + aIndex + '.');
    }

    this._pixels = frame;
    // T4.2: the original width/height are the size of the BitmapData of the frame (the colour bounds + 2 px of indent
    // on each side), see AntAnimation.bitmapRect; `origin` above is the offset of that bitmap.
    const rect = AntAnimation.bitmapRect(frame, anim.bitmapFrames);
    this.width = rect[2];
    this.height = rect[3];
  }

  protected switchFrame(aFrame: number): void {
    aFrame = aFrame | 0;
    if (this._curAnim == null) {
      return;
    }

    if (this._curAnim.totalFrames == 2 && aFrame == 2) {
      aFrame = 1;
    }

    aFrame = aFrame <= 1 ? 1 : aFrame >= this._curAnim.totalFrames ? this._curAnim.totalFrames : aFrame;
    if (this._prevFrame != aFrame) {
      this.calcFrame(aFrame - 1);
      this._prevFrame = aFrame;
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isDown(): boolean {
    return this._down;
  }
  set isDown(value: boolean) {
    this._over = value;
    this._down = value;
  }

  get labelPositionX(): number {
    return this._labelPosition.x;
  }
  set labelPositionX(value: number) {
    this._labelPosition.x = value;
    this.updateLabel();
  }

  get labelPositionY(): number {
    return this._labelPosition.y;
  }
  set labelPositionY(value: number) {
    this._labelPosition.y = value;
    this.updateLabel();
  }

  get labelPosition(): AntPoint {
    return this._labelPosition;
  }
  set labelPosition(value: AntPoint) {
    this._labelPosition.set(value.x, value.y);
    this.updateLabel();
  }

  get label(): AntEntity | null {
    return this._label;
  }
  set label(value: AntEntity | null) {
    if (this._label != value) {
      if (this._label != null) {
        this.remove(this._label);
      }

      this._label = value;
      // `add(null)` of the original throws a TypeError when the label is cleared; the constructor sets null first.
      if (this._label != null) {
        this.add(this._label);
      }
    }
  }

  get text(): string {
    const label = this.label as (AntEntity & { text?: string }) | null;
    return label != null && 'text' in label ? (label.text as string) : '';
  }
  set text(value: string) {
    const label = this.label as (AntEntity & { text?: string }) | null;
    if (label != null && 'text' in label) {
      label.text = value;
      this.updateLabel();
    }
  }

  get selected(): boolean {
    return this._selected;
  }
  set selected(value: boolean) {
    if (!this._toggle) {
      value = false;
    }

    this._selected = value;
    this.updateVisualStatus();
  }

  get toggle(): boolean {
    return this._toggle;
  }
  set toggle(value: boolean) {
    this._toggle = value;
  }

  get currentAnimation(): string | null {
    return this._curAnimName;
  }

  /** Metadata of the frame that is shown now (null while there is no animation). */
  get currentFrameMeta(): FrameMeta | null {
    return this._pixels;
  }

  get alpha(): number {
    return this._alpha;
  }
  set alpha(value: number) {
    value = value > 1 ? 1 : value < 0 ? 0 : value;
    if (this._alpha != value) {
      this._alpha = value;
      if (this._curAnim != null) {
        this.calcFrame(this.status - 1);
      }
    }
  }

  get color(): number {
    return this._color;
  }
  set color(value: number) {
    value = (value & 16777215) >>> 0; // uint
    if (this._color != value) {
      this._color = value;
      if (this._curAnim != null) {
        this.calcFrame(this.status - 1);
      }
    }
  }

  get memSize(): number {
    return 0;
  }
}
