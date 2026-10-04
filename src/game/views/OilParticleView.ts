// Port of ru/alientransporter/views/OilParticleView.as

import { BasicParticleView } from './BasicParticleView';

export class OilParticleView extends BasicParticleView {
  static override readonly className = 'OilParticleView';

  constructor() {
    super();
    this.registerAnimations(['OilEffect01_mc']);
  }
}
