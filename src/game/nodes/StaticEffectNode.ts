// Port of ru/alientransporter/nodes/StaticEffectNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { StaticEffect } from '../components/StaticEffect';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class StaticEffectNode extends AntNode {
  static readonly className = 'StaticEffectNode';
  static override readonly components = {
    info: Info,
    effect: StaticEffect,
  } as const;

  info!: Info;
  effect!: StaticEffect;

  constructor() {
    super();
  }
}
