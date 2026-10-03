// Port of ru/alientransporter/views/BigBoxView.as

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class BigBoxView extends AntActor {
  static readonly className = 'BigBoxView';

  constructor() {
    super();
    this.addAnimationFromCache('BoxBig_mc');
    this.smoothing = G.gameData.fancyQuality;
  }
}
