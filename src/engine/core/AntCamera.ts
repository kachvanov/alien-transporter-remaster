// Port of ru/antkarlov/anthill/AntCamera.as
//
// No buffer: the camera is only scroll/shake/follow state (the FrameWriter applies it when it writes a
// Frame). Not ported: buffer, _flashBitmap/_flashSprite (sprite, screenSprite), beginDraw/endDraw,
// beginDrawMask/endDrawMask (AntMask is unused by the game), memSize.
// DEVIATION: shake() uses AntMath.random() instead of Math.random() (determinism).

import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import { AntRect } from '../utils/AntRect';
import { AntSignal } from '../signals/AntSignal';
import { AntBasic } from './AntBasic';
import type { AntEntity } from './AntEntity';
import { AntG } from './AntG';

export class AntCamera extends AntBasic {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly STYLE_FREELY = 0; // uint
  static readonly STYLE_HORIZONTAL = 1; // uint
  static readonly STYLE_VERTICAL = 2; // uint

  static readonly ZOOM_STYLE_DEFAULT = 'styleDefault';
  static readonly ZOOM_STYLE_CENTER = 'styleCenter';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  x: number = NaN;
  y: number = NaN;
  width = 0; // int
  height = 0; // int
  fillBackground = false;
  backgroundColor = 0; // uint
  scroll: AntPoint;
  bounds: AntRect | null = null;
  target: AntEntity | null = null;
  followStyle = 0; // uint
  leadingFactor: number = NaN;
  smoothFactor: number = NaN;
  positionPropertyX: string;
  positionPropertyY: string;
  roundPosition = false;
  screenCenter: AntPoint;
  eventShakeFinished: AntSignal<[AntCamera]>;
  /** Bitmap smoothing of the camera image (Bitmap.smoothing: false by default in Flash). */
  smoothing = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _zoom: number = NaN;
  protected _zoomStyle: string;
  protected _newPos: AntPoint;
  protected _shaker: AntPoint[];
  protected _shakerIndex = 0; // int
  protected _shakerDelay: number = NaN;
  protected _isShake = false;
  protected _shakePos: AntPoint | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aWidth: number, aHeight: number, aZoom = 1) {
    super();
    aWidth = aWidth | 0; // param3:int
    aHeight = aHeight | 0; // param4:int
    this.x = aX;
    this.y = aY;
    this.width = aWidth;
    this.height = aHeight;
    this.fillBackground = false;
    this.backgroundColor = 4278190080 >>> 0;
    this.scroll = new AntPoint();
    this._zoom = aZoom;
    this._zoomStyle = AntCamera.ZOOM_STYLE_DEFAULT;
    this.bounds = null;
    this.screenCenter = new AntPoint(this.width * 0.5 * this._zoom, this.height * 0.5 * this._zoom);
    this._newPos = new AntPoint();
    this.target = null;
    this.followStyle = AntCamera.STYLE_FREELY;
    this.leadingFactor = 8;
    this.smoothFactor = 0.25;
    this.positionPropertyX = 'globalX';
    this.positionPropertyY = 'globalY';
    this.roundPosition = false;
    this._shaker = [];
    this._shakerIndex = 0;
    this._isShake = false;
    this.eventShakeFinished = new AntSignal<[AntCamera]>(AntCamera);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    this.target = null;
    AntG.removeCamera(this);
  }

  /** Shake for `aDuration` steps, the amplitude of step i is `aIntensity * i`. */
  shake(aIntensity = 4, aDuration = 4): void {
    aDuration = aDuration | 0; // param2:int
    let p: AntPoint;
    this._shaker.length = 0;
    const dir = AntMath.random(); // Math.random() in the original
    let i = 0; // :int
    while (i < aDuration) {
      p = new AntPoint();
      if (i % 2 == 0) {
        p.x = dir > 0.5 ? -aIntensity * i : aIntensity * i;
        p.y = aIntensity * i;
      } else {
        p.x = dir > 0.5 ? aIntensity * i : -aIntensity * i;
        p.y = -aIntensity * i;
      }

      this._shaker.push(p);
      i++;
    }

    this._shakerDelay = 0;
    this._shakerIndex = (this._shaker.length - 1) | 0;
    this._shakePos = this._shaker[this._shakerIndex] ?? null;
    this._isShake = true;
  }

  follow(aTarget: AntEntity, aStyle = 0): void {
    aStyle = aStyle >>> 0; // param2:uint
    this.target = aTarget;
    this.followStyle = aStyle;
  }

  focusOnPoint(aPoint: AntPoint): void {
    this.focusOn(aPoint.x, aPoint.y);
  }

  focusOn(aX: number, aY: number): void {
    aX += aX > 0 ? 1e-7 : -1e-7;
    aY += aY > 0 ? 1e-7 : -1e-7;
    this._newPos.x = -(aX - this.width) - this.screenCenter.x;
    this._newPos.y = -(aY - this.height) - this.screenCenter.y;
    if (this.bounds != null) {
      this._newPos.x = this.limitByX(this._newPos.x);
      this._newPos.y = this.limitByY(this._newPos.y);
    }

    this.scroll.x = this._newPos.x;
    this.scroll.y = this._newPos.y;
  }

  setBounds(aX: number, aY: number, aWidth: number, aHeight: number): void {
    aX = aX | 0;
    aY = aY | 0;
    aWidth = aWidth | 0;
    aHeight = aHeight | 0;
    if (this.bounds == null) {
      this.bounds = new AntRect();
    }

    this.bounds.set(aX, aY, aWidth, aHeight);
    this.update();
  }

  override update(): void {
    if (!this.exists || !this.active) {
      return;
    }

    if (this.target != null) {
      const target = this.target as unknown as Record<string, number>;
      switch (this.followStyle) {
        case AntCamera.STYLE_FREELY:
          this._newPos.x =
            (this.scroll.x -
              (-(target[this.positionPropertyX] as number) +
                this.screenCenter.x -
                this.target.velocity.x * AntG.elapsed * this.leadingFactor)) *
            this.smoothFactor;
          this._newPos.y =
            (this.scroll.y -
              (-(target[this.positionPropertyY] as number) +
                this.screenCenter.y -
                this.target.velocity.y * AntG.elapsed * this.leadingFactor)) *
            this.smoothFactor;
          break;
        case AntCamera.STYLE_HORIZONTAL:
          this._newPos.x =
            (this.scroll.x -
              (-(target[this.positionPropertyX] as number) +
                this.screenCenter.x -
                this.target.velocity.x * AntG.elapsed * this.leadingFactor)) *
            this.smoothFactor;
          break;
        case AntCamera.STYLE_VERTICAL:
          this._newPos.y =
            (this.scroll.y -
              (-(target[this.positionPropertyY] as number) +
                this.screenCenter.y -
                this.target.velocity.y * AntG.elapsed * this.leadingFactor)) *
            this.smoothFactor;
      }

      this._newPos.set(this.scroll.x - this._newPos.x, this.scroll.y - this._newPos.y);
      this.updateShaker(this._newPos);
      if (this.bounds != null) {
        this._newPos.x = this.limitByX(this._newPos.x);
        this._newPos.y = this.limitByY(this._newPos.y);
      }

      if (this.roundPosition) {
        this.scroll.x = Math.round(this._newPos.x);
        this.scroll.y = Math.round(this._newPos.y);
      } else {
        this.scroll.x = this._newPos.x;
        this.scroll.y = this._newPos.y;
      }
    } else if (this.bounds != null) {
      this.updateShaker(this.scroll);
      this.scroll.x = this.limitByX(this.scroll.x);
      this.scroll.y = this.limitByY(this.scroll.y);
      if (this.roundPosition) {
        this.scroll.x = Math.round(this.scroll.x);
        this.scroll.y = Math.round(this.scroll.y);
      }
    } else {
      this.updateShaker(this.scroll);
    }
  }

  //---------------------------------------
  // PRIVATE / PROTECTED METHODS
  //---------------------------------------

  private updateShaker(aPoint: AntPoint): void {
    if (this._isShake) {
      this._shakerDelay -= 2 * AntG.elapsed;
      if (this._shakerDelay <= 0) {
        if (this._shakerIndex < 0) {
          this._isShake = false;
          this.eventShakeFinished.dispatch(this);
        } else {
          this._shakePos = this._shaker[this._shakerIndex] ?? null;
        }

        --this._shakerIndex;
        this._shakerDelay = 0.08;
      }

      const shakePos = this._shakePos as AntPoint;
      aPoint.x = AntMath.lerp(aPoint.x + shakePos.x, aPoint.x, 0.5);
      aPoint.y = AntMath.lerp(aPoint.y + shakePos.y, aPoint.y, 0.5);
    }
  }

  protected limitByX(aValue: number): number {
    const bounds = this.bounds as AntRect;
    if (aValue > bounds.left) {
      aValue = bounds.left;
    } else if (AntMath.abs(aValue) > bounds.right - this.width) {
      aValue = -(bounds.right - this.width);
    }

    return aValue;
  }

  protected limitByY(aValue: number): number {
    const bounds = this.bounds as AntRect;
    if (aValue > bounds.top) {
      aValue = bounds.top;
    } else if (AntMath.abs(aValue) > bounds.bottom - this.height) {
      aValue = -(bounds.bottom - this.height);
    }

    return aValue;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get zoomStyle(): string {
    return this._zoomStyle;
  }
  set zoomStyle(value: string) {
    this._zoomStyle = value;
  }

  get zoom(): number {
    return this._zoom;
  }
  set zoom(value: number) {
    this._zoom = value;
  }
}
