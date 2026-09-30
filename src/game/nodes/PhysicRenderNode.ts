// Port of ru/alientransporter/nodes/PhysicRenderNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Display } from '../components/Display';
import { Physic } from '../components/Physic';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class PhysicRenderNode extends AntNode {
  static readonly className = 'PhysicRenderNode';
  static override readonly components = {
    display: Display,
    physic: Physic,
  } as const;

  display!: Display;
  physic!: Physic;

  constructor() {
    super();
  }
}
