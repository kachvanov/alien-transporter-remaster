// Port of ru/antkarlov/anthill/AntActor.as
//
// Ported without BitmapData: the "pixels" of the current frame are its FrameMeta (size1x/origin1x of
// the manifest), there is no _buffer/_colorTransform/stroke canvas. Drawing (drawActor) only keeps the
// NUM_OF_VISIBLE / NUM_ON_SCREEN counters; the FrameWriter serialises the actor. Frames are 1-based:
// currentFrame is in [1, totalFrames]; the current frame is animation.frames[roundFrame(currentFrame)]
// (roundFrame returns the 0-based index).
//
// ColorTransform (flash.geom) is not needed: the original uses it only to tint the bitmap buffer, here
// `alpha` and `color` are plain state that the FrameWriter reads.

import type { FrameMeta } from '../assets/AssetRegistry';
import { AntSignal } from '../signals/AntSignal';
import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import { AntStorage } from '../utils/AntStorage';
import { AntAnimation } from './AntAnimation';
import type { AntCamera } from './AntCamera';
import { AntBasic } from './AntBasic';
import { AntEntity } from './AntEntity';
import { AntG } from './AntG';

export class AntActor extends AntEntity {
  /**
   * Pixel-perfect hitTest hook: alpha of the frame at the frame-local pixel (1x). The original reads the
   * BitmapData; without a hook (or a mask for the frame) the pixel-perfect test degrades to the polygon test.
   */
  static pixelAlphaTest: ((frame: FrameMeta, px: number, py: number) => boolean) | null = null;

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  blend: string | null = null;
  smoothing = true;
  quickDraw = true;
  currentFrame = 1;
  totalFrames = 0; // int
  reverse = false;
  repeat = true;
  animationSpeed = 1;
  eventComplete: AntSignal<[AntActor]> | null = new AntSignal<[AntActor]>(AntActor);

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _alpha = 1;
  protected _color = 16777215; // uint
  protected _animations: AntStorage<AntAnimation> | null = new AntStorage<AntAnimation>();
  protected _curAnim: AntAnimation | null = null;
  protected _curAnimName: string | null = null;
  protected _playing = false;
  protected _prevFrame = -1; // int
  /** The current frame (the original: its BitmapData). */
  protected _pixels: FrameMeta | null = null;
  protected _strokeWeight = 2; // int
  protected _strokeColor = 4294902015; // uint
  protected _stroke = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    this.clearAnimations();
    this._animations = null;
    this._curAnim = null;
    if (this.eventComplete != null) {
      this.eventComplete.destroy();
      this.eventComplete = null;
    }

    this._pixels = null;
    super.destroy();
  }

  override update(): void {
    this.updateAnimation();
    super.update();
  }

  override draw(aCamera: AntCamera): void {
    if (this._pixels != null) {
      this.updateBounds();
    }

    this.drawActor(aCamera);
    super.draw(aCamera);
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
      this.currentFrame = 1;
      this.totalFrames = this._curAnim.totalFrames | 0;
      this.resetHelpers();
      return;
    }

    throw new Error("AntActor: Missing animation '" + aName + "'.");
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

  clearAnimations(): void {
    if (this._animations != null) {
      this._animations.clear();
    }

    this._pixels = null;
    this._curAnim = null;
    this._curAnimName = null;
  }

  play(): void {
    this._playing = true;
  }

  stop(): void {
    this._playing = false;
  }

  gotoAndStop(aFrame: number): void {
    this.currentFrame = aFrame <= 0 ? 1 : aFrame > this.totalFrames ? this.totalFrames : aFrame;
    this.switchFrame(this.currentFrame);
    this.stop();
  }

  gotoAndPlay(aFrame: number): void {
    this.currentFrame = aFrame <= 0 ? 1 : aFrame > this.totalFrames ? this.totalFrames : aFrame;
    this.switchFrame(this.currentFrame);
    this.play();
  }

  playRandomFrame(): void {
    this.gotoAndPlay(AntMath.randomRangeInt(1, this.totalFrames));
  }

  nextFrame(aUseSpeed = false): void {
    if (aUseSpeed) {
      this.currentFrame += this.animationSpeed * AntG.timeScale;
    } else {
      ++this.currentFrame;
    }

    this.switchFrame(this.currentFrame);
  }

  prevFrame(aUseSpeed = false): void {
    if (aUseSpeed) {
      this.currentFrame -= this.animationSpeed * AntG.timeScale;
    } else {
      --this.currentFrame;
    }

    this.switchFrame(this.currentFrame);
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

  /** The drawing itself is done by the renderer; only the counters of the original remain. */
  drawActor(aCamera: AntCamera): void {
    ++AntBasic.NUM_OF_VISIBLE;
    AntBasic.BUFFERS_SIZE = (AntBasic.BUFFERS_SIZE + this.memSize) | 0;
    if (this._pixels == null || !this.onScreen(aCamera)) {
      return;
    }

    ++AntBasic.NUM_ON_SCREEN;
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

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
      throw new TypeError("AntActor: animation '" + anim.name + "' has no frame " + aIndex + '.');
    }

    this._pixels = frame;
    // T4.2: the original width/height are the size of the BitmapData of the frame (the colour bounds + 2 px of indent
    // on each side), see AntAnimation.bitmapRect; `origin` above is the offset of that bitmap.
    const rect = AntAnimation.bitmapRect(frame, anim.bitmapFrames);
    this.width = rect[2];
    this.height = rect[3];
  }

  protected updateAnimation(): void {
    if (this._playing && this._curAnim != null) {
      if (this.reverse) {
        if (this.repeat && this.roundFrame(this.currentFrame) <= 0) {
          this.currentFrame = this.totalFrames;
        }

        this.prevFrame(true);
        if (this.roundFrame(this.currentFrame) <= 0) {
          this.currentFrame = 1;
          this.animComplete();
        }
      } else {
        if (this.repeat && this.roundFrame(this.currentFrame) >= this.totalFrames - 1) {
          this.currentFrame = 1;
        }

        this.nextFrame(true);
        if (this.roundFrame(this.currentFrame) >= this.totalFrames - 1) {
          this.currentFrame = this.totalFrames;
          this.animComplete();
        }
      }
    }
  }

  protected switchFrame(aFrame: number): void {
    const index = this.roundFrame(aFrame); // :int
    if (this._prevFrame != index) {
      this.calcFrame(index);
      this._prevFrame = index;
    }
  }

  /** 1-based frame number (Number) -> 0-based frame index clamped to [0, totalFrames - 1]. */
  protected roundFrame(aFrame: number): number {
    const index = AntMath.floor(aFrame - 1) | 0; // :int
    return (index <= 0 ? 0 : index >= this.totalFrames - 1 ? (this.totalFrames - 1) | 0 : index) | 0;
  }

  protected animComplete(): void {
    if (!this.repeat) {
      this.stop();
    }

    if ((this.eventComplete as AntSignal<[AntActor]>).numListeners > 0) {
      (this.eventComplete as AntSignal<[AntActor]>).dispatch(this);
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isPlaying(): boolean {
    return this._playing;
  }

  get currentAnimation(): string | null {
    return this._curAnimName;
  }

  get animations(): AntStorage<AntAnimation> | null {
    return this._animations;
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
        this.calcFrame(this.roundFrame(this.currentFrame));
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
        this.calcFrame(this.roundFrame(this.currentFrame));
      }
    }
  }

  get strokeWeight(): number {
    return this._strokeWeight;
  }
  set strokeWeight(value: number) {
    this._strokeWeight = value | 0;
  }

  get strokeColor(): number {
    return this._strokeColor;
  }
  set strokeColor(value: number) {
    value = value >>> 0;
    if (this._strokeColor != value) {
      this._strokeColor = value;
    }
  }

  get stroke(): boolean {
    return this._stroke;
  }
  set stroke(value: boolean) {
    this._stroke = value;
    if (this._curAnim != null) {
      this.calcFrame(this.roundFrame(this.currentFrame));
    }
  }

  /** The frame of the current animation (the original: BitmapData `pixels`). */
  get pixels(): FrameMeta | null {
    return this._pixels;
  }

  /**
   * T4.2: `[x, y]` of the BitmapData of the original (the colour bounds + 2 px of indent) inside the untrimmed frame of
   * the manifest; [0, 0] when there is no frame. `origin` is the offset of that bitmap from the registration point.
   */
  get bitmapOffset(): readonly [number, number] {
    if (this._pixels == null || this._curAnim == null) {
      return [0, 0];
    }

    const rect = AntAnimation.bitmapRect(this._pixels, this._curAnim.bitmapFrames);
    return [rect[0], rect[1]];
  }

  get memSize(): number {
    return 0;
  }
}
