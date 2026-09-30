// Port of ru/alientransporter/nodes/CoinPointNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { CoinPoint } from '../components/CoinPoint';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class CoinPointNode extends AntNode {
  static readonly className = 'CoinPointNode';
  static override readonly components = {
    info: Info,
    point: CoinPoint,
  } as const;

  info!: Info;
  point!: CoinPoint;

  constructor() {
    super();
  }
}
