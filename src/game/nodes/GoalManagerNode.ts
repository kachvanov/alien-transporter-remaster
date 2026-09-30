// Port of ru/alientransporter/nodes/GoalManagerNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { GoalManager } from '../components/GoalManager';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class GoalManagerNode extends AntNode {
  static readonly className = 'GoalManagerNode';
  static override readonly components = {
    info: Info,
    goal: GoalManager,
  } as const;

  info!: Info;
  goal!: GoalManager;

  constructor() {
    super();
  }
}
