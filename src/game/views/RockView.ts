// Port of ru/alientransporter/views/RockView.as

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class RockView extends AntActor {
  static readonly className = 'RockView';

  constructor() {
    super();
    this.addAnimationFromCache('Rock01_mc');
    this.addAnimationFromCache('Rock02_mc');
    this.addAnimationFromCache('Rock03_mc');
    this.addAnimationFromCache('Rock04_mc');
    this.addAnimationFromCache('Rock05_mc');
    this.addAnimationFromCache('Rock06_mc');
    this.addAnimationFromCache('Rock07_mc');
    this.smoothing = G.gameData.fancyQuality;
  }
}
