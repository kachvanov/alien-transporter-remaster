// Port of ru/alientransporter/nodes/ExpelObjectNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Display } from '../components/Display';
import { ExpelObject } from '../components/ExpelObject';
import { Info } from '../components/Info';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class ExpelObjectNode extends AntNode {
  static readonly className = 'ExpelObjectNode';
  static override readonly components = {
    info: Info,
    display: Display,
    expel: ExpelObject,
  } as const;

  info!: Info;
  display!: Display;
  expel!: ExpelObject;

  constructor() {
    super();
  }
}
