// Port of ru/alientransporter/nodes/HealthNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Death } from '../components/Death';
import { Display } from '../components/Display';
import { Health } from '../components/Health';
import { Info } from '../components/Info';
import { PhysicModel } from '../components/PhysicModel';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class HealthNode extends AntNode {
  static readonly className = 'HealthNode';
  static override readonly components = {
    info: Info,
    death: Death,
    health: Health,
    display: Display,
    model: PhysicModel,
  } as const;

  info!: Info;
  death!: Death;
  health!: Health;
  display!: Display;
  model!: PhysicModel;

  constructor() {
    super();
  }
}
