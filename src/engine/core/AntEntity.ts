// Port of ru/antkarlov/anthill/AntEntity.as
//
// Not ported (drawing / debug only): debugDraw(), the `mask` field (AntMask is unused by the game) and the
// beginDrawMask/endDrawMask calls of draw(). draw() keeps the traversal (children first, then the
// entity itself) so that overrides with side effects can be driven in the original order.

import type { IBubbleEventHandler } from '../events/IBubbleEventHandler';
import type { IEvent } from '../events/IEvent';
import { AntDeluxeSignal } from '../signals/AntDeluxeSignal';
import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import { AntRect } from '../utils/AntRect';
import { sortAS3 } from '../utils/as3array';
import type { AnyFunction, Ctor } from '../utils/types';
import type { AntCamera } from './AntCamera';
import { AntBasic } from './AntBasic';
import { AntG } from './AntG';

export class AntEntity extends AntBasic implements IBubbleEventHandler {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly ASCENDING = -1; // int
  static readonly DESCENDING = 1; // int

  /** `internal static var DEPTH_ID:int`: reset by Anthill every tick, preUpdate() hands the numbers out. */
  static DEPTH_ID = 0; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  parent: AntEntity | null = null;
  children: (AntEntity | null)[] | null = null;
  numChildren = 0; // int
  autoReviveChildren = false;
  z = 0; // int
  x: number = NaN;
  y: number = NaN;
  globalX: number = NaN;
  globalY: number = NaN;
  width: number = NaN;
  height: number = NaN;
  angle: number = NaN;
  globalAngle: number = NaN;
  origin: AntPoint;
  scaleX: number = NaN;
  scaleY: number = NaN;
  velocity: AntPoint;
  acceleration: AntPoint;
  drag: AntPoint;
  maxVelocity: AntPoint;
  angularVelocity: number = NaN;
  angularAcceleration: number = NaN;
  angularDrag: number = NaN;
  maxAngularVelocity: number = NaN;
  moves = false;
  vertices: AntPoint[];
  bounds: AntRect;
  health: number = NaN;

  /**
   * Not in the original: set by reset() and revive(), cleared by the FrameWriter after it wrote the
   * entity (the `teleport` flag of a Frame node, docs/03-frame-and-network-protocol.md §1).
   */
  justReset = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _scrollFactorX: number = NaN;
  protected _scrollFactorY: number = NaN;
  protected _oldPosition: AntPoint;
  protected _oldSize: AntPoint;
  protected _oldScale: AntPoint;
  protected _oldAngle: number = NaN;
  protected _sortProperty: string | null = null;
  protected _sortOrder = 0; // int
  protected _helperPoint: AntPoint;
  protected _listenerNames: (string | null)[];
  protected _listenerFuncs: (AnyFunction | null)[];
  protected _numListeners = 0; // int

  /** `internal var _depth:int` */
  _depth = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.parent = null;
    this.children = null;
    this.numChildren = 0;
    this.autoReviveChildren = false;
    this._depth = -1;
    this.z = 0;
    this.x = 0;
    this.y = 0;
    this.globalX = 0;
    this.globalY = 0;
    this.width = 0;
    this.height = 0;
    this.angle = 0;
    this.globalAngle = 0;
    this.origin = new AntPoint();
    this.scaleX = 1;
    this.scaleY = 1;
    this.velocity = new AntPoint();
    this.acceleration = new AntPoint();
    this.drag = new AntPoint();
    this.maxVelocity = new AntPoint(10000, 10000);
    this.angularVelocity = 0;
    this.angularAcceleration = 0;
    this.angularDrag = 0;
    this.maxAngularVelocity = 10000;
    this.moves = false;
    this.vertices = [];
    let i = 0;
    while (i < 4) {
      this.vertices[i++] = new AntPoint();
    }

    this.bounds = new AntRect();
    this.health = 1;
    this._scrollFactorX = 1;
    this._scrollFactorY = 1;
    this._oldPosition = new AntPoint(-1, -1);
    this._oldSize = new AntPoint(-1, -1);
    this._oldScale = new AntPoint(-1, -1);
    this._oldAngle = -1;
    this._sortProperty = null;
    this._sortOrder = AntEntity.ASCENDING;
    this._helperPoint = new AntPoint();
    this._listenerNames = [];
    this._listenerFuncs = [];
    this._numListeners = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    let child: AntEntity | null;
    let i;

    this.kill();
    if (this.children != null) {
      i = 0;
      while (i < this.numChildren) {
        child = this.children[i++] ?? null;
        if (child != null) {
          child.destroy();
        }
      }

      this.children.length = 0;
      this.numChildren = 0;
      this._sortProperty = null;
    }

    if (this.parent != null) {
      this.parent.remove(this);
    }

    super.destroy();
  }

  override kill(): void {
    let child: AntEntity | null;
    let i;

    if (this.children != null) {
      i = 0;
      while (i < this.numChildren) {
        child = this.children[i++] ?? null;
        if (child != null && child.exists) {
          child.kill();
        }
      }
    }

    super.kill();
  }

  override revive(): void {
    let child: AntEntity | null;
    let i;

    super.revive();
    this.justReset = true;
    if (this.autoReviveChildren && this.children != null) {
      i = 0;
      while (i < this.numChildren) {
        child = this.children[i++] ?? null;
        if (child != null && !child.exists) {
          child.revive();
        }
      }
    }
  }

  override preUpdate(): void {
    super.preUpdate();
    this._depth = AntEntity.DEPTH_ID++ | 0;
  }

  override update(): void {
    super.update();
    this.updateMotion();
    if (this.parent == null) {
      this.globalX = this.x;
      this.globalY = this.y;
      this.globalAngle = this.angle;
    }

    this.updateChildren();
  }

  override draw(aCamera: AntCamera): void {
    this.drawChildren(aCamera);
    super.draw(aCamera);
  }

  reset(aX = 0, aY = 0, aAngle = 0): void {
    let child: AntEntity | null;
    let i;

    this.x = aX;
    this.y = aY;
    this.angle = aAngle;
    this.justReset = true;
    if (this.parent != null) {
      this.globalX = this.parent.globalX + this.x;
      this.globalY = this.parent.globalY + this.y;
      this.globalAngle = this.parent.globalAngle + this.angle;
    } else {
      this.globalX = this.x;
      this.globalY = this.y;
      this.globalAngle = this.angle;
    }

    if (this.children != null) {
      i = 0;
      while (i < this.numChildren) {
        child = this.children[i++] ?? null;
        if (child != null && child.exists) {
          child.locate(this.globalX, this.globalY, this.globalAngle);
        }
      }
    }

    this.updateBounds();
  }

  sort(aProperty = 'y', aOrder = -1): void {
    aOrder = aOrder | 0; // aOrder:int
    if (this.children != null) {
      this._sortProperty = aProperty;
      this._sortOrder = aOrder;
      // Array.sort of AS3 is not stable: sortAS3 reproduces the order Flash Player produces.
      sortAS3(this.children, (a, b) => this.sortHandler(a, b));
    }
  }

  add(aChild: AntEntity): AntEntity {
    if (this.children == null) {
      this.children = [];
    }

    if (this.children.indexOf(aChild) > -1) {
      return aChild;
    }

    if (aChild.parent != null) {
      aChild.parent.remove(aChild);
    }

    aChild.parent = this;
    aChild.locate(this.globalX, this.globalY, this.globalAngle);
    let i = 0;
    const n = this.children.length | 0;
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

  remove(aChild: AntEntity, aSplice = false): AntEntity {
    if (this.children == null) {
      return aChild;
    }

    const i = this.children.indexOf(aChild) | 0;
    if (i < 0 || i >= this.children.length) {
      return aChild;
    }

    this.children[i] = null;
    aChild.parent = null;
    aChild._depth = -1;
    if (aSplice) {
      this.children.splice(i, 1);
      --this.numChildren;
    }

    return aChild;
  }

  contains(aChild: AntEntity): boolean {
    if (this.children == null) {
      return false;
    }

    return this.children.indexOf(aChild) >= 0 ? true : false;
  }

  /** `recycle(aClass:Class = null)`: a dead child of the class, or a new one added to the group. */
  recycle<T extends AntEntity = AntEntity>(aClass: Ctor<T> | null = null): T | null {
    let entity: AntEntity | null = this.getAvailable(aClass);
    if (entity != null) {
      return entity as T;
    }

    if (aClass == null) {
      return null;
    }

    entity = new aClass();
    return entity instanceof AntEntity ? (this.add(entity) as T) : null;
  }

  replace(aOld: AntEntity, aNew: AntEntity): AntEntity {
    if (this.children == null) {
      return aNew;
    }

    const i = this.children.indexOf(aOld) | 0;
    if (i >= 0 && i < this.children.length) {
      if (aNew.parent != null && aNew.parent != this) {
        aNew.parent.remove(aNew);
        aNew.parent = this;
      }

      this.children[i] = aNew;
      aNew.locate(this.globalX, this.globalY, this.globalAngle);
      aOld.parent = null;
    }

    return aNew;
  }

  swap(aA: AntEntity, aB: AntEntity): void {
    if (this.children == null) {
      return;
    }

    const i = this.children.indexOf(aA) | 0;
    const j = this.children.indexOf(aB) | 0;
    if (i >= 0 && i < this.children.length && j >= 0 && j < this.children.length) {
      this.children[i] = aB;
      this.children[j] = aA;
    }
  }

  removeAll(aDestroy = true): void {
    let child: AntEntity | null;
    if (this.children == null) {
      return;
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i] ?? null;
      if (child != null) {
        if (aDestroy) {
          child.destroy();
        }

        child.parent = null;
        child._depth = -1;
      }

      this.children[i] = null;
      i++;
    }

    this.children.length = 0;
    this.numChildren = 0;
  }

  getAvailable<T extends AntEntity = AntEntity>(aClass: Ctor<T> | null = null): T | null {
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && !child.exists && (aClass == null || child instanceof aClass)) {
        return child as T;
      }
    }

    return null;
  }

  getExtant<T extends AntEntity = AntEntity>(aClass: Ctor<T> | null = null): T | null {
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && (aClass == null || child instanceof aClass)) {
        return child as T;
      }
    }

    return null;
  }

  getAlive<T extends AntEntity = AntEntity>(aClass: Ctor<T> | null = null): T | null {
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && child.exists && child.alive && (aClass == null || child instanceof aClass)) {
        return child as T;
      }
    }

    return null;
  }

  getDead<T extends AntEntity = AntEntity>(aClass: Ctor<T> | null = null): T | null {
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && !child.alive && (aClass == null || child instanceof aClass)) {
        return child as T;
      }
    }

    return null;
  }

  numLiving(): number {
    let child: AntEntity | null;
    if (this.children == null) {
      return -1;
    }

    let n = 0; // :int
    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && child.exists && child.alive) {
        n++;
      }
    }

    return n;
  }

  numDead(): number {
    let child: AntEntity | null;
    if (this.children == null) {
      return -1;
    }

    let n = 0; // :int
    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && !child.alive) {
        n++;
      }
    }

    return n;
  }

  getRandom<T extends AntEntity = AntEntity>(aClass: Ctor<T> | null = null, aExistingOnly = true): T | null {
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    const list: AntEntity[] = [];
    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null) {
        if (aExistingOnly && child.exists && (aClass == null || child instanceof aClass)) {
          list[list.length] = child;
        } else if (!aExistingOnly && (aClass == null || child instanceof aClass)) {
          list[list.length] = child;
        }
      }
    }

    // randomRangeInt() is inclusive: the index can be list.length (an empty slot, `as AntEntity` -> null).
    child = list[AntMath.randomRangeInt(0, list.length)] ?? null;
    i = 0;
    const n = list.length | 0;
    while (i < n) {
      (list as (AntEntity | null)[])[i++] = null;
    }

    list.length = 0;
    return child as T | null;
  }

  getByTag(aTag: number): AntEntity | null {
    aTag = aTag | 0; // aTag:int
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && child.tag == aTag) {
        return child;
      }
    }

    return null;
  }

  queryByTag(aTag: number, aResult: AntEntity[] | null = null): AntEntity[] | null {
    aTag = aTag | 0; // aTag:int
    let child: AntEntity | null;
    if (this.children == null) {
      return null;
    }

    if (aResult == null) {
      aResult = [];
    }

    let i = 0;
    while (i < this.numChildren) {
      child = this.children[i++] ?? null;
      if (child != null && child.tag == aTag) {
        aResult[aResult.length] = child;
      }
    }

    return aResult;
  }

  setAll(aProperty: string, aValue: unknown, aRecurse = true): void {
    let child: AntEntity | null;
    let i = 0;
    while (i < this.numChildren) {
      child = (this.children as (AntEntity | null)[])[i++] ?? null;
      if (child != null) {
        if (aRecurse && child.isGroup) {
          child.setAll(aProperty, aValue, aRecurse);
        }

        (child as unknown as Record<string, unknown>)[aProperty] = aValue;
      }
    }
  }

  callAll(aFunctionName: string, aArgs: unknown[] | null = null, aRecurse = true): void {
    let child: AntEntity | null;
    let i = 0;
    while (i < this.numChildren) {
      child = (this.children as (AntEntity | null)[])[i++] ?? null;
      if (child != null) {
        if (aRecurse && child.isGroup) {
          child.callAll(aFunctionName, aArgs, aRecurse);
        }

        const fn = (child as unknown as Record<string, unknown>)[aFunctionName];
        if (typeof fn === 'function') {
          // DEVIATION: the original passes `this` (the group) to Function.apply, but a bound AS3 method
          // closure ignores the thisArg and runs on its own object; JS would really rebind it, so the
          // child is passed here.
          (fn as AnyFunction).apply(child, aArgs ?? []);
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hitTest(aX: number, aY: number, _aPixelPerfect = false): boolean {
    const n = this.vertices.length | 0; // :int
    let inside = false;
    let i = 0;
    let j = (n - 1) | 0; // :int
    const v = this.vertices as AntPoint[];
    while (i < n) {
      const vi = v[i] as AntPoint;
      const vj = v[j] as AntPoint;
      if (vi.y > aY != vj.y > aY && aX < ((vj.x - vi.x) * (aY - vi.y)) / (vj.y - vi.y) + vi.x) {
        inside = !inside;
      }

      j = i++;
    }

    return inside;
  }

  hitTestPoint(aPoint: AntPoint, aPixelPerfect = false): boolean {
    return this.hitTest(aPoint.x, aPoint.y, aPixelPerfect);
  }

  onScreen(aCamera: AntCamera | null = null): boolean {
    if (aCamera == null) {
      aCamera = AntG.getCamera();
    }

    const camera = aCamera as AntCamera;
    let sx;
    let sy;
    if (camera.zoomStyle == 'styleCenter') {
      // AntCamera.ZOOM_STYLE_CENTER
      sx = camera.scroll.x * -1 * this._scrollFactorX + camera.width * 0.5;
      sy = camera.scroll.y * -1 * this._scrollFactorY + camera.height * 0.5;
      sx -= (camera.width / camera.zoom) * 0.5;
      sy -= (camera.height / camera.zoom) * 0.5;
    } else {
      sx = camera.scroll.x * -1 * this._scrollFactorX;
      sy = camera.scroll.y * -1 * this._scrollFactorY;
    }

    return this.bounds.intersects(sx, sy, camera.width / camera.zoom, camera.height / camera.zoom);
  }

  getScreenPosition(aCamera: AntCamera | null = null, aResult: AntPoint | null = null): AntPoint {
    return this.toScreenPosition(this.globalX, this.globalY, aCamera, aResult);
  }

  protected toScreenPosition(
    aX: number,
    aY: number,
    aCamera: AntCamera | null = null,
    aResult: AntPoint | null = null,
  ): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (aCamera == null) {
      aCamera = AntG.getCamera();
    }

    const camera = aCamera as AntCamera;
    aResult.x = aX + camera.scroll.x * this._scrollFactorX;
    aResult.y = aY + camera.scroll.y * this._scrollFactorY;
    return aResult;
  }

  hurt(aDamage: number): boolean {
    this.health -= aDamage;
    if (this.health <= 0) {
      this.kill();
      return true;
    }

    return false;
  }

  updateBounds(): void {
    if (
      this.globalAngle == 0 &&
      (!this._oldPosition.equal(this.globalX, this.globalY) ||
        !this._oldSize.equal(this.width, this.height) ||
        !this._oldScale.equal(this.scaleX, this.scaleY))
    ) {
      this.calcBounds();
    } else if (
      this._oldAngle == this.globalAngle &&
      !this._oldPosition.equal(this.globalX, this.globalY) &&
      this._oldSize.equal(this.width, this.height) &&
      this._oldScale.equal(this.scaleX, this.scaleY)
    ) {
      this.moveBounds();
    } else if (
      this._oldAngle != this.globalAngle ||
      !this._oldPosition.equal(this.globalX, this.globalY) ||
      !this._oldSize.equal(this.width, this.height) ||
      !this._oldScale.equal(this.scaleX, this.scaleY)
    ) {
      this.rotateBounds();
    }
  }

  onEventBubbled(aEvent: IEvent | null): boolean {
    const event = aEvent as IEvent;
    let i; // :int
    if (this._numListeners > 0) {
      i = 0;
      while (i < this._numListeners) {
        if (this._listenerNames[i] == event.name) {
          ((this._listenerFuncs[i] as AnyFunction)).apply(this, [event]);
        }
        i++;
      }
    }

    return event.bubbles;
  }

  addEventListener(aEventName: string, aFunction: AnyFunction): void {
    let i; // :int
    if (aEventName == null || aFunction == null) {
      throw new Error('AntEntity: EventName and FunctionHandler must not be null.');
    }

    if (this.getEventListenerIndex(aEventName, aFunction) == -1) {
      i = 0;
      while (i < this._numListeners) {
        if (this._listenerNames[i] == null) {
          this._listenerNames[i] = aEventName;
          this._listenerFuncs[i] = aFunction;
          return;
        }
        i++;
      }

      this._listenerNames.push(aEventName);
      this._listenerFuncs.push(aFunction);
      ++this._numListeners;
    }
  }

  removeEventListener(aEventName: string, aFunction: AnyFunction, aSplice = false): void {
    const i = this.getEventListenerIndex(aEventName, aFunction) | 0;
    if (i >= 0 && i < this._numListeners) {
      this._listenerNames[i] = null;
      this._listenerFuncs[i] = null;
      if (aSplice) {
        this._listenerNames.splice(i, 1);
        this._listenerFuncs.splice(i, 1);
        --this._numListeners;
      }
    }
  }

  clearListeners(aEventName: string | null = null): void {
    let i = 0; // :int
    while (i < this._numListeners) {
      if (aEventName == null || this._listenerNames[i] == aEventName) {
        this._listenerNames[i] = null;
        this._listenerFuncs[i] = null;
      }
      i++;
    }

    if (aEventName == null) {
      this._listenerNames.length = 0;
      this._listenerFuncs.length = 0;
      this._numListeners = 0;
    }
  }

  getEventListenerIndex(aEventName: string, aFunction: AnyFunction): number {
    let i = 0; // :int
    while (i < this._numListeners) {
      if (this._listenerNames[i] == aEventName && this._listenerFuncs[i] == aFunction) {
        return i;
      }
      i++;
    }

    return -1;
  }

  dispatchEvent(aEvent: IEvent): void {
    // `new AntDeluxeSignal(this, IEvent)`: the class argument only sets the expected argument count.
    const signal = new AntDeluxeSignal(this, Object);
    signal.dispatch(aEvent);
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected updateChildren(): void {
    let child: AntEntity | null;
    let i;
    if (this.children != null) {
      i = 0;
      while (i < this.numChildren) {
        child = this.children[i++] ?? null;
        if (child != null && child.exists && child.alive) {
          if (!child.moves) {
            child.locate(this.globalX, this.globalY, this.globalAngle);
          }

          if (child.active) {
            child.preUpdate();
            child.update();
            child.postUpdate();
          }
        }
      }
    }
  }

  protected drawChildren(aCamera: AntCamera): void {
    let child: AntEntity | null;
    let i;
    if (this.children != null) {
      i = 0;
      while (i < this.numChildren) {
        child = this.children[i++] ?? null;
        if (child != null && child.exists && child.visible) {
          child.draw(aCamera);
        }
      }
    }
  }

  protected calcBounds(): void {
    const v = this.vertices as AntPoint[];
    (v[0] as AntPoint).set(this.globalX + this.origin.x * this.scaleX, this.globalY + this.origin.y * this.scaleY);
    (v[1] as AntPoint).set(
      this.globalX + this.width * this.scaleX + this.origin.x * this.scaleX,
      this.globalY + this.origin.y * this.scaleY,
    );
    (v[2] as AntPoint).set(
      this.globalX + this.width * this.scaleX + this.origin.x * this.scaleX,
      this.globalY + this.height * this.scaleY + this.origin.y * this.scaleY,
    );
    (v[3] as AntPoint).set(
      this.globalX + this.origin.x * this.scaleX,
      this.globalY + this.height * this.scaleY + this.origin.y * this.scaleY,
    );
    this.invertVertices();
    const p0 = v[0] as AntPoint;
    const p2 = v[2] as AntPoint;
    this.bounds.set(p0.x, p0.y, p2.x - p0.x, p2.y - p0.y);
    this.saveOldPosition();
  }

  protected moveBounds(): void {
    const dx = this.globalX - this._oldPosition.x;
    const dy = this.globalY - this._oldPosition.y;
    this.bounds.x += dx;
    this.bounds.y += dy;
    let i = 0; // :int
    while (i < 4) {
      const p = this.vertices[i] as AntPoint;
      p.x += dx;
      p.y += dy;
      i++;
    }

    this.saveOldPosition();
  }

  protected rotateBounds(): void {
    let nx;
    let ny;
    const v = this.vertices as AntPoint[];
    (v[0] as AntPoint).set(this.globalX + this.origin.x * this.scaleX, this.globalY + this.origin.y * this.scaleY);
    (v[1] as AntPoint).set(
      this.globalX + this.width * this.scaleX + this.origin.x * this.scaleX,
      this.globalY + this.origin.y * this.scaleY,
    );
    (v[2] as AntPoint).set(
      this.globalX + this.width * this.scaleX + this.origin.x * this.scaleX,
      this.globalY + this.height * this.scaleY + this.origin.y * this.scaleY,
    );
    (v[3] as AntPoint).set(
      this.globalX + this.origin.x * this.scaleX,
      this.globalY + this.height * this.scaleY + this.origin.y * this.scaleY,
    );
    this.invertVertices();
    let p = v[0] as AntPoint;
    let maxX = p.x;
    let maxY = p.y;
    p = v[2] as AntPoint;
    let minX = p.x;
    let minY = p.y;
    const a = (-this.globalAngle * Math.PI) / 180;
    let i = 0; // :int
    while (i < 4) {
      p = v[i] as AntPoint;
      nx = this.globalX + (p.x - this.globalX) * Math.cos(a) + (p.y - this.globalY) * Math.sin(a);
      ny = this.globalY - (p.x - this.globalX) * Math.sin(a) + (p.y - this.globalY) * Math.cos(a);
      maxX = nx > maxX ? nx : maxX;
      maxY = ny > maxY ? ny : maxY;
      minX = nx < minX ? nx : minX;
      minY = ny < minY ? ny : minY;
      p.x = nx;
      p.y = ny;
      i++;
    }

    this.bounds.set(minX, minY, maxX - minX, maxY - minY);
    this.saveOldPosition();
  }

  protected invertVertices(): void {
    const v = this.vertices as AntPoint[];
    if (this.scaleX < 0) {
      this._helperPoint.copyFrom(v[0] as AntPoint);
      (v[0] as AntPoint).copyFrom(v[1] as AntPoint);
      (v[1] as AntPoint).copyFrom(this._helperPoint);
      this._helperPoint.copyFrom(v[2] as AntPoint);
      (v[2] as AntPoint).copyFrom(v[3] as AntPoint);
      (v[3] as AntPoint).copyFrom(this._helperPoint);
    }

    if (this.scaleY < 0) {
      this._helperPoint.copyFrom(v[0] as AntPoint);
      (v[0] as AntPoint).copyFrom(v[3] as AntPoint);
      (v[3] as AntPoint).copyFrom(this._helperPoint);
      this._helperPoint.copyFrom(v[1] as AntPoint);
      (v[1] as AntPoint).copyFrom(v[2] as AntPoint);
      (v[2] as AntPoint).copyFrom(this._helperPoint);
    }
  }

  /** Global position/angle from the parent's global position/angle and the local x/y/angle. */
  protected locate(aParentX: number, aParentY: number, aParentAngle: number): void {
    const a = (aParentAngle / 180) * Math.PI;
    const lx = this.x;
    const ly = this.y;
    const rx = lx * Math.cos(a) - ly * Math.sin(a);
    const ry = lx * Math.sin(a) + ly * Math.cos(a);
    this.globalX = aParentX + rx;
    this.globalY = aParentY + ry;
    this.globalAngle = aParentAngle + this.angle;
  }

  protected updateMotion(): void {
    let delta;
    let dx;
    let dy;
    if (this.moves) {
      delta =
        (AntMath.calcVelocity(
          this.angularVelocity,
          this.angularAcceleration,
          this.angularDrag,
          this.maxAngularVelocity,
        ) -
          this.angularVelocity) *
        0.5;
      this.angularVelocity += delta;
      this.angle = AntMath.normAngleDeg(this.angle + this.angularVelocity * AntG.elapsed);
      this.angularVelocity += delta;
      delta =
        (AntMath.calcVelocity(this.velocity.x, this.acceleration.x, this.drag.x, this.maxVelocity.x) -
          this.velocity.x) *
        0.5;
      this.velocity.x += delta;
      dx = this.velocity.x * AntG.elapsed;
      this.velocity.x += delta;
      delta =
        (AntMath.calcVelocity(this.velocity.y, this.acceleration.y, this.drag.y, this.maxVelocity.y) -
          this.velocity.y) *
        0.5;
      this.velocity.y += delta;
      dy = this.velocity.y * AntG.elapsed;
      this.velocity.y += delta;
      this.x += dx;
      this.y += dy;
      if (this.parent != null) {
        this.locate(this.parent.globalX, this.parent.globalY, this.parent.globalAngle);
      }
    }
  }

  protected saveOldPosition(): void {
    this._oldPosition.set(this.globalX, this.globalY);
    this._oldSize.set(this.width, this.height);
    this._oldScale.set(this.scaleX, this.scaleY);
    this._oldAngle = this.globalAngle;
  }

  protected sortHandler(aA: AntEntity | null, aB: AntEntity | null): number {
    if (aA == null) {
      return this._sortOrder;
    }

    if (aB == null) {
      return -this._sortOrder;
    }

    const prop = this._sortProperty as string;
    const a = (aA as unknown as Record<string, number>)[prop] as number;
    const b = (aB as unknown as Record<string, number>)[prop] as number;
    if (a < b) {
      return this._sortOrder;
    }

    if (a > b) {
      return -this._sortOrder;
    }

    return 0;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get scrollFactorX(): number {
    return this._scrollFactorX;
  }
  set scrollFactorX(value: number) {
    let child: AntEntity | null;
    let i;
    if (this._scrollFactorX != value) {
      this._scrollFactorX = value;
      i = 0;
      while (i < this.numChildren) {
        child = (this.children as (AntEntity | null)[])[i++] ?? null;
        if (child != null) {
          child.scrollFactorX = this._scrollFactorX;
        }
      }
    }
  }

  get scrollFactorY(): number {
    return this._scrollFactorY;
  }
  set scrollFactorY(value: number) {
    let child: AntEntity | null;
    let i;
    if (this._scrollFactorY != value) {
      this._scrollFactorY = value;
      i = 0;
      while (i < this.numChildren) {
        child = (this.children as (AntEntity | null)[])[i++] ?? null;
        if (child != null) {
          child.scrollFactorY = this._scrollFactorY;
        }
      }
    }
  }

  get depth(): number {
    return this._depth;
  }

  get isGroup(): boolean {
    return this.children != null ? true : false;
  }

  get isScrolled(): boolean {
    return this._scrollFactorX == 0 && this._scrollFactorY == 0 ? false : true;
  }
  set isScrolled(value: boolean) {
    this.scrollFactorX = this.scrollFactorY = value ? 1 : 0;
  }
}
