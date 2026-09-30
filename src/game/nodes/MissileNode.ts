// Port of ru/alientransporter/nodes/MissileNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Physic } from '../components/Physic';
import { MissileModel } from '../models/MissileModel';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class MissileNode extends AntNode {
  static readonly className = 'MissileNode';
  static override readonly components = {
    info: Info,
    physic: Physic,
    model: MissileModel,
  } as const;

  info!: Info;
  physic!: Physic;
  model!: MissileModel;

  constructor() {
    super();
  }
}
