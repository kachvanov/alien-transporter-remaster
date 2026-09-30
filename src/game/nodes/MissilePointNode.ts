// Port of ru/alientransporter/nodes/MissilePointNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { MissilePoint } from '../components/MissilePoint';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class MissilePointNode extends AntNode {
  static readonly className = 'MissilePointNode';
  static override readonly components = {
    info: Info,
    missile: MissilePoint,
  } as const;

  info!: Info;
  missile!: MissilePoint;

  constructor() {
    super();
  }
}
