// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DBody.as

import { AntActor } from '../../engine/core/AntActor';
import { AntG } from '../../engine/core/AntG';
import { AntSignal } from '../../engine/signals/AntSignal';
import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import { b2Body, b2BodyDef, b2MassData, b2Vec2 } from '../box2dweb';
import type { b2Fixture } from '../box2dweb';
import { AntBox2DContact } from './AntBox2DContact';
import { AntBox2DFlag } from './AntBox2DFlag';
import { AntBox2DManager } from './AntBox2DManager';
import { AntBox2DBasicJoint } from './joints/AntBox2DBasicJoint';
import { AntBox2DBasicShape } from './shapes/AntBox2DBasicShape';

export class AntBox2DBody extends AntActor {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly STATIC = 'static';
  static readonly KINEMATIC = 'kinematic';
  static readonly DYNAMIC = 'dynamic';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  box2dBody: b2Body | null = null;
  manager: AntBox2DManager | null = null;
  eventPreSolveContact: AntSignal<[AntBox2DBody, AntBox2DContact]>;
  eventBeginContact: AntSignal<[AntBox2DBody, AntBox2DContact]>;
  eventEndContact: AntSignal<[AntBox2DBody, AntBox2DContact]>;
  eventPostSolveContact: AntSignal<[AntBox2DBody, AntBox2DContact]>;
  eventJointBreaks: AntSignal<[AntBox2DBody, AntBox2DBasicJoint]>;
  eventExplode: AntSignal<[AntBox2DBody, AntBox2DBody, AntPoint, AntPoint, number]>;
  allowPreSolveContacts = false;
  allowPostSolveContacts = false;
  allowBeginContacts = false;
  allowEndContacts = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _kind: string | null = null;
  protected _box2dBodyDef: b2BodyDef;
  protected _box2dVelocity: b2Vec2;
  protected _box2dPosition: b2Vec2;
  protected _collisionFlag: AntBox2DFlag | null = null;
  protected _collidesWithFlags: AntBox2DFlag | null = null;
  protected _groupIndex = 0; // int
  protected _shapes: (AntBox2DBasicShape | null)[] | null = null; // Vector.<AntBox2DBasicShape>
  protected _canMove = false;
  protected _canRotate = false;
  protected _canSleep = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this._kind = AntBox2DBody.STATIC;
    this._box2dBodyDef = new b2BodyDef();
    this._box2dBodyDef.userData = this;
    this._box2dVelocity = new b2Vec2();
    this._box2dPosition = new b2Vec2();
    this._collisionFlag = null;
    this._collidesWithFlags = null;
    this._groupIndex = 0;
    this._shapes = [];
    this._canMove = true;
    this._canRotate = true;
    this._canSleep = true;
    this.eventPreSolveContact = new AntSignal<[AntBox2DBody, AntBox2DContact]>(AntBox2DBody, AntBox2DContact);
    this.eventBeginContact = new AntSignal<[AntBox2DBody, AntBox2DContact]>(AntBox2DBody, AntBox2DContact);
    this.eventEndContact = new AntSignal<[AntBox2DBody, AntBox2DContact]>(AntBox2DBody, AntBox2DContact);
    this.eventPostSolveContact = new AntSignal<[AntBox2DBody, AntBox2DContact]>(AntBox2DBody, AntBox2DContact);
    this.eventJointBreaks = new AntSignal<[AntBox2DBody, AntBox2DBasicJoint]>(AntBox2DBody, AntBox2DBasicJoint);
    this.eventExplode = new AntSignal<[AntBox2DBody, AntBox2DBody, AntPoint, AntPoint, number]>(
      AntBox2DBody,
      AntBox2DBody,
      AntPoint,
      AntPoint,
      Number,
    );
    this.allowPreSolveContacts = false;
    this.allowPostSolveContacts = false;
    this.allowBeginContacts = true;
    this.allowEndContacts = true;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  create(aManager: AntBox2DManager | null = null): void {
    if (aManager == null) {
      const managers = AntG.plugins.get(AntBox2DManager);
      if (managers != null && managers.length >= 1) {
        aManager = managers[0] as AntBox2DManager;
      }

      if (aManager == null) {
        AntG.log("Warning: Can't create AntBox2DBody because AntBox2DManager not exists!", 'error');
        return;
      }
    }

    this.manager = aManager;
    this._box2dBodyDef.angle = this.angle * (Math.PI / 180);
    this._box2dBodyDef.position.Set(this.x / this.manager.scale, this.y / this.manager.scale);
    this.updateKind();
    this.box2dBody = this.manager.addBody(this._box2dBodyDef);
    this.buildShapes();
    this.revive();
  }

  clearAllListeners(): void {
    this.eventPreSolveContact.clear();
    this.eventBeginContact.clear();
    this.eventEndContact.clear();
    this.eventPostSolveContact.clear();
    this.eventJointBreaks.clear();
    this.eventExplode.clear();
  }

  override kill(): void {
    if (this.box2dBody != null) {
      (this.manager as AntBox2DManager).removeBody(this.box2dBody);
    }

    this.velocity.x = 0;
    this.velocity.y = 0;
    this.angularVelocity = 0;
    super.kill();
  }

  override update(): void {
    this.updateBody();
    super.update();
  }

  preSolveContact(aContact: AntBox2DContact): void {
    this.eventPreSolveContact.dispatch(this, aContact);
  }

  beginContact(aContact: AntBox2DContact): void {
    this.eventBeginContact.dispatch(this, aContact);
  }

  endContact(aContact: AntBox2DContact): void {
    this.eventEndContact.dispatch(this, aContact);
  }

  postSolveContact(aContact: AntBox2DContact): void {
    this.eventPostSolveContact.dispatch(this, aContact);
  }

  jointBreaks(aJoint: AntBox2DBasicJoint): void {
    this.eventJointBreaks.dispatch(this, aJoint);
  }

  explode(aSource: AntBox2DBody, aImpulse: AntPoint, aPoint: AntPoint, aDamage = 0): void {
    this.applyImpulse(aImpulse.x, aImpulse.y, aPoint.x, aPoint.y);
    this.eventExplode.dispatch(this, aSource, aImpulse, aPoint, aDamage);
  }

  buildShapes(): void {
    if (this.box2dBody != null) {
      let fixture: b2Fixture | null = this.box2dBody.GetFixtureList();
      while (fixture) {
        const next: b2Fixture | null = fixture.GetNext();
        this.box2dBody.DestroyFixture(fixture);
        fixture = next;
      }

      if (this._shapes != null) {
        const n = this._shapes.length | 0; // :int
        let i = 0;
        while (i < n) {
          const shape = this._shapes[i++];
          if (shape != null) {
            this.box2dBody.CreateFixture(shape.getFixtureDef(this));
          }
        }
      }

      this.updateMass();
    }
  }

  protected updateMass(): void {
    if (this.box2dBody != null) {
      if (this._canMove) {
        this.box2dBody.ResetMassData();
      }

      if (!this._canMove || !this._canRotate) {
        const massData = new b2MassData();
        massData.center = this.box2dBody.GetLocalCenter();
        massData.mass = this._canMove ? this.box2dBody.GetMass() : 0;
        massData.I = this._canRotate ? this.box2dBody.GetInertia() : 0;
        this.box2dBody.SetMassData(massData);
      }
    }
  }

  applyCollisionFlag(aName: string): void {
    this._collisionFlag = new AntBox2DFlag(aName);
    this.buildShapes();
  }

  applyCollidesFlags(...rest: unknown[]): void {
    const names = rest.length == 1 && Array.isArray(rest[0]) ? rest[0] : rest;
    this._collidesWithFlags = new AntBox2DFlag(names);
    this.buildShapes();
  }

  applyShapes(...rest: unknown[]): void {
    const list = rest.length == 1 && Array.isArray(rest[0]) ? rest[0] : rest;
    let n: number; // :int
    let i = 0; // :int
    if (this._shapes == null) {
      this._shapes = [];
    } else {
      n = this._shapes.length | 0;
      while (i < n) {
        const oldShape = this._shapes[i];
        if (oldShape != null) {
          oldShape.destroy();
        }

        this._shapes[i] = null;
        i++;
      }
    }

    this._shapes.length = 0;
    n = list.length | 0;
    i = 0;
    while (i < n) {
      const shape = list[i++];
      if (shape instanceof AntBox2DBasicShape) {
        this._shapes.push(shape);
      }
    }

    this.buildShapes();
  }

  applyAwake(aAwake: boolean): void {
    if (this.box2dBody != null) {
      this.box2dBody.SetAwake(aAwake);
    }
  }

  applyImpulse(aX: number, aY: number, aPointX = 0, aPointY = 0): void {
    if (this.box2dBody != null) {
      const impulse = new b2Vec2(aX, aY);
      let point: b2Vec2;
      if (aPointX == 0 && aPointY == 0) {
        point = this.box2dBody.GetWorldCenter();
      } else {
        const scale = (this.manager as AntBox2DManager).scale;
        point = new b2Vec2(aPointX / scale, aPointY / scale);
      }

      this.box2dBody.ApplyImpulse(impulse, point);
    }
  }

  applyForce(aX: number, aY: number, aPointX = 0, aPointY = 0): void {
    if (this.box2dBody != null) {
      const force = new b2Vec2(aX, aY);
      let point: b2Vec2;
      if (aPointX == 0 && aPointY == 0) {
        point = this.box2dBody.GetWorldCenter();
      } else {
        const scale = (this.manager as AntBox2DManager).scale;
        point = new b2Vec2(aPointX / scale, aPointY / scale);
      }

      this.box2dBody.ApplyForce(force, point);
    }
  }

  applyTorque(aTorque: number): void {
    if (this.box2dBody != null) {
      this.box2dBody.ApplyTorque(aTorque);
    }
  }

  applyAngularVelocity(aVelocity: number): void {
    if (this.box2dBody != null) {
      this.box2dBody.SetAngularVelocity(aVelocity);
    }
  }

  applyVelocity(aX: number, aY: number): void {
    this.velocity.x = aX;
    this.velocity.y = aY;
    if (this.box2dBody != null) {
      this._box2dVelocity.Set(aX, aY);
      this.box2dBody.SetLinearVelocity(this._box2dVelocity);
    }
  }

  applyVelocityX(aX: number): void {
    if (this.box2dBody != null) {
      this._box2dVelocity = this.box2dBody.GetLinearVelocity();
      this._box2dVelocity.x = this.velocity.x = aX;
      this.box2dBody.SetLinearVelocity(this._box2dVelocity);
    }
  }

  applyVelocityY(aY: number): void {
    if (this.box2dBody != null) {
      this._box2dVelocity = this.box2dBody.GetLinearVelocity();
      this._box2dVelocity.y = this.velocity.y = aY;
      this.box2dBody.SetLinearVelocity(this._box2dVelocity);
    }
  }

  applyPosition(aX: number, aY: number): void {
    this.x = aX;
    this.y = aY;
    if (this.box2dBody != null) {
      const scale = (this.manager as AntBox2DManager).scale;
      this._box2dPosition.x = aX / scale;
      this._box2dPosition.y = aY / scale;
      this.box2dBody.SetPosition(this._box2dPosition);
    }
  }

  applyAngle(aAngle: number): void {
    this.angle = aAngle;
    if (this.box2dBody != null) {
      this.box2dBody.SetAngle(AntMath.toRadians(aAngle));
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected updateBody(): void {
    if (this.box2dBody != null) {
      const scale = (this.manager as AntBox2DManager).scale;
      this._box2dPosition = this.box2dBody.GetPosition();
      this.x = this._box2dPosition.x * scale;
      this.y = this._box2dPosition.y * scale;
      this._box2dVelocity = this.box2dBody.GetLinearVelocity();
      this.velocity.x = this._box2dVelocity.x;
      this.velocity.y = this._box2dVelocity.y;
      this.angularVelocity = this.box2dBody.GetAngularVelocity();
      if (this._canRotate) {
        this.angle = ((this.box2dBody.GetAngle() / Math.PI) * 180) % 360;
      }
    }
  }

  protected updateKind(): void {
    switch (this._kind) {
      case AntBox2DBody.DYNAMIC:
        this._box2dBodyDef.type = b2Body.b2_dynamicBody;
        break;
      case AntBox2DBody.KINEMATIC:
        this._box2dBodyDef.type = b2Body.b2_kinematicBody;
        break;
      default:
        this._box2dBodyDef.type = b2Body.b2_staticBody;
    }

    if (this.box2dBody != null) {
      this.box2dBody.SetType(this._box2dBodyDef.type);
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get canMove(): boolean {
    return this._canMove;
  }
  set canMove(value: boolean) {
    if (this._canMove != value) {
      this._canMove = value;
      this.updateMass();
    }
  }

  get canRotate(): boolean {
    return this._canRotate;
  }
  set canRotate(value: boolean) {
    if (this._canRotate != value) {
      this._canRotate = value;
      this.updateMass();
    }
  }

  get canSleep(): boolean {
    return this._canSleep;
  }
  set canSleep(value: boolean) {
    if (this._canSleep != value) {
      this._canSleep = value;
      this._box2dBodyDef.allowSleep = value;
      if (this.box2dBody != null) {
        this.box2dBody.SetSleepingAllowed(value);
      }
    }
  }

  get isBullet(): boolean {
    return this._box2dBodyDef.bullet;
  }
  set isBullet(value: boolean) {
    if (this._box2dBodyDef.bullet != value) {
      this._box2dBodyDef.bullet = value;
      if (this.box2dBody != null) {
        this.box2dBody.SetBullet(value);
      }
    }
  }

  get shapes(): (AntBox2DBasicShape | null)[] | null {
    return this._shapes;
  }
  set shapes(value: (AntBox2DBasicShape | null)[] | null) {
    this._shapes = value;
    this.buildShapes();
  }

  get collisionFlag(): AntBox2DFlag | null {
    return this._collisionFlag;
  }
  set collisionFlag(value: AntBox2DFlag | null) {
    this._collisionFlag = value;
    this.buildShapes();
  }

  get collidesWithFlags(): AntBox2DFlag | null {
    return this._collidesWithFlags;
  }
  set collidesWithFlags(value: AntBox2DFlag | null) {
    this._collidesWithFlags = value;
    this.buildShapes();
  }

  get groupIndex(): number {
    return this._groupIndex;
  }
  set groupIndex(value: number) {
    value = value | 0; // :int
    if (this._groupIndex != value) {
      this._groupIndex = value;
      this.buildShapes();
    }
  }

  get kind(): string | null {
    return this._kind;
  }
  set kind(value: string | null) {
    if (this._kind != value) {
      this._kind = value;
      this.updateKind();
    }
  }

  get objectMask(): AntBox2DFlag | null {
    return this._collidesWithFlags;
  }
}
