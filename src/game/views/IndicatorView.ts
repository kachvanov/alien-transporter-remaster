// Port of ru/alientransporter/views/IndicatorView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntFormat } from '../../engine/utils/AntFormat';
import { G } from '../G';

export class IndicatorView extends AntActor {
  static readonly className = 'IndicatorView';

  private _shuttleKind: number; // int
  private _shuttleColor: number; // int

  constructor() {
    super();
    this._shuttleKind = 1;
    this._shuttleColor = 1;
    for (let kind = 1; kind <= 4; kind++) {
      for (let color = 1; color <= 5; color++) {
        this.addAnimationFromCache('Indicator0' + kind + 'Color0' + color + '_mc');
      }
    }

    this.smoothing = G.gameData.fancyQuality;
    this.play();
  }

  private updateVisual(): void {
    this.switchAnimation(AntFormat.formatString('Indicator0{0}Color0{1}_mc', this._shuttleKind, this._shuttleColor));
  }

  get shuttleKind(): number {
    return this._shuttleKind;
  }

  set shuttleKind(value: number) {
    this._shuttleKind = value | 0;
    this.updateVisual();
  }

  get shuttleColor(): number {
    return this._shuttleColor;
  }

  set shuttleColor(value: number) {
    this._shuttleColor = value | 0;
    this.updateVisual();
  }
}
