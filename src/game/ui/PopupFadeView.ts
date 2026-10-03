// Port of ru/alientransporter/ui/PopupFadeView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';

export class PopupFadeView extends AntActor {
  static readonly className = 'PopupFadeView';

  private _tween: AntTween;

  constructor() {
    super();
    this.addAnimationFromCache('PauseScreenBG_mc');
    this._tween = new AntTween(this, 0.5, AntTransition.LINEAR);
    this._tween.autocaching = false;
  }

  show(): void {
    this.revive();
    this.alpha = 0;
    this._tween.reset(this, 0.5, AntTransition.LINEAR);
    this._tween.animate('alpha', 1);
    this._tween.start();
  }

  hide(): void {
    this._tween.reset(this, 0.75, AntTransition.LINEAR);
    this._tween.animate('alpha', 0);
    this._tween.eventComplete.add(this.onHidden);
    this._tween.start();
  }

  /** `_tween.eventComplete.add(kill)` of the original: `kill` as a bound method. */
  private onHidden = (): void => {
    this.kill();
  };
}
