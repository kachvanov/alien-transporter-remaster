// Port of ru/alientransporter/nodes/TransporterNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Transporter } from '../components/Transporter';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class TransporterNode extends AntNode {
  static readonly className = 'TransporterNode';
  static override readonly components = {
    info: Info,
    transporter: Transporter,
  } as const;

  info!: Info;
  transporter!: Transporter;

  constructor() {
    super();
  }
}
