// Port of ru/antkarlov/anthill/plugins/box2d/joints/AntBox2DMouseJoint.as

import { AntG } from '../../../engine/core/AntG';
import { AntPoint } from '../../../engine/utils/AntPoint';
import { b2MouseJointDef } from '../../box2dweb';
import type { b2Body, b2MouseJoint, b2World } from '../../box2dweb';
import type { AntBox2DBody } from '../AntBox2DBody';
import type { AntBox2DManager } from '../AntBox2DManager';
import { AntBox2DBasicJoint } from './AntBox2DBasicJoint';

export class AntBox2DMouseJoint extends AntBox2DBasicJoint {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _jointDef: b2MouseJointDef | null = null;
  protected _joint: b2MouseJoint | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aManager: AntBox2DManager | null = null) {
    super(aManager);
    this._jointDef = new b2MouseJointDef();
    this._jointDef.maxForce = 1000;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override update(): void {
    if (this._joint != null && this._manager != null) {
      this._box2dVec.x = this.x / this._manager.scale;
      this._box2dVec.y = this.y / this._manager.scale;
      this._joint.SetTarget(this._box2dVec);
    }

    super.update();
  }

  override create(aBodyA: AntBox2DBody | null, aBodyB: AntBox2DBody | null): void {
    if (this._manager == null || (this._manager != null && this._manager.box2dWorld == null)) {
      AntG.log("Warning: Can't to create AntBox2DMouseJoint. First need to initialize AntBox2DManager!", 'error');
      return;
    }

    const hasA = aBodyA != null;
    const hasB = aBodyB != null;
    if (!hasA && !hasB) {
      AntG.log("Warning: Can't create AntBox2DMouseJoint. You must specify at least one existing body.", 'error');
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
    const def = this._jointDef as b2MouseJointDef;
    def.bodyA = aBodyA == null ? world.GetGroundBody() : aBodyA;
    def.bodyB = aBodyB == null ? world.GetGroundBody() : aBodyB;
    def.target.Set(this.x / this._manager.scale, this.y / this._manager.scale);
    this._joint = world.CreateJoint(def) as b2MouseJoint;
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

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get maxForce(): number {
    return (this._jointDef as b2MouseJointDef).maxForce;
  }
  set maxForce(value: number) {
    (this._jointDef as b2MouseJointDef).maxForce = value;
    if (this._joint != null) {
      this._joint.SetMaxForce(value);
    }
  }

  get frequencyHz(): number {
    return (this._jointDef as b2MouseJointDef).frequencyHz;
  }
  set frequencyHz(value: number) {
    (this._jointDef as b2MouseJointDef).frequencyHz = value;
    if (this._joint != null) {
      this._joint.SetFrequency(value);
    }
  }

  get dampingRatio(): number {
    return (this._jointDef as b2MouseJointDef).dampingRatio;
  }
  set dampingRatio(value: number) {
    (this._jointDef as b2MouseJointDef).dampingRatio = value;
    if (this._joint != null) {
      this._joint.SetDampingRatio(value);
    }
  }
}
