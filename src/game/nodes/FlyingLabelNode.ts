// Port of ru/alientransporter/nodes/FlyingLabelNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { FlyingLabel } from '../components/FlyingLabel';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class FlyingLabelNode extends AntNode {
  static readonly className = 'FlyingLabelNode';
  static override readonly components = {
    info: Info,
    flyingLabel: FlyingLabel,
  } as const;

  info!: Info;
  flyingLabel!: FlyingLabel;

  constructor() {
    super();
  }
}
