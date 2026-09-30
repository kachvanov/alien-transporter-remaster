// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DManager.as
//
// DEVIATION: AntBox2DDrawer (a flash.display.Sprite that Box2D's b2DebugDraw draws into) is not ported. The
// debug picture is produced as a list of lines by collectDebugLines(world) (debugLines.ts) that the
// FrameWriter sends when the Frame has `hasDebug`. `enableDebugDraw` stays as a plain flag the FrameWriter
// reads; `debugDrawer` and the drawer flags (drawShapes, drawJoints, ...) are gone, draw() is empty.

import type { AntCamera } from '../../engine/core/AntCamera';
import { AntG } from '../../engine/core/AntG';
import type { IPlugin } from '../../engine/plugins/IPlugin';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntSignal } from '../../engine/signals/AntSignal';
import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import { asType } from '../../engine/utils/cast';
import type { AnyFunction } from '../../engine/utils/types';
import {
  b2AABB,
  b2Body,
  b2Distance,
  b2DistanceInput,
  b2DistanceOutput,
  b2DistanceProxy,
  b2SimplexCache,
  b2Vec2,
  b2World,
} from '../box2dweb';
import type { b2BodyDef, b2ContactFilter, b2ContactListener, b2Fixture } from '../box2dweb';
import { AntBox2DBody } from './AntBox2DBody';
import { AntBox2DContactFilter } from './AntBox2DContactFilter';
import { AntBox2DContactListener } from './AntBox2DContactListener';

export class AntBox2DManager implements IPlugin {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  box2dWorld: b2World | null = null;
  velocityIterations = 0; // int
  positionIterations = 0; // int
  step: number = NaN;
  scale: number = NaN;
  eventBodyAdded: AntSignal<[b2Body]>;
  pause = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _tag: string | null = null;
  protected _priority = 0; // int
  /** Never assigned in the original: the world is created with `doSleep = false` (bodies never fall asleep). */
  protected _allowSleep = false;
  protected _gravity: b2Vec2;
  protected _tm: AntTaskManager;
  protected _enableDebugDraw = false; // DEVIATION: replaces `_debugDrawer:AntBox2DDrawer`
  protected _isStopped = false;
  protected _hitTestVec: b2Vec2;
  protected _hitTestBody: b2Body | null = null;
  protected _hitTestIncludeStatic = false;
  protected _hitTestCallbackFunc: AnyFunction | null = null;
  protected _rayCastCallbackFunc: AnyFunction | null = null;
  protected _explosionPoint: b2Vec2 | null = null;
  protected _explosionForce: number = NaN;
  protected _explosionDamage: number = NaN;
  protected _explosionSource: b2Body | null = null;
  protected _explosionRadius: number = NaN;
  protected _contactListener: b2ContactListener | null = null;
  protected _contactFilter: b2ContactFilter | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this.box2dWorld = null;
    this.velocityIterations = 6;
    this.positionIterations = 15;
    this.step = 1 / 40;
    this.scale = 30;
    this.eventBodyAdded = new AntSignal<[b2Body]>(b2Body);
    this.pause = false;
    this._tag = null;
    this._priority = 0;
    this._gravity = new b2Vec2(0, 9.81);
    this._tm = new AntTaskManager();
    this._enableDebugDraw = false;
    this._isStopped = true;
    this._hitTestVec = new b2Vec2();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {}

  create(aStart = true, aContactListener: b2ContactListener | null = null, aContactFilter: b2ContactFilter | null = null): void {
    this.box2dWorld = new b2World(this._gravity, this._allowSleep);
    this._contactListener = aContactListener == null ? new AntBox2DContactListener() : aContactListener;
    this._contactFilter = aContactFilter == null ? new AntBox2DContactFilter() : aContactFilter;
    this.box2dWorld.SetContactListener(this._contactListener);
    this.box2dWorld.SetContactFilter(this._contactFilter);
    if (aStart) {
      this.start();
    }
  }

  kill(): void {
    if (this.box2dWorld != null) {
      this.enableDebugDraw = false;
      this.box2dWorld.SetContactListener(null);
      this.box2dWorld.SetContactFilter(null);
      this.box2dWorld = null;
    }
  }

  revive(): void {
    this.box2dWorld = new b2World(this._gravity, this._allowSleep);
    this.box2dWorld.SetContactListener(this._contactListener);
    this.box2dWorld.SetContactFilter(this._contactFilter);
  }

  start(): void {
    if (this._isStopped) {
      AntG.plugins.add(this);
      this._isStopped = false;
    }
  }

  stop(): void {
    if (!this._isStopped) {
      AntG.plugins.remove(this);
      this._isStopped = true;
    }
  }

  addBody(aDef: b2BodyDef): b2Body | null {
    if (this.box2dWorld == null) {
      AntG.log("Warning: Can't to make the Box2D body. The Box2D world is not initialized.", 'error');
      return null;
    }

    if (!this.box2dWorld.IsLocked()) {
      return this.box2dWorld.CreateBody(aDef);
    }

    this._tm.addInstantTask((def: b2BodyDef) => this.addBody(def), [aDef]);
    return null;
  }

  removeBody(aBody: b2Body): void {
    if (this.box2dWorld == null) {
      AntG.log("Warning: Can't to remove the Box2D body. The Box2D world is not initialized.", 'error');
      return;
    }

    if (!this.box2dWorld.IsLocked()) {
      const body = asType(aBody.GetUserData(), AntBox2DBody);
      if (body != null) {
        body.box2dBody = null;
      }

      aBody.SetUserData(null);
      this.box2dWorld.DestroyBody(aBody);
    } else {
      this._tm.addInstantTask((b: b2Body) => this.removeBody(b), [aBody]);
    }
  }

  queryRect(aX1: number, aY1: number, aX2: number, aY2: number, aCallback: AnyFunction, aIncludeStatic = false): void {
    this._hitTestIncludeStatic = aIncludeStatic;
    this._hitTestCallbackFunc = aCallback;
    const aabb = new b2AABB();
    aabb.lowerBound.Set(aX1 / this.scale, aY1 / this.scale);
    aabb.upperBound.Set(aX2 / this.scale, aY2 / this.scale);
    (this.box2dWorld as b2World).QueryAABB(this.queryCallback, aabb);
  }

  queryCircle(aX: number, aY: number, aRadius: number, aCallback: AnyFunction, aIncludeStatic = false): void {
    aRadius /= this.scale;
    this._hitTestVec.Set(aX / this.scale, aY / this.scale);
    this._hitTestIncludeStatic = aIncludeStatic;
    this._hitTestCallbackFunc = aCallback;
    const aabb = new b2AABB();
    aabb.lowerBound.Set(this._hitTestVec.x - aRadius, this._hitTestVec.y - aRadius);
    aabb.upperBound.Set(this._hitTestVec.x + aRadius, this._hitTestVec.y + aRadius);
    (this.box2dWorld as b2World).QueryAABB(this.queryCallback, aabb);
  }

  /** AS3 method closure (passed to b2World.QueryAABB). */
  protected queryCallback = (aFixture: b2Fixture): boolean => {
    const body = aFixture.GetBody();
    if (body.GetType() != b2Body.b2_staticBody || this._hitTestIncludeStatic) {
      if (this._hitTestCallbackFunc != null) {
        this._hitTestCallbackFunc.call(this, asType(body.GetUserData(), AntBox2DBody));
      }
    }

    return true;
  };

  getBodyByPosition(aX: number, aY: number, aIncludeStatic = false): AntBox2DBody | null {
    const body = this.getBox2DBodyByPosition(aX, aY, aIncludeStatic);
    if (body != null) {
      return asType(body.GetUserData(), AntBox2DBody);
    }

    return null;
  }

  getBox2DBodyByPosition(aX: number, aY: number, aIncludeStatic = false): b2Body | null {
    this._hitTestVec.Set(aX / this.scale, aY / this.scale);
    this._hitTestIncludeStatic = aIncludeStatic;
    this._hitTestBody = null;
    const aabb = new b2AABB();
    aabb.lowerBound.Set(this._hitTestVec.x - 0.001, this._hitTestVec.y - 0.001);
    aabb.upperBound.Set(this._hitTestVec.x + 0.001, this._hitTestVec.y + 0.001);
    (this.box2dWorld as b2World).QueryAABB(this.getBodyCallback, aabb);
    return this._hitTestBody;
  }

  /** AS3 method closure (passed to b2World.QueryAABB). */
  protected getBodyCallback = (aFixture: b2Fixture): boolean => {
    const body = aFixture.GetBody();
    const shape = aFixture.GetShape();
    if (body.GetType() != b2Body.b2_staticBody || this._hitTestIncludeStatic) {
      if (shape.TestPoint(body.GetTransform(), this._hitTestVec)) {
        this._hitTestBody = aFixture.GetBody();
        return false;
      }
    }

    return true;
  };

  rayCastOne(aPoint1: AntPoint, aPoint2: AntPoint): AntBox2DBody | null {
    const fixture = (this.box2dWorld as b2World).RayCastOne(
      new b2Vec2(aPoint1.x / this.scale, aPoint1.y / this.scale),
      new b2Vec2(aPoint2.x / this.scale, aPoint2.y / this.scale),
    );
    return fixture != null ? asType(fixture.GetUserData(), AntBox2DBody) : null;
  }

  rayCast(aCallback: AnyFunction, aPoint1: AntPoint, aPoint2: AntPoint): void {
    this._rayCastCallbackFunc = aCallback;
    (this.box2dWorld as b2World).RayCast(
      this.rayCastCallback,
      new b2Vec2(aPoint1.x / this.scale, aPoint1.y / this.scale),
      new b2Vec2(aPoint2.x / this.scale, aPoint2.y / this.scale),
    );
  }

  /** AS3 method closure (passed to b2World.RayCast). */
  private rayCastCallback = (aFixture: b2Fixture, _aPoint: b2Vec2, _aNormal: b2Vec2, aFraction: number): number => {
    const body = aFixture.GetBody();
    if (body.GetUserData() instanceof AntBox2DBody && this._rayCastCallbackFunc != null) {
      this._rayCastCallbackFunc.call(this, asType(body.GetUserData(), AntBox2DBody));
    }

    return aFraction;
  };

  explosionFromBody(aBody: AntBox2DBody, aRadius: number, aForce: number, aDamage = 0, aIncludeStatic = false): void {
    this._hitTestIncludeStatic = aIncludeStatic;
    this._explosionSource = aBody.box2dBody;
    if (this._explosionSource != null) {
      this._explosionPoint = this._explosionSource.GetPosition();
      this._explosionForce = aForce;
      this._explosionDamage = aDamage;
      this._explosionRadius = aRadius;
      aRadius /= this.scale;
      const position = this._explosionSource.GetPosition();
      const aabb = new b2AABB();
      aabb.lowerBound.Set(position.x - aRadius, position.y - aRadius);
      aabb.upperBound.Set(position.x + aRadius, position.y + aRadius);
      (this.box2dWorld as b2World).QueryAABB(this.explosionCallback, aabb);
    }
  }

  /** AS3 method closure (passed to b2World.QueryAABB). */
  protected explosionCallback = (aFixture: b2Fixture): boolean => {
    const body = aFixture.GetBody();
    const shape = aFixture.GetShape();
    const impulse = new b2Vec2();
    const source = this._explosionSource as b2Body;
    if (body.GetType() != b2Body.b2_staticBody || this._hitTestIncludeStatic) {
      const input = new b2DistanceInput();
      input.transformA = source.GetTransform();
      input.transformB = body.GetTransform();
      const proxyA = new b2DistanceProxy();
      proxyA.Set((source.GetFixtureList() as b2Fixture).GetShape());
      input.proxyA = proxyA;
      const proxyB = new b2DistanceProxy();
      proxyB.Set(shape);
      input.proxyB = proxyB;
      input.useRadii = true;
      const output = new b2DistanceOutput();
      const cache = new b2SimplexCache();
      cache.count = 0;
      b2Distance.Distance(output, cache, input);
      output.distance = output.distance <= 1 && output.distance >= 0 ? 1 : output.distance;
      impulse.x =
        body.GetPosition().x < source.GetPosition().x
          ? -this._explosionForce / output.distance
          : this._explosionForce / output.distance;
      impulse.y =
        body.GetPosition().y < source.GetPosition().y
          ? -this._explosionForce / output.distance
          : this._explosionForce / output.distance;
      if (body.GetUserData() instanceof AntBox2DBody) {
        const impulsePoint = new AntPoint(impulse.x, impulse.y);
        const hitPoint = new AntPoint(output.pointB.x * this.scale, output.pointB.y * this.scale);
        const percent = AntMath.toPercent(output.distance * this.scale, this._explosionRadius);
        const damage = this._explosionDamage - AntMath.fromPercent(percent, this._explosionDamage);
        (body.GetUserData() as AntBox2DBody).explode(
          source.GetUserData() as AntBox2DBody,
          impulsePoint,
          hitPoint,
          damage,
        );
      } else {
        body.ApplyImpulse(impulse, output.pointB);
      }
    }

    return true;
  };

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get gravityX(): number {
    return this._gravity.x;
  }
  set gravityX(value: number) {
    this._gravity.x = value;
    if (this.box2dWorld != null) {
      this.box2dWorld.SetGravity(this._gravity);
    }
  }

  get gravityY(): number {
    return this._gravity.y;
  }
  set gravityY(value: number) {
    this._gravity.y = value;
    if (this.box2dWorld != null) {
      this.box2dWorld.SetGravity(this._gravity);
    }
  }

  /** DEVIATION: a plain flag (see the header); the FrameWriter reads it to add DEBUG_LINES to the Frame. */
  get enableDebugDraw(): boolean {
    return this._enableDebugDraw;
  }
  set enableDebugDraw(value: boolean) {
    this._enableDebugDraw = value;
  }

  get tag(): string | null {
    return this._tag;
  }
  set tag(value: string | null) {
    this._tag = value;
  }

  get priority(): number {
    return this._priority;
  }
  set priority(value: number) {
    this._priority = value | 0;
  }

  //---------------------------------------
  // IPlugin
  //---------------------------------------

  update(): void {
    if (this.box2dWorld != null) {
      if (!this.pause) {
        this.box2dWorld.Step(this.step, this.velocityIterations, this.positionIterations);
        this.box2dWorld.ClearForces();
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(_aCamera: AntCamera): void {
    // DEVIATION: the debug picture is built from collectDebugLines() by the FrameWriter.
  }
}
