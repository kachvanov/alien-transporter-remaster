// Port of ru/alientransporter/views/BarrelView.as

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class BarrelView extends AntActor {
  static readonly className = 'BarrelView';

  constructor() {
    super();
    this.addAnimationFromCache('Barrel_mc');
    this.addAnimationFromCache('BarrelExp_mc');
    this.smoothing = G.gameData.fancyQuality;
  }
}
