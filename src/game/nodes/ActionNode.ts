// Port of ru/alientransporter/nodes/ActionNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { ActionBehavior } from '../components/ActionBehavior';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ActionNode extends AntNode {
  static readonly className = 'ActionNode';
  static override readonly components = {
    info: Info,
    action: ActionBehavior,
  } as const;

  info!: Info;
  action!: ActionBehavior;

  constructor() {
    super();
  }
}
