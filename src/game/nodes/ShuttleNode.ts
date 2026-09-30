// Port of ru/alientransporter/nodes/ShuttleNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { CargoHold } from '../components/CargoHold';
import { Display } from '../components/Display';
import { Info } from '../components/Info';
import { Physic } from '../components/Physic';
import { ShuttleControl } from '../components/ShuttleControl';
import { ShuttleStats } from '../components/ShuttleStats';
import { ShuttleModel } from '../models/ShuttleModel';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ShuttleNode extends AntNode {
  static readonly className = 'ShuttleNode';
  static override readonly components = {
    info: Info,
    display: Display,
    physic: Physic,
    model: ShuttleModel,
    stats: ShuttleStats,
    control: ShuttleControl,
    cargoHold: CargoHold,
  } as const;

  info!: Info;
  display!: Display;
  physic!: Physic;
  model!: ShuttleModel;
  stats!: ShuttleStats;
  control!: ShuttleControl;
  cargoHold!: CargoHold;

  constructor() {
    super();
  }
}
