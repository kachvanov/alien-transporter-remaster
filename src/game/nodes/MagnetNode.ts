// Port of ru/alientransporter/nodes/MagnetNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Display } from '../components/Display';
import { Info } from '../components/Info';
import { Magnet } from '../components/Magnet';
import { Physic } from '../components/Physic';
import { ShuttleStats } from '../components/ShuttleStats';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class MagnetNode extends AntNode {
  static readonly className = 'MagnetNode';
  static override readonly components = {
    info: Info,
    display: Display,
    physic: Physic,
    magnet: Magnet,
    stats: ShuttleStats,
  } as const;

  info!: Info;
  display!: Display;
  physic!: Physic;
  magnet!: Magnet;
  stats!: ShuttleStats;

  constructor() {
    super();
  }
}
