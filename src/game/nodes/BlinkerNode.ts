// Port of ru/alientransporter/nodes/BlinkerNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { BlinkerView } from '../views/BlinkerView';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class BlinkerNode extends AntNode {
  static readonly className = 'BlinkerNode';
  static override readonly components = {
    info: Info,
    view: BlinkerView,
  } as const;

  info!: Info;
  view!: BlinkerView;

  constructor() {
    super();
  }
}
