// Port of ru/alientransporter/nodes/PortalNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Portal } from '../components/Portal';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class PortalNode extends AntNode {
  static readonly className = 'PortalNode';
  static override readonly components = {
    info: Info,
    portal: Portal,
  } as const;

  info!: Info;
  portal!: Portal;

  constructor() {
    super();
  }
}
