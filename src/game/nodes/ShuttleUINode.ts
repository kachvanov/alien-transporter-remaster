// Port of ru/alientransporter/nodes/ShuttleUINode.as

import { AntNode } from '../../engine/ants/AntNode';
import { DisplayUI } from '../components/DisplayUI';
import { FuelIndicator } from '../components/FuelIndicator';
import { Info } from '../components/Info';
import { ShuttleUISync } from '../components/ShuttleUISync';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ShuttleUINode extends AntNode {
  static readonly className = 'ShuttleUINode';
  static override readonly components = {
    info: Info,
    display: DisplayUI,
    sync: ShuttleUISync,
    indicator: FuelIndicator,
  } as const;

  info!: Info;
  display!: DisplayUI;
  sync!: ShuttleUISync;
  indicator!: FuelIndicator;

  constructor() {
    super();
  }
}
