// Port of ru/alientransporter/nodes/TriggerNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Trigger } from '../components/Trigger';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class TriggerNode extends AntNode {
  static readonly className = 'TriggerNode';
  static override readonly components = {
    info: Info,
    trigger: Trigger,
  } as const;

  info!: Info;
  trigger!: Trigger;

  constructor() {
    super();
  }
}
