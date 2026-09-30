// Port of ru/alientransporter/nodes/PlayerNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { KeyboardControl } from '../components/KeyboardControl';
import { ShuttleControl } from '../components/ShuttleControl';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class PlayerNode extends AntNode {
  static readonly className = 'PlayerNode';
  static override readonly components = {
    info: Info,
    control: ShuttleControl,
    keys: KeyboardControl,
  } as const;

  info!: Info;
  control!: ShuttleControl;
  keys!: KeyboardControl;

  constructor() {
    super();
  }
}
