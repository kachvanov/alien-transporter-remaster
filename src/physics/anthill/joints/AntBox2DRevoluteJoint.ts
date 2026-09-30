// Port of ru/antkarlov/anthill/plugins/box2d/joints/AntBox2DRevoluteJoint.as

import { AntG } from '../../../engine/core/AntG';
import { AntSignal } from '../../../engine/signals/AntSignal';
import { AntMath } from '../../../engine/utils/AntMath';
import { AntPoint } from '../../../engine/utils/AntPoint';
import { asType } from '../../../engine/utils/cast';
import { b2RevoluteJointDef, b2Vec2 } from '../../box2dweb';
import type { b2Body, b2RevoluteJoint, b2World } from '../../box2dweb';
import { AntBox2DBody } from '../AntBox2DBody';
import type { AntBox2DManager } from '../AntBox2DManager';
import { AntBox2DBasicJoint } from './AntBox2DBasicJoint';

export class AntBox2DRevoluteJoint extends AntBox2DBasicJoint {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventJointBreaks: AntSignal<[AntBox2DRevoluteJoint]>;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _jointDef: b2RevoluteJointDef | null = null;
  protected _joint: b2RevoluteJoint | null = null;
  protected _weakness: number = NaN;
  protected _reactionForce: AntPoint;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _limitDraw = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aManager: AntBox2DManager | null = null) {
    super(aManager);
    this.eventJointBreaks = new AntSignal<[AntBox2DRevoluteJoint]>(AntBox2DRevoluteJoint);
    this._jointDef = new b2RevoluteJointDef();
    this._joint = null;
    this._weakness = 0;
    this._reactionForce = new AntPoint();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  copyFrom(aJoint: AntBox2DRevoluteJoint): AntBox2DRevoluteJoint {
    this.enableMotor = aJoint.enableMotor;
    this.motorSpeed = aJoint.motorSpeed;
    this.maxMotorTorque = aJoint.maxMotorTorque;
    this.enableLimit = aJoint.enableLimit;
    this.lowerAngle = aJoint.lowerAngle;
    this.upperAngle = aJoint.upperAngle;
    this.weakness = aJoint.weakness;
    this.x = aJoint.x;
    this.y = aJoint.y;
    this.bodyAliasA = aJoint.bodyAliasA;
    this.bodyAliasB = aJoint.bodyAliasB;
    return this;
  }

  copy(aJoint: AntBox2DRevoluteJoint | null = null): AntBox2DRevoluteJoint {
    if (aJoint == null) {
      aJoint = new AntBox2DRevoluteJoint();
    }

    aJoint.copyFrom(this);
    return aJoint;
  }

  override update(): void {
    if (this._joint != null) {
      this.getAnchorA(this._positionA);
      this.getAnchorB(this._positionB);
      this.x = AntMath.lerp(this._positionA.x, this._positionB.x, 0.5);
      this.y = AntMath.lerp(this._positionA.y, this._positionB.y, 0.5);
      if (this._weakness != 0) {
        this.getReactionForce(this._reactionForce);
        if (this._reactionForce.length() > this._weakness) {
          this.breakJoint();
        }
      }
    }

    super.update();
  }

  override create(aBodyA: AntBox2DBody | null, aBodyB: AntBox2DBody | null): void {
    if (this._manager == null || (this._manager != null && this._manager.box2dWorld == null)) {
      AntG.log("Warning: Can't to create AntBox2DRevoluteJoint. First need to initialize AntBox2DManager!", 'error');
      return;
    }

    const hasA = aBodyA != null;
    const hasB = aBodyB != null;
    if (!hasA && !hasB) {
      AntG.log("Warning: Can't create AntBox2DRevoluteJoint. You must specify at least one existing body.", 'error');
      return;
    }

    this.createOriginal(hasA ? (aBodyA as AntBox2DBody).box2dBody : null, hasB ? (aBodyB as AntBox2DBody).box2dBody : null);
  }

  override createOriginal(aBodyA: b2Body | null, aBodyB: b2Body | null): void {
    if (this._manager == null || (this._manager != null && this._manager.box2dWorld == null)) {
      AntG.log("Warning: Can't to create AntBox2DMouseJoint. First need to initialize AntBox2DManager!", 'error');
      return;
    }

    const world = this._manager.box2dWorld as b2World;
    this._bodyA = aBodyA == null ? world.GetGroundBody() : aBodyA;
    this._bodyB = aBodyB == null ? world.GetGroundBody() : aBodyB;
    const anchor = new b2Vec2(this.x / this._manager.scale, this.y / this._manager.scale);
    (this._jointDef as b2RevoluteJointDef).Initialize(this._bodyA, this._bodyB, anchor);
    this._joint = world.CreateJoint(this._jointDef as b2RevoluteJointDef) as b2RevoluteJoint;
    this.reset(this.x, this.y);
    this.revive();
  }

  override destroy(): void {
    this.kill();
    this._jointDef = null;
    this._joint = null;
    super.destroy();
  }

  override kill(): void {
    if (this._manager != null && this._manager.box2dWorld != null) {
      if (this._joint != null) {
        this._manager.box2dWorld.DestroyJoint(this._joint);
        this._joint = null;
      }
    }

    super.kill();
  }

  breakJoint(): void {
    let body = asType((this._bodyA as b2Body).GetUserData(), AntBox2DBody);
    if (body != null) {
      body.jointBreaks(this);
    }

    body = asType((this._bodyB as b2Body).GetUserData(), AntBox2DBody);
    if (body != null) {
      body.jointBreaks(this);
    }

    this.eventJointBreaks.dispatch(this);
    this.kill();
  }

  getAnchorA(aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (this._joint != null) {
      this._box2dVec = this._joint.GetAnchorA();
      aResult.x = this._box2dVec.x * (this._manager as AntBox2DManager).scale;
      aResult.y = this._box2dVec.y * (this._manager as AntBox2DManager).scale;
    }

    return aResult;
  }

  getAnchorB(aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (this._joint != null) {
      this._box2dVec = this._joint.GetAnchorB();
      aResult.x = this._box2dVec.x * (this._manager as AntBox2DManager).scale;
      aResult.y = this._box2dVec.y * (this._manager as AntBox2DManager).scale;
    }

    return aResult;
  }

  getReactionForce(aResult: AntPoint | null = null, aInvDt = 1): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (this._joint != null) {
      const force = this._joint.GetReactionForce(aInvDt);
      aResult.set(force.x, force.y);
    }

    return aResult;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get jointSpeed(): number {
    return this._joint != null ? this._joint.GetJointSpeed() : 0;
  }

  get jointSpeedDeg(): number {
    return this.jointSpeed / (Math.PI * 180);
  }

  get jointAngle(): number {
    return this._joint != null ? this._joint.GetJointAngle() : 0;
  }

  get jointAngleDeg(): number {
    return this.jointAngle / (Math.PI * 180);
  }

  get enableMotor(): boolean {
    return (this._jointDef as b2RevoluteJointDef).enableMotor;
  }
  set enableMotor(value: boolean) {
    (this._jointDef as b2RevoluteJointDef).enableMotor = value;
    if (this._joint != null) {
      this._joint.EnableMotor(value);
    }
  }

  get motorSpeed(): number {
    return (this._jointDef as b2RevoluteJointDef).motorSpeed;
  }
  set motorSpeed(value: number) {
    (this._jointDef as b2RevoluteJointDef).motorSpeed = value;
    if (this._joint != null) {
      this._joint.SetMotorSpeed(value);
    }
  }

  get maxMotorTorque(): number {
    return (this._jointDef as b2RevoluteJointDef).maxMotorTorque;
  }
  set maxMotorTorque(value: number) {
    (this._jointDef as b2RevoluteJointDef).maxMotorTorque = value;
    if (this._joint != null) {
      this._joint.SetMaxMotorTorque(value);
    }
  }

  get enableLimit(): boolean {
    return (this._jointDef as b2RevoluteJointDef).enableLimit;
  }
  set enableLimit(value: boolean) {
    (this._jointDef as b2RevoluteJointDef).enableLimit = value;
    if (this._joint != null) {
      this._joint.EnableLimit(value);
    }
  }

  get lowerAngle(): number {
    return (this._jointDef as b2RevoluteJointDef).lowerAngle;
  }
  set lowerAngle(value: number) {
    (this._jointDef as b2RevoluteJointDef).lowerAngle = value;
    if (this._joint != null) {
      this._joint.SetLimits(
        (this._jointDef as b2RevoluteJointDef).lowerAngle,
        (this._jointDef as b2RevoluteJointDef).upperAngle,
      );
    }
  }

  get upperAngle(): number {
    return (this._jointDef as b2RevoluteJointDef).upperAngle;
  }
  set upperAngle(value: number) {
    (this._jointDef as b2RevoluteJointDef).upperAngle = value;
    if (this._joint != null) {
      this._joint.SetLimits(
        (this._jointDef as b2RevoluteJointDef).lowerAngle,
        (this._jointDef as b2RevoluteJointDef).upperAngle,
      );
    }
  }

  get weakness(): number {
    return this._weakness;
  }
  set weakness(value: number) {
    this._weakness = value;
  }

  get limitDraw(): boolean {
    return this._limitDraw;
  }
  set limitDraw(value: boolean) {
    this._limitDraw = value;
  }
}
