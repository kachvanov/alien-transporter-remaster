// Port of ru/alientransporter/models/BasicModel.as
//
// DEVIATION: the debug branch `if(this.debugModel) JointEditor.getInstance().registerJoint(...)` is dropped
// (tools/JointEditor is not ported, docs/04-porting-guide.md section 6); `debugModel` stays false in the game.

import type { AntEntity } from '../../engine/core/AntEntity';
import type { AnyObject } from '../../engine/utils/types';
import { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntBox2DContact } from '../../physics/anthill/AntBox2DContact';
import { AntBox2DBasicJoint } from '../../physics/anthill/joints/AntBox2DBasicJoint';
import { AntBox2DPrismaticJoint } from '../../physics/anthill/joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../../physics/anthill/joints/AntBox2DRevoluteJoint';
import type { AntModelData } from '../../physics/anthill/models/AntModelData';
import type { AntBox2DBasicShape } from '../../physics/anthill/shapes/AntBox2DBasicShape';
import { G } from '../G';
import { CollisionRule } from './CollisionRule';

/** The contact callback of a body (`AntBox2DBody.eventPostSolveContact`). */
export type ContactCallback = (aBody: AntBox2DBody, aContact: AntBox2DContact) => void;

export class BasicModel {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  debugModel: boolean;
  body: AntBox2DBody | null = null;
  modelName: string | null;
  model: AntModelData | null;
  layer: AntEntity | null;
  x: number; // int
  y: number; // int
  scale: number; // int
  animationName: string | null = null;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  /** `Object` used as a dictionary: the for-in order of the original is the insertion order here. */
  protected _bodies: Record<string, AntBox2DBody | null> | null;
  protected _joints: Record<string, AntBox2DBasicJoint | null> | null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aModelName: string, aLayer: AntEntity, aScale = 1) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
    this.scale = aScale | 0;
    this.modelName = aModelName;
    this.model = G.models.manager.getModel(this.modelName);
    this.debugModel = false;
    this.layer = aLayer;
    this._bodies = {};
    this._joints = {};
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  create(): void {}

  setTag(aTag: unknown): void {
    for (const name in this._bodies) {
      (this._bodies[name] as AntBox2DBody).userData = aTag;
    }
  }

  createBodyFromShape(
    aShape: AntBox2DBasicShape,
    aName: string,
    aAnimation: string | null = null,
    aCollisionRule: string | null = null,
    aCallback: ContactCallback | null = null,
  ): AntBox2DBody {
    const shapeX = (aShape.x * this.scale) | 0; // :int
    const shapeY = aShape.y | 0; // :int
    const shapeAngle = aShape.angleDeg;
    aShape.x = 0;
    aShape.y = 0;
    aShape.angle = 0;
    const body = (this.layer as AntEntity).recycle(AntBox2DBody) as AntBox2DBody;
    body.allowPostSolveContacts = false;
    body.clearAllListeners();
    if (aCallback != null) {
      body.allowPostSolveContacts = true;
      body.eventPostSolveContact.add(aCallback);
    }

    if (aCollisionRule != null) {
      body.applyCollisionFlag(aCollisionRule);
      body.applyCollidesFlags(CollisionRule.getRule(aCollisionRule));
    }

    body.scaleX = this.scale;
    body.clearAnimations();
    if (aAnimation != null) {
      body.addAnimationFromCache(aAnimation);
    } else if (aShape.animation != null && aShape.animation != '') {
      body.addAnimationFromCache(aShape.animation);
    }

    body.applyShapes(aShape);
    body.alpha = 1;
    body.x = shapeX + this.x;
    body.y = shapeY + this.y;
    body.angle = shapeAngle;
    body.kind = this.debugModel && aName == 'Body' ? 'static' : 'dynamic';
    body.create();
    body.z = aShape.sortIndex | 0; // :int
    body.smoothing = G.gameData.fancyQuality;
    this.addBody(aName, body);
    return body;
  }

  createBody(
    aName: string,
    aAnimation: string | null = null,
    aCollisionRule: string | null = null,
    aCallback: ContactCallback | null = null,
  ): AntBox2DBody | null {
    const shape = (this.model as AntModelData).getShapeByName(aName);
    if (shape != null) {
      return this.createBodyFromShape(shape, aName, aAnimation, aCollisionRule, aCallback);
    }

    return null;
  }

  getShapeAnimation(aName: string): string | null {
    const shape = (this.model as AntModelData).getShapeByName(aName);
    return shape != null ? shape.animation : null;
  }

  createJoints(): void {
    const model = this.model as AntModelData;
    let i = 0; // :int
    const n = model.numJoints | 0; // :int
    while (i < n) {
      const joint = model.getJoint(i) as AntBox2DBasicJoint;
      if (joint instanceof AntBox2DRevoluteJoint) {
        this.createRevoluteJointA(joint, this.getBody(joint.bodyAliasA as string), this.getBody(joint.bodyAliasB as string));
      } else if (joint instanceof AntBox2DPrismaticJoint) {
        this.createPrismaticJointA(joint, this.getBody(joint.bodyAliasA as string), this.getBody(joint.bodyAliasB as string));
      }

      i++;
    }
  }

  addShapeToBody(aShapeName: string, aBodyName: string): void {
    const body = this.getBody(aBodyName);
    if (body != null) {
      const shape = (this.model as AntModelData).getShapeByName(aShapeName);
      if (shape != null) {
        (body.shapes as AntBox2DBasicShape[]).push(shape);
        body.buildShapes();
      }
    }
  }

  addBody(aName: string, aBody: AntBox2DBody): void {
    (this._bodies as AnyObject)[aName] = aBody;
  }

  getBody(aName: string): AntBox2DBody | null {
    const bodies = this._bodies as AnyObject;
    return Object.hasOwn(bodies, aName) ? (bodies[aName] as AntBox2DBody) : null;
  }

  removeBody(aName: string): void {
    const bodies = this._bodies as AnyObject;
    if (Object.hasOwn(bodies, aName)) {
      bodies[aName] = null;
      delete bodies[aName];
    }
  }

  clearBodies(): void {
    const bodies = this._bodies as Record<string, AntBox2DBody | null>;
    for (const name of Object.keys(bodies)) {
      const body = bodies[name] as AntBox2DBody;
      body.clearAnimations();
      body.kill();
      bodies[name] = null;
      delete bodies[name];
    }
  }

  clearJoints(): void {
    const joints = this._joints as Record<string, AntBox2DBasicJoint | null>;
    for (const name of Object.keys(joints)) {
      const joint = joints[name] as AntBox2DBasicJoint;
      joint.clearAnimations();
      joint.kill();
      (this.layer as AntEntity).remove(joint);
      joints[name] = null;
      delete joints[name];
    }
  }

  destroy(): void {
    this.clearBodies();
    this.clearJoints();
    this.body = null;
    this.model = null;
    this.layer = null;
    this._bodies = null;
    this._joints = null;
  }

  createRevoluteJointA(
    aJoint: AntBox2DRevoluteJoint,
    aBodyA: AntBox2DBody | null,
    aBodyB: AntBox2DBody | null,
  ): AntBox2DRevoluteJoint {
    aJoint.clearAnimations();
    aJoint.x = this.x + aJoint.x * this.scale;
    aJoint.y = this.y + aJoint.y;
    aJoint.create(aBodyA, aBodyB);
    G.gameState.layerMain.add(aJoint);
    return aJoint;
  }

  createRevoluteJoint(aName: string, aBodyA: AntBox2DBody | null, aBodyB: AntBox2DBody | null): AntBox2DRevoluteJoint {
    const joint = (this.model as AntModelData).getJointByName(aName) as AntBox2DRevoluteJoint;
    return this.createRevoluteJointA(joint, aBodyA, aBodyB);
  }

  createPrismaticJointA(
    aJoint: AntBox2DPrismaticJoint,
    aBodyA: AntBox2DBody | null,
    aBodyB: AntBox2DBody | null,
  ): AntBox2DPrismaticJoint {
    aJoint.clearAnimations();
    aJoint.x = this.x + aJoint.x * this.scale;
    aJoint.y = this.y + aJoint.y;
    aJoint.create(aBodyA, aBodyB);
    G.gameState.layerMain.add(aJoint);
    return aJoint;
  }

  createPrismaticJoint(aName: string, aBodyA: AntBox2DBody | null, aBodyB: AntBox2DBody | null): AntBox2DPrismaticJoint {
    const joint = (this.model as AntModelData).getJointByName(aName) as AntBox2DPrismaticJoint;
    return this.createPrismaticJointA(joint, aBodyA, aBodyB);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createRagdoll(_aX: number, _aY: number, _aAngle: number): void {}
}
