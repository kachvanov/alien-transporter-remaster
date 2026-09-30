// Port of ru/antkarlov/anthill/plugins/box2d/joints/AntBox2DPrismaticJoint.as

import { AntG } from '../../../engine/core/AntG';
import { AntSignal } from '../../../engine/signals/AntSignal';
import { AntMath } from '../../../engine/utils/AntMath';
import { AntPoint } from '../../../engine/utils/AntPoint';
import { asType } from '../../../engine/utils/cast';
import { b2PrismaticJointDef, b2Vec2 } from '../../box2dweb';
import type { b2Body, b2PrismaticJoint, b2World } from '../../box2dweb';
import { AntBox2DBody } from '../AntBox2DBody';
import type { AntBox2DManager } from '../AntBox2DManager';
import { AntBox2DBasicJoint } from './AntBox2DBasicJoint';

export class AntBox2DPrismaticJoint extends AntBox2DBasicJoint {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventJointBreaks: AntSignal<[AntBox2DPrismaticJoint]>;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _jointDef: b2PrismaticJointDef | null = null;
  protected _joint: b2PrismaticJoint | null = null;
  protected _weakness: number = NaN;
  protected _axisX: number = NaN;
  protected _axisY: number = NaN;
  protected _reactionForce: AntPoint;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aManager: AntBox2DManager | null = null) {
    super(aManager);
    this.eventJointBreaks = new AntSignal<[AntBox2DPrismaticJoint]>(AntBox2DPrismaticJoint);
    this._jointDef = new b2PrismaticJointDef();
    this._joint = null;
    this._weakness = 0;
    this._axisX = 0;
    this._axisY = 0;
    this._reactionForce = new AntPoint();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  copyFrom(aJoint: AntBox2DPrismaticJoint): AntBox2DPrismaticJoint {
    this.enableMotor = aJoint.enableMotor;
    this.motorSpeed = aJoint.motorSpeed;
    this.maxMotorForce = aJoint.maxMotorForce;
    this.enableLimit = aJoint.enableLimit;
    this.lowerTranslation = aJoint.lowerTranslation;
    this.upperTranslation = aJoint.upperTranslation;
    this.weakness = aJoint.weakness;
    this.axisX = aJoint.axisX;
    this.axisY = aJoint.axisY;
    this.x = aJoint.x;
    this.y = aJoint.y;
    this.bodyAliasA = aJoint.bodyAliasA;
    this.bodyAliasB = aJoint.bodyAliasB;
    return this;
  }

  copy(aJoint: AntBox2DPrismaticJoint | null = null): AntBox2DPrismaticJoint {
    if (aJoint == null) {
      aJoint = new AntBox2DPrismaticJoint();
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
      AntG.log("Warning: Can't to create AntBox2DPrismaticJoint. First need to initialize AntBox2DManager!", 'error');
      return;
    }

    const hasA = aBodyA != null;
    const hasB = aBodyB != null;
    if (!hasA && !hasB) {
      AntG.log("Warning: Can't create AntBox2DPrismaticJoint. You must specify at least one existing body.", 'error');
      return;
    }

    this.createOriginal(hasA ? (aBodyA as AntBox2DBody).box2dBody : null, hasB ? (aBodyB as AntBox2DBody).box2dBody : null);
  }

  override createOriginal(aBodyA: b2Body | null, aBodyB: b2Body | null): void {
    if (this._manager == null || (this._manager != null && this._manager.box2dWorld == null)) {
      AntG.log("Warning: Can't to create AntBox2DPrismaticJoint. First need to initialize AntBox2DManager!", 'error');
      return;
    }

    const world = this._manager.box2dWorld as b2World;
    this._bodyA = aBodyA == null ? world.GetGroundBody() : aBodyA;
    this._bodyB = aBodyB == null ? world.GetGroundBody() : aBodyB;
    const anchor = new b2Vec2(this.x / this._manager.scale, this.y / this._manager.scale);
    const axis = new b2Vec2(this.axisX / this._manager.scale, this.axisY / this._manager.scale);
    (this._jointDef as b2PrismaticJointDef).Initialize(this._bodyA, this._bodyB, anchor, axis);
    this._joint = world.CreateJoint(this._jointDef as b2PrismaticJointDef) as b2PrismaticJoint;
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

  get enableMotor(): boolean {
    return (this._jointDef as b2PrismaticJointDef).enableMotor;
  }
  set enableMotor(value: boolean) {
    (this._jointDef as b2PrismaticJointDef).enableMotor = value;
    if (this._joint != null) {
      this._joint.EnableMotor(value);
    }
  }

  get motorSpeed(): number {
    return (this._jointDef as b2PrismaticJointDef).motorSpeed;
  }
  set motorSpeed(value: number) {
    (this._jointDef as b2PrismaticJointDef).motorSpeed = value;
    if (this._joint != null) {
      this._joint.SetMotorSpeed(value);
    }
  }

  get maxMotorForce(): number {
    return (this._jointDef as b2PrismaticJointDef).maxMotorForce;
  }
  set maxMotorForce(value: number) {
    (this._jointDef as b2PrismaticJointDef).maxMotorForce = value;
    if (this._joint != null) {
      this._joint.SetMaxMotorForce(value);
    }
  }

  get enableLimit(): boolean {
    return (this._jointDef as b2PrismaticJointDef).enableLimit;
  }
  set enableLimit(value: boolean) {
    (this._jointDef as b2PrismaticJointDef).enableLimit = value;
    if (this._joint != null) {
      this._joint.EnableLimit(value);
    }
  }

  get lowerTranslation(): number {
    return (this._jointDef as b2PrismaticJointDef).lowerTranslation;
  }
  set lowerTranslation(value: number) {
    (this._jointDef as b2PrismaticJointDef).lowerTranslation = value;
    if (this._joint != null) {
      this._joint.SetLimits(
        (this._jointDef as b2PrismaticJointDef).lowerTranslation,
        (this._jointDef as b2PrismaticJointDef).upperTranslation,
      );
    }
  }

  get upperTranslation(): number {
    return (this._jointDef as b2PrismaticJointDef).upperTranslation;
  }
  set upperTranslation(value: number) {
    (this._jointDef as b2PrismaticJointDef).upperTranslation = value;
    if (this._joint != null) {
      this._joint.SetLimits(
        (this._jointDef as b2PrismaticJointDef).lowerTranslation,
        (this._jointDef as b2PrismaticJointDef).upperTranslation,
      );
    }
  }

  get weakness(): number {
    return this._weakness;
  }
  set weakness(value: number) {
    this._weakness = value;
  }

  get axisX(): number {
    return this._axisX;
  }
  set axisX(value: number) {
    this._axisX = value;
  }

  get axisY(): number {
    return this._axisY;
  }
  set axisY(value: number) {
    this._axisY = value;
  }
}
