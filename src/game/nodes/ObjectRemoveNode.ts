// Port of ru/alientransporter/nodes/ObjectRemoveNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { ObjectRemover } from '../components/ObjectRemover';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ObjectRemoveNode extends AntNode {
  static readonly className = 'ObjectRemoveNode';
  static override readonly components = {
    info: Info,
    remover: ObjectRemover,
  } as const;

  info!: Info;
  remover!: ObjectRemover;

  constructor() {
    super();
  }
}
