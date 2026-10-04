// Port of ru/antkarlov/anthill/extensions/livinglights/AntLight.as
//
// A light is a polygon filled with a radial gradient. The rays of `bake()` go from the centre of the light and stop
// at the first "opaque" point of the environment (AntLightEnvironment.isOpaque): that gives the polygon, and the
// touch of the light with an opaque object (eventBeginTouch / eventTouched / eventEndTouch). In the original
// AntLightEnvironment.update() calls bake() at the update of the game (it reads the picture of the previous draw).
//
// DEVIATION: the original rasterises the polygon in a Sprite (graphics.beginGradientFill / lineTo / BlurFilter) into the
// cache bitmap `_pixels` and copies it to the camera in draw(). Here `bake()` keeps the geometry of that Sprite (the
// points of the polygon relative to the light, the two stops of the gradient, the blur) and `writeFrame(sink)` hands it
// to the Frame (ext LIGHT); the renderer (src/render/LightRenderer.ts) rasterises it. `makeCache()` computes the
// bounds of the polygon (+1 px, + the blur) instead of the bounds of the non-transparent pixels of the bitmap: they
// are used only by onScreen() (does the light need drawing?).

import type { AntCamera } from '../core/AntCamera';
import { AntEntity } from '../core/AntEntity';
import { AntG } from '../core/AntG';
import { blendCode, makeUid } from '../../frame/FrameWriter';
import type { FrameSink, IFrameWritable } from '../../frame/types';
import { AntSignal } from '../signals/AntSignal';
import { AntPoint } from '../utils/AntPoint';
import { AntLightEnvironment } from './AntLightEnvironment';

export class AntLight extends AntEntity implements IFrameWritable {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventBeginTouch: AntSignal<[AntLight, number, number]>;
  eventTouched: AntSignal<[AntLight, number, number]>;
  eventEndTouch: AntSignal<[AntLight]>;
  blend: string | null;
  live: boolean;
  angleStep: number;
  rayStep: number;
  updateInterval: number;
  alpha: number;
  environment: AntLightEnvironment | null = null;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _radius: number;
  protected _lowerAngle: number;
  protected _upperAngle: number;
  protected _ratio: number[];
  protected _blur: AntPoint;
  protected _p: AntPoint;
  protected _colors: number[]; // uint
  protected _alphas: number[];
  protected _isTouching: boolean;
  protected _isBacked: boolean;
  /** `protected var _delay:Number` is never set in the original: NaN, so the first bake() always goes through. */
  protected _delay = NaN;

  /** The BlurFilter of `_flashSprite.filters`: the blur or null (no filter). */
  protected _filterBlur: AntPoint | null;

  /** The geometry of the Sprite of the last bake(): x0, y0, x1, y1, ... relative to the light (the first point is 0, 0). */
  protected _poly: number[] = [];
  protected _polyCount = 0; // int
  /** The gradient of the last bake(): ratio, r, g, b, a (0..255) of the two stops. */
  protected _stops: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  protected _bakedRadius = 0;
  protected _bakedBlurX = 0;
  protected _bakedBlurY = 0;
  /** `_pixels != null`: the cache of the picture exists. */
  protected _hasPixels = false;
  protected _points: number[] = [];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.eventBeginTouch = new AntSignal<[AntLight, number, number]>(AntLight, Number, Number);
    this.eventTouched = new AntSignal<[AntLight, number, number]>(AntLight, Number, Number);
    this.eventEndTouch = new AntSignal<[AntLight]>(AntLight);
    this.blend = 'overlay';
    this.live = true;
    this.angleStep = 10;
    this.rayStep = 5;
    this.alpha = 1;
    this.updateInterval = 0;
    this._radius = 300;
    this._lowerAngle = 0;
    this._upperAngle = 360;
    this._ratio = [100, 255];
    this._blur = new AntPoint(10, 10);
    this._p = new AntPoint(0, 0);
    this._filterBlur = new AntPoint(this._blur.x, this._blur.y);
    this._colors = [16777091, 16777215];
    this._alphas = [this.alpha, 0];
    this._isTouching = false;
    this._isBacked = false;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    if (this.environment != null) {
      this.environment.removeLight(this);
    }

    this._filterBlur = null;
    this._hasPixels = false;
    super.destroy();
  }

  /** `draw(aCamera)` without the drawing (the side effects of the original: updateBounds + the counters). */
  override draw(aCamera: AntCamera): void {
    this.updateBounds();
    this.drawLight(aCamera);
  }

  /** The render point of the Frame: the same as draw(), and the node of the light (ext LIGHT) instead of the blit. */
  writeFrame(aSink: FrameSink): void {
    this.updateBounds();
    if (!this.drawLight(aSink.camera)) {
      return;
    }

    const sx = aSink.screenX(this, this.globalX);
    const sy = aSink.screenY(this, this.globalY);
    const points = this._points;
    const n = this._polyCount * 2;
    let i = 0;
    while (i < n) {
      points[i] = sx + (this._poly[i] as number);
      points[i + 1] = sy + (this._poly[i + 1] as number);
      i += 2;
    }

    aSink.light(
      makeUid(this.entityId),
      blendCode(this.blend),
      points,
      this._polyCount,
      sx,
      sy,
      this._bakedRadius * 0.5,
      this._stops,
      2,
      this._bakedBlurX,
      this._bakedBlurY,
    );
  }

  /**
   * The rays: the polygon of the light, the touches. Called by AntLightEnvironment.updateLights() (and only for the
   * lights that exist).
   */
  bake(): void {
    if (this.live || !this._isBacked) {
      ++AntLightEnvironment.NUM_LIVE;
      this._delay += 2 * AntG.elapsed;
      if (this._delay <= this.updateInterval) {
        return;
      }

      this._delay = 0;
      this._alphas[0] = this.alpha;
      this.buildGradient();
      const poly = this._poly;
      poly.length = 0;
      poly.push(0, 0); // moveTo(0, 0)
      let angle = (this._lowerAngle + this.angle) | 0; // :int
      let distance = 0; // :int
      const upper = (this._upperAngle + this.angle) | 0; // :int
      let isTouching = false;
      let touchX = 0;
      let touchY = 0;
      const reach = this._radius * 0.5;
      const environment = this.environment as AntLightEnvironment;
      while (angle <= upper) {
        while (distance < reach) {
          const px = this.x + distance * Math.cos((angle * Math.PI) / 180);
          const py = this.y + distance * Math.sin((angle * Math.PI) / 180);
          this.toScreenPosition(px, py, null, this._p);
          if (environment.isOpaque(this._p.x | 0, this._p.y | 0)) {
            isTouching = true;
            poly.push(px - this.x, py - this.y);
            this.eventTouched.dispatch(this, this._p.x, this._p.y);
            touchX = this._p.x;
            touchY = this._p.y;
            break;
          }

          if (distance >= reach - this.rayStep) {
            poly.push(px - this.x, py - this.y);
            break;
          }

          distance = (distance + this.rayStep) | 0;
        }

        distance = 0;
        angle = (angle + this.angleStep) | 0;
      }

      this._polyCount = poly.length >> 1;
      if (isTouching != this._isTouching) {
        if (isTouching) {
          this.eventBeginTouch.dispatch(this, touchX, touchY);
        } else {
          this.eventEndTouch.dispatch(this);
        }

        this._isTouching = isTouching;
      }

      this._isBacked = true;
      this.makeCache();
    }
  }

  resetTouchState(): void {
    this._isTouching = false;
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  /** true: the light has a picture and it is on the screen (the original blits it here). */
  protected drawLight(aCamera: AntCamera): boolean {
    if (!this._hasPixels || !this.onScreen(aCamera)) {
      return false;
    }

    ++AntLightEnvironment.NUM_ON_SCREEN;
    return true;
  }

  /** `beginGradientFill(RADIAL, _colors, _alphas, _ratio, createGradientBox(radius, radius, 0, -radius/2, -radius/2))`. */
  protected buildGradient(): void {
    const stops = this._stops;
    for (let i = 0; i < 2; i++) {
      const color = this._colors[i] as number;
      stops[i * 5] = this._ratio[i] as number;
      stops[i * 5 + 1] = (color >> 16) & 0xff;
      stops[i * 5 + 2] = (color >> 8) & 0xff;
      stops[i * 5 + 3] = color & 0xff;
      const alpha = this._alphas[i] as number;
      stops[i * 5 + 4] = Math.round((alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) * 255);
    }

    this._bakedRadius = this.radius;
    this._bakedBlurX = this._filterBlur != null ? this._filterBlur.x : 0;
    this._bakedBlurY = this._filterBlur != null ? this._filterBlur.y : 0;
  }

  /** The bounds of the cache picture: origin (relative to the light), width and height (see the header). */
  protected makeCache(): void {
    const poly = this._poly;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0, n = this._polyCount * 2; i < n; i += 2) {
      const x = poly[i] as number;
      const y = poly[i + 1] as number;
      minX = x < minX ? x : minX;
      maxX = x > maxX ? x : maxX;
      minY = y < minY ? y : minY;
      maxY = y > maxY ? y : maxY;
    }

    const padX = Math.ceil(this._bakedBlurX) + 1;
    const padY = Math.ceil(this._bakedBlurY) + 1;
    const left = Math.floor(minX) - padX;
    const top = Math.floor(minY) - padY;
    const w = Math.ceil(maxX) - Math.floor(minX) + padX * 2;
    const h = Math.ceil(maxY) - Math.floor(minY) + padY * 2;
    this._hasPixels = true;
    this.origin.x = left;
    this.origin.y = top;
    this.width = this.width < w ? w : this.width;
    this.height = this.height < h ? h : this.height;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get radius(): number {
    return this._radius;
  }
  set radius(value: number) {
    this._radius = value;
    this._isBacked = false;
  }

  get lowerAngle(): number {
    return this._lowerAngle;
  }
  set lowerAngle(value: number) {
    this._lowerAngle = value;
    this._isBacked = false;
  }

  get upperAngle(): number {
    return this._upperAngle;
  }
  set upperAngle(value: number) {
    this._upperAngle = value;
    this._isBacked = false;
  }

  get colorIn(): number {
    return this._colors[0] as number;
  }
  set colorIn(value: number) {
    this._colors[0] = value >>> 0; // uint
    this._isBacked = false;
  }

  get colorOut(): number {
    return this._colors[1] as number;
  }
  set colorOut(value: number) {
    this._colors[1] = value >>> 0; // uint
    this._isBacked = false;
  }

  get ratio(): number {
    return (this._ratio[0] as number) | 0; // :int
  }
  set ratio(value: number) {
    value = value | 0; // param:int
    this._ratio[0] = value < 0 ? 0 : value > 255 ? 255 : value;
    this._isBacked = false;
  }

  get blur(): AntPoint {
    return new AntPoint(this._blur.x, this._blur.y);
  }
  set blur(value: AntPoint) {
    // `_flashSprite.filters` always is an Array in Flash (never null) and its filters are copies: only "remove the
    // filter" and "a new filter" change anything (the third branch of the original changes a copy).
    this._blur.copyFrom(value);
    if (this._blur.x == 0 && this._blur.y == 0 && this._filterBlur != null) {
      this._filterBlur = null;
    } else if (this._blur.x > 0) {
      this._filterBlur = new AntPoint(this._blur.x, this._blur.y);
    }

    this._isBacked = false;
  }
}
