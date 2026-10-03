// Port of ru/alientransporter/ui/FadeEffectView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntG } from '../../engine/core/AntG';

export class FadeEffectView extends AntActor {
  static readonly className = 'FadeEffectView';

  constructor() {
    super();
    this.addAnimationFromCache('FadeEffectShow_mc', 'show');
    this.addAnimationFromCache('FadeEffectHide_mc', 'hide');
    this.isScrolled = false;
    this.repeat = false;
  }

  show(): void {
    this.switchAnimation('show');
    AntG.sounds.play('SndShowScreen');
    this.gotoAndPlay(1);
  }

  hide(): void {
    this.switchAnimation('hide');
    AntG.sounds.play('SndHideScreen');
    this.gotoAndPlay(1);
  }

  override update(): void {
    super.update();
  }
}
