// STUB(T1.9b): stand-in for ru/alientransporter/models/BasicModel.as.
// T1.9b ports the real class (bodies, joints, shapes, ragdolls) and replaces this file. Declared: the
// fields and the constructor/destroy the components of T1.9a use.

import type { AntEntity } from '../../engine/core/AntEntity';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';

export class BasicModel {
  debugModel = false;
  body: AntBox2DBody | null = null;
  modelName: string | null = null;
  layer: AntEntity | null = null;
  x = 0; // int
  y = 0; // int
  scale = 1; // int
  animationName: string | null = null;

  constructor(aX: number, aY: number, aModelName: string, aLayer: AntEntity, aScale = 1) {
    this.x = aX | 0;
    this.y = aY | 0;
    this.modelName = aModelName;
    this.layer = aLayer;
    this.scale = aScale | 0;
  }

  destroy(): void {}
}
