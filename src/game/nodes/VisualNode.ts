// Port of ru/alientransporter/nodes/VisualNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Display } from '../components/Display';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class VisualNode extends AntNode {
  static readonly className = 'VisualNode';
  static override readonly components = {
    info: Info,
    display: Display,
  } as const;

  info!: Info;
  display!: Display;

  constructor() {
    super();
  }
}
