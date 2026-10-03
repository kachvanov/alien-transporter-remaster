// Port of ru/alientransporter/views/SmallBoxView.as

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class SmallBoxView extends AntActor {
  static readonly className = 'SmallBoxView';

  constructor() {
    super();
    this.addAnimationFromCache('BoxSmall_mc');
    this.smoothing = G.gameData.fancyQuality;
  }
}
