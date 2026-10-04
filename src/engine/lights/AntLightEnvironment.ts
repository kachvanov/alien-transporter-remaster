// Port of ru/antkarlov/anthill/extensions/livinglights/AntLightEnvironment.as
//
// The environment of the lights: its children are the "opaque" objects (in the game: the ShuttleView, Factory.makeShuttle),
// `lights` are the AntLights that look for them with their rays.
//
// DEVIATION: the original draws the children into a hidden BitmapData `_backendBuffer` filled with `transparentColor` and
// `isOpaque(x, y)` reads a pixel of it (a pixel that is not `transparentColor` is opaque). There is no BitmapData here:
// draw() records, for every visible AntActor of the children (in the drawing order, with its children), the screen
// transform of the actor and its current frame, and `isOpaque(x, y)` maps the pixel back into the frame and reads the
// alpha mask of the frame (assets/data/alphamasks.bin, the bit `alpha > 0`, T0.4). Like the buffer of the original, the
// record is made at the draw and is read at the next update(): updateLights() bakes the lights of the picture of the
// previous frame, and does nothing before the first draw. A frame without a mask counts as a rectangle of its size.
// The pixel of the actor is sampled at its centre; the original draws with smoothing, so its edge is about half a pixel
// wider.
// DEVIATION: destroy() is safe for an environment that never had a light (the original dereferences `lights`).

import { AssetRegistry } from '../assets/AssetRegistry';
import type { MaskRef } from '../assets/schemas';
import { AntActor } from '../core/AntActor';
import type { AntCamera } from '../core/AntCamera';
import { AntEntity } from '../core/AntEntity';
import type { FrameSink, IFrameWritable } from '../../frame/types';
import type { AntLight } from './AntLight';

/** One drawn actor of the environment (what AntActor.drawActor would have blitted into the backend buffer). */
interface OpaqueItem {
  /** `globalAngle == 0 && scale == 1 && blend == null && quickDraw`: copyPixels at an integer point. */
  quick: boolean;
  /** The screen position of the actor (getScreenPosition). */
  sx: number;
  sy: number;
  /** `origin` of the actor: the offset of the frame from the registration point. */
  ox: number;
  oy: number;
  scaleX: number;
  scaleY: number;
  cos: number;
  sin: number;
  /** The point of copyPixels (quick). */
  dx: number;
  dy: number;
  /** The mask of the frame, null: the rectangle `w` x `h`. */
  mask: MaskRef | null;
  w: number;
  h: number;
}

export class AntLightEnvironment extends AntEntity implements IFrameWritable {
  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  /** `internal static var` (read by AntLight); the same name as the static of AntBasic hides it, as in the original. */
  static override NUM_ON_SCREEN = 0; // int
  static NUM_VISIBLE = 0; // int
  static NUM_LIVE = 0; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  /** (unused here: the backend buffer is not a bitmap) */
  transparentColor: number; // uint
  lights: (AntLight | null)[] | null;
  numLights: number; // int

  /** The children are drawn into the backend buffer, not into the picture: the FrameWriter must not walk them. */
  readonly writesOwnChildren = true;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  /** `_backendBuffer != null`: the size of the buffer and what is drawn in it. */
  protected _bufferWidth = 0;
  protected _bufferHeight = 0;
  protected _hasBuffer = false;
  protected _items: OpaqueItem[] = [];
  protected _numItems = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.transparentColor = 4294902015;
    this.lights = null;
    this.numLights = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    if (this.lights != null && this.lights.length > 0) {
      let i = 0; // :int
      while (i < this.numLights) {
        const light = (this.lights as (AntLight | null)[])[i++] ?? null;
        if (light != null) {
          light.destroy();
        }
      }
    }

    this.lights = null;
    this._hasBuffer = false;
    this._items.length = 0;
    this._numItems = 0;
    super.destroy();
  }

  addLight(aLight: AntLight): AntLight {
    if (this.lights == null) {
      this.lights = [];
    }

    if (this.lights.indexOf(aLight) > -1) {
      return aLight;
    }

    if (aLight.environment != null) {
      aLight.environment.removeLight(aLight);
    }

    aLight.environment = this;
    let i = 0; // :int
    const n = this.lights.length | 0; // :int
    while (i < n) {
      if (this.lights[i] == null) {
        this.lights[i] = aLight;
        return aLight;
      }

      i++;
    }

    this.lights[n] = aLight;
    ++this.numLights;
    return aLight;
  }

  removeLight(aLight: AntLight, aSplice = false): AntLight {
    if (this.lights == null) {
      return aLight;
    }

    const index = this.lights.indexOf(aLight);
    if (index < 0 || index >= this.lights.length) {
      return aLight;
    }

    this.lights[index] = null;
    aLight.environment = null;
    if (aSplice) {
      this.lights.splice(index, 1);
      --this.numLights;
    }

    return aLight;
  }

  /** Unlike AntEntity.add(), the child does not get this entity as its `parent` (it stays in its own layer). */
  override add(aChild: AntEntity): AntEntity {
    if (this.children == null) {
      this.children = [];
    }

    if (this.children.indexOf(aChild) > -1) {
      return aChild;
    }

    let i = 0; // :int
    const n = this.children.length | 0; // :int
    while (i < n) {
      if (this.children[i] == null) {
        this.children[i] = aChild;
        return aChild;
      }

      i++;
    }

    this.children[n] = aChild;
    ++this.numChildren;
    return aChild;
  }

  /**
   * Is the pixel (aX, aY) of the camera picture (800x600) covered by an object of the environment? `int` arguments,
   * like the original. As in the original a point that is exactly on the far edge of the buffer (x == width or
   * y == height) counts as opaque (BitmapData.getPixel returns 0 there, and 0 is not the transparent colour).
   */
  isOpaque(aX: number, aY: number): boolean {
    aX = aX | 0; // param:int
    aY = aY | 0; // param:int
    if (!this._hasBuffer) {
      return true;
    }

    if (aX < 0 || aX > this._bufferWidth || aY < 0 || aY > this._bufferHeight) {
      return false;
    }

    if (aX == this._bufferWidth || aY == this._bufferHeight) {
      return true;
    }

    const registry = AssetRegistry.current;
    const masks = registry != null && registry.alphaMasks != null ? registry : null;
    let i = 0; // :int
    while (i < this._numItems) {
      const item = this._items[i++] as OpaqueItem;
      let px: number;
      let py: number;
      if (item.quick) {
        px = aX - item.dx;
        py = aY - item.dy;
      } else {
        // the matrix of AntActor.drawActor: translate(origin), scale, rotate, translate(screen)
        const qx = aX + 0.5 - item.sx;
        const qy = aY + 0.5 - item.sy;
        const ux = (qx * item.cos + qy * item.sin) / item.scaleX;
        const uy = (qy * item.cos - qx * item.sin) / item.scaleY;
        px = Math.floor(ux - item.ox);
        py = Math.floor(uy - item.oy);
      }

      if (px < 0 || py < 0 || px >= item.w || py >= item.h) {
        continue;
      }

      if (item.mask == null || masks == null || masks.isMaskSet(item.mask, px, py)) {
        return true;
      }
    }

    return false;
  }

  override update(): void {
    this.updateLights();
  }

  override draw(aCamera: AntCamera): void {
    this.drawEnvironment(aCamera, null);
  }

  /** The render point of the Frame: the lights make their nodes. */
  writeFrame(aSink: FrameSink): void {
    this.drawEnvironment(aSink.camera, aSink);
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected updateLights(): void {
    if (!this._hasBuffer) {
      return;
    }

    AntLightEnvironment.NUM_LIVE = 0;
    let i = 0; // :int
    while (i < this.numLights) {
      const light = (this.lights as (AntLight | null)[])[i++] ?? null;
      if (light != null && light.exists) {
        light.update();
        light.bake();
      }
    }
  }

  /** draw() of the original: the children into the backend buffer, then the lights. */
  protected drawEnvironment(aCamera: AntCamera, aSink: FrameSink | null): void {
    this._bufferWidth = aCamera.width | 0;
    this._bufferHeight = aCamera.height | 0;
    this._hasBuffer = true;
    this._numItems = 0;
    this.collectChildren(this, aCamera);
    this.drawLights(aCamera, aSink);
  }

  protected drawLights(aCamera: AntCamera, aSink: FrameSink | null): void {
    AntLightEnvironment.NUM_VISIBLE = 0;
    AntLightEnvironment.NUM_ON_SCREEN = 0;
    let i = 0; // :int
    while (i < this.numLights) {
      const light = (this.lights as (AntLight | null)[])[i++] ?? null;
      if (light != null && light.exists && light.visible) {
        ++AntLightEnvironment.NUM_VISIBLE;
        if (aSink != null) {
          light.writeFrame(aSink);
        } else {
          light.draw(aCamera);
        }
      }
    }
  }

  /** drawChildren() of the tree below `aEntity`: AntActor.draw() first the actor, then its children. */
  private collectChildren(aEntity: AntEntity, aCamera: AntCamera): void {
    const children = aEntity.children;
    if (children == null) {
      return;
    }

    let i = 0; // :int
    while (i < aEntity.numChildren) {
      const child = children[i++] ?? null;
      if (child != null && child.exists && child.visible) {
        if (child instanceof AntActor) {
          this.collectActor(child, aCamera);
        }

        this.collectChildren(child, aCamera);
      }
    }
  }

  private collectActor(aActor: AntActor, aCamera: AntCamera): void {
    const meta = aActor.currentFrameMeta;
    if (meta != null) {
      aActor.updateBounds();
    }

    aActor.drawActor(aCamera);
    if (meta == null || !aActor.onScreen(aCamera) || !(aActor.alpha > 0)) {
      return;
    }

    let item = this._items[this._numItems];
    if (item === undefined) {
      item = {
        quick: false,
        sx: 0,
        sy: 0,
        ox: 0,
        oy: 0,
        scaleX: 1,
        scaleY: 1,
        cos: 1,
        sin: 0,
        dx: 0,
        dy: 0,
        mask: null,
        w: 0,
        h: 0,
      };
      this._items[this._numItems] = item;
    }

    this._numItems++;
    const screen = aActor.getScreenPosition(aCamera);
    item.sx = screen.x;
    item.sy = screen.y;
    item.ox = aActor.origin.x;
    item.oy = aActor.origin.y;
    item.scaleX = aActor.scaleX;
    item.scaleY = aActor.scaleY;
    const angle = Math.PI * 2 * (aActor.globalAngle / 360);
    item.cos = Math.cos(angle);
    item.sin = Math.sin(angle);
    item.quick =
      aActor.globalAngle == 0 && aActor.scaleX == 1 && aActor.scaleY == 1 && aActor.blend == null && aActor.quickDraw;
    // copyPixels(…, destPoint): the point is cut to integers
    item.dx = (screen.x + aActor.origin.x) | 0;
    item.dy = (screen.y + aActor.origin.y) | 0;
    item.mask = meta.mask ?? null;
    if (item.mask != null) {
      item.w = item.mask.w;
      item.h = item.mask.h;
    } else {
      item.w = Math.ceil(meta.size1x[0]);
      item.h = Math.ceil(meta.size1x[1]);
    }

    if (!(item.scaleX != 0 && item.scaleY != 0)) {
      this._numItems--; // a flat actor draws nothing
    }
  }
}
