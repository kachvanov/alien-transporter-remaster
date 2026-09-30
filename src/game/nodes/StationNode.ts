// Port of ru/alientransporter/nodes/StationNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Station } from '../components/Station';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class StationNode extends AntNode {
  static readonly className = 'StationNode';
  static override readonly components = {
    info: Info,
    station: Station,
  } as const;

  info!: Info;
  station!: Station;

  constructor() {
    super();
  }
}
