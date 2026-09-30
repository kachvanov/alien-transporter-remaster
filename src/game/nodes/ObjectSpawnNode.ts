// Port of ru/alientransporter/nodes/ObjectSpawnNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { ObjectSpawner } from '../components/ObjectSpawner';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ObjectSpawnNode extends AntNode {
  static readonly className = 'ObjectSpawnNode';
  static override readonly components = {
    info: Info,
    spawner: ObjectSpawner,
  } as const;

  info!: Info;
  spawner!: ObjectSpawner;

  constructor() {
    super();
  }
}
