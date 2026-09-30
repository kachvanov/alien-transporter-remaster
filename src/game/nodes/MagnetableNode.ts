// Port of ru/alientransporter/nodes/MagnetableNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Display } from '../components/Display';
import { EffectInfo } from '../components/EffectInfo';
import { Info } from '../components/Info';
import { Magnetable } from '../components/Magnetable';
import { Physic } from '../components/Physic';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class MagnetableNode extends AntNode {
  static readonly className = 'MagnetableNode';
  static override readonly components = {
    info: Info,
    physic: Physic,
    display: Display,
    magnetable: Magnetable,
    effectInfo: EffectInfo,
  } as const;

  info!: Info;
  physic!: Physic;
  display!: Display;
  magnetable!: Magnetable;
  effectInfo!: EffectInfo;

  constructor() {
    super();
  }
}
