// Port of ru/alientransporter/components/Ragdoll.as

import type { IRagdollModel } from '../models/IRagdollModel';

export class Ragdoll {
  static readonly className = 'Ragdoll';

  model: IRagdollModel;
  lifeTime: number;

  constructor(aModel: IRagdollModel, aLifeTime: number) {
    // super();
    this.model = aModel;
    this.lifeTime = aLifeTime;
  }
}
