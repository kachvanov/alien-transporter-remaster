// Port of ru/alientransporter/views/FireParticleView.as

import { G } from '../G';
import { BasicParticleView } from './BasicParticleView';

export class FireParticleView extends BasicParticleView {
  static override readonly className = 'FireParticleView';

  constructor() {
    super();
    this.registerAnimations(['EngineFireEffect01_mc', 'EngineFireEffect02_mc']);
    this.blend = G.gameData.fancyEffects ? 'add' : null;
  }

  override revive(): void {
    super.revive();
    this.blend = G.gameData.fancyEffects ? 'add' : null;
  }
}
