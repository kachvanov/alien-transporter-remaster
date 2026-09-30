// Port of ru/alientransporter/nodes/KeyPointNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { KeyPoint } from '../components/KeyPoint';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class KeyPointNode extends AntNode {
  static readonly className = 'KeyPointNode';
  static override readonly components = {
    info: Info,
    point: KeyPoint,
  } as const;

  info!: Info;
  point!: KeyPoint;

  constructor() {
    super();
  }
}
