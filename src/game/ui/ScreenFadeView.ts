// Port of ru/alientransporter/ui/ScreenFadeView.as

import { AntActor } from '../../engine/core/AntActor';

export class ScreenFadeView extends AntActor {
  static readonly className = 'ScreenFadeView';

  constructor() {
    super();
    this.addAnimationFromCache('ScreenFade_mc');
    this.isScrolled = false;
  }
}
