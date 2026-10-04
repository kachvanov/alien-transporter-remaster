// Port of ru/alientransporter/views/SmokeParticleView.as

import { BasicParticleView } from './BasicParticleView';

export class SmokeParticleView extends BasicParticleView {
  static override readonly className = 'SmokeParticleView';

  constructor() {
    super();
    this.registerAnimations(['SmokeEffect01_mc', 'SmokeEffect02_mc']);
  }
}
