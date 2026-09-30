// Port of ru/alientransporter/nodes/ShuttleSpawnNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { ShuttleSpawn } from '../components/ShuttleSpawn';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ShuttleSpawnNode extends AntNode {
  static readonly className = 'ShuttleSpawnNode';
  static override readonly components = {
    info: Info,
    point: ShuttleSpawn,
  } as const;

  info!: Info;
  point!: ShuttleSpawn;

  constructor() {
    super();
  }
}
