// Port of ru/alientransporter/views/CoinView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { G } from '../G';

export class CoinView extends AntActor {
  static readonly className = 'CoinView';

  private _tween: AntTween;

  constructor() {
    super();
    this.addAnimationFromCache('Coin_mc');
    this.smoothing = G.gameData.fancyQuality;
    this._tween = new AntTween(this, 0.5, AntTransition.EASE_OUT_ELASTIC);
    this._tween.autocaching = false;
  }

  show(): void {
    this.scaleX = 0.25;
    this.scaleY = 0.25;
    this._tween.reset(this, 0.5, AntTransition.EASE_OUT_ELASTIC);
    this._tween.animate('scaleX', 1);
    this._tween.animate('scaleY', 1);
    this._tween.start();
  }

  override revive(): void {
    this.scaleX = 1;
    this.scaleY = 1;
    super.revive();
  }
}
