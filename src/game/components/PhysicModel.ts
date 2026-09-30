// Port of ru/alientransporter/components/PhysicModel.as

import { AntPoint } from '../../engine/utils/AntPoint';
import type { AnyObject } from '../../engine/utils/types';
import type { BasicModel } from '../models/BasicModel';

/**
 * `physic.hasOwnProperty("hitPoint")` of the original is `"hitPoint" in physic`: the members are declared
 * fields of some model classes (Box/Rock: hitPoint, hitForce, hasHit; Barrel/Missile/Shuttle: hasHit) and
 * absent in the others.
 */
export class PhysicModel {
  static readonly className = 'PhysicModel';

  physic: BasicModel;

  constructor(aPhysic: BasicModel) {
    // super();
    this.physic = aPhysic;
  }

  destroy(): void {
    this.physic.destroy();
    this.physic = null as unknown as BasicModel; // AS3: physic = null
  }

  get hitPoint(): AntPoint {
    return 'hitPoint' in this.physic ? ((this.physic as AnyObject)['hitPoint'] as AntPoint) : new AntPoint();
  }

  get hitForce(): AntPoint {
    return 'hitForce' in this.physic ? ((this.physic as AnyObject)['hitForce'] as AntPoint) : new AntPoint();
  }

  get hasHit(): boolean {
    return 'hasHit' in this.physic ? Boolean((this.physic as AnyObject)['hasHit']) : false;
  }
  set hasHit(value: boolean) {
    if ('hasHit' in this.physic) {
      (this.physic as AnyObject)['hasHit'] = value;
    }
  }
}
