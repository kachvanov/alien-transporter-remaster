// Port of ru/alientransporter/ui/LevelStarView.as

import { AntActor } from '../../engine/core/AntActor';

export class LevelStarView extends AntActor {
  static readonly className = 'LevelStarView';

  constructor() {
    super();
    this.addAnimationFromCache('BtnStar_mc');
  }
}
