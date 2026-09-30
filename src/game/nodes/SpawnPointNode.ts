// Port of ru/alientransporter/nodes/SpawnPointNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { SpawnPoint } from '../components/SpawnPoint';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class SpawnPointNode extends AntNode {
  static readonly className = 'SpawnPointNode';
  static override readonly components = {
    info: Info,
    point: SpawnPoint,
  } as const;

  info!: Info;
  point!: SpawnPoint;

  constructor() {
    super();
  }
}
