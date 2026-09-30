// Port of ru/alientransporter/nodes/RagdollNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Ragdoll } from '../components/Ragdoll';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class RagdollNode extends AntNode {
  static readonly className = 'RagdollNode';
  static override readonly components = {
    info: Info,
    ragdoll: Ragdoll,
  } as const;

  info!: Info;
  ragdoll!: Ragdoll;

  constructor() {
    super();
  }
}
