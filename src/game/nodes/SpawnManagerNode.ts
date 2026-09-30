// Port of ru/alientransporter/nodes/SpawnManagerNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { SpawnManager } from '../components/SpawnManager';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class SpawnManagerNode extends AntNode {
  static readonly className = 'SpawnManagerNode';
  static override readonly components = {
    info: Info,
    manager: SpawnManager,
  } as const;

  info!: Info;
  manager!: SpawnManager;

  constructor() {
    super();
  }
}
