// Port of ru/alientransporter/map/Ground.as
//
// DEVIATION (docs/04-porting-guide.md section 4): `param1: Sprite` is a ClipProxy (a child of the level JSON).

import type { ClipProxy } from '../../engine/assets/ClipProxy';
import { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import { AntBox2DBoxShape } from '../../physics/anthill/shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../../physics/anthill/shapes/AntBox2DCircleShape';
import { CollisionRule } from '../models/CollisionRule';
import { GroundTag } from '../tags/GroundTag';

export class Ground {
  static readonly className = 'Ground';

  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  static stopperList: (AntBox2DBody | null)[] | null = null;
  static body: AntBox2DBody | null = null;

  constructor() {
    // super();
  }

  //---------------------------------------
  // STATIC METHODS
  //---------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeStopper(aClip: ClipProxy, _aClassName: string): AntBox2DBody {
    const angle = aClip.rotation;
    aClip.rotation = 0;
    if (Ground.stopperList == null) {
      Ground.stopperList = [];
    }

    const shape = new AntBox2DBoxShape();
    shape.width = aClip.width;
    shape.height = aClip.height;
    shape.angleDeg = angle;
    shape.restitution = 0;
    shape.friction = 1;
    const body = new AntBox2DBody();
    body.x = aClip.x;
    body.y = aClip.y;
    (body.shapes as AntBox2DBoxShape[]).push(shape);
    Ground.stopperList.push(body);
    return body;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeBoxBody(aClip: ClipProxy, _aClassName: string): AntBox2DBody {
    const angle = aClip.rotation;
    aClip.rotation = 0;
    if (Ground.body == null) {
      Ground.body = new AntBox2DBody();
    }

    const shape = new AntBox2DBoxShape();
    shape.width = aClip.width;
    shape.height = aClip.height;
    shape.angleDeg = angle;
    shape.x = aClip.x;
    shape.y = aClip.y;
    shape.restitution = 0;
    shape.friction = 1;
    (Ground.body.shapes as AntBox2DBoxShape[]).push(shape);
    return Ground.body;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeCircleBody(aClip: ClipProxy, _aClassName: string): AntBox2DBody {
    const angle = aClip.rotation;
    aClip.rotation = 0;
    if (Ground.body == null) {
      Ground.body = new AntBox2DBody();
    }

    const shape = new AntBox2DCircleShape();
    shape.radius = aClip.width * 0.5;
    shape.angleDeg = angle;
    shape.x = aClip.x;
    shape.y = aClip.y;
    shape.restitution = 0;
    shape.friction = 1;
    (Ground.body.shapes as AntBox2DCircleShape[]).push(shape);
    return Ground.body;
  }

  static create(): void {
    const body = Ground.body as AntBox2DBody;
    body.create();
    body.applyCollisionFlag(CollisionRule.GROUND);
    body.applyCollidesFlags(CollisionRule.getRule(CollisionRule.GROUND));
    body.userData = new GroundTag();
    if (Ground.stopperList != null) {
      let i = 0; // :int
      const n = Ground.stopperList.length | 0; // :int
      while (i < n) {
        const stopper = Ground.stopperList[i++] as AntBox2DBody;
        stopper.create();
        stopper.applyCollisionFlag(CollisionRule.GROUND);
        stopper.applyCollidesFlags(CollisionRule.getRule(CollisionRule.GROUND));
        stopper.userData = new GroundTag();
      }
    }
  }

  static destroy(): void {
    (Ground.body as AntBox2DBody).destroy();
    Ground.body = null;
    if (Ground.stopperList != null) {
      let i = 0; // :int
      const n = Ground.stopperList.length | 0; // :int
      while (i < n) {
        (Ground.stopperList[i] as AntBox2DBody).destroy();
        Ground.stopperList[i++] = null;
      }

      Ground.stopperList.length = 0;
    }
  }
}
