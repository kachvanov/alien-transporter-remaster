// Port of ru/alientransporter/nodes/ArrowPointNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { ArrowPoint } from '../components/ArrowPoint';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ArrowPointNode extends AntNode {
  static readonly className = 'ArrowPointNode';
  static override readonly components = {
    info: Info,
    point: ArrowPoint,
  } as const;

  info!: Info;
  point!: ArrowPoint;

  constructor() {
    super();
  }
}
