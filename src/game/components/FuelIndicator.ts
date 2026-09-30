// Port of ru/alientransporter/components/FuelIndicator.as

import { AntG } from '../../engine/core/AntG';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { FuelIndicatorView } from '../ui/FuelIndicatorView'; // STUB(T1.9e)

export class FuelIndicator {
  static readonly className = 'FuelIndicator';

  x: number;
  y: number;
  view: FuelIndicatorView;
  alarm: boolean;
  private _tween: AntTween;
  private _alarmInterval: number; // uint
  private _blinkInterval: number; // uint
  private _isHide: boolean;

  constructor(aView: FuelIndicatorView) {
    // super();
    this.alarm = false;
    this.view = aView;
    this.view.visible = false;
    this.x = -this.view.width * 0.5 + 2;
    this.y = -30;
    this._tween = new AntTween(this, 0.5, AntTransition.EASE_OUT_ELASTIC);
    this._tween.autocaching = false;
    this._alarmInterval = 0;
    this._blinkInterval = 0;
    this._isHide = false;
  }

  destroy(): void {
    this.view.kill();
    this.view = null as unknown as FuelIndicatorView; // AS3: view = null
    this._tween.destroy();
  }

  updateAlarm(): void {
    if (this.alarm) {
      // AS3 uint(getTimer()): the simulation clock, see AntG.simTimeMs.
      const time = AntG.simTimeMs >>> 0; // :uint
      if (time - this._alarmInterval > 1000) {
        this._alarmInterval = time;
        AntG.sounds.play('SndLowFuelAlarm', this.view);
      }

      if (time - this._blinkInterval > 500) {
        this._blinkInterval = time;
        this.view.labelColor =
          this.view.labelColor == FuelIndicatorView.RED ? FuelIndicatorView.WHITE : FuelIndicatorView.RED;
      }
    }
  }

  show(aText: string, aColor: number): void {
    this.y = -15;
    this.alpha = 0;
    this.view.visible = true;
    this.view.labelText = aText;
    this.view.labelColor = aColor >>> 0;
    this._tween.reset(this, 0.5, AntTransition.EASE_OUT_BOUNCE);
    this._tween.animate('y', -30);
    this._tween.animate('alpha', 1);
    this._tween.start();
  }

  hide(): void {
    if (!this._isHide) {
      this.y = -30;
      this.alpha = 1;
      this._tween.reset(this, 0.25, AntTransition.EASE_OUT);
      this._tween.animate('y', -15);
      this._tween.animate('alpha', 0);
      this._tween.eventComplete.add(this.onEndHide);
      this._tween.start();
      this._isHide = true;
    }
  }

  private onEndHide = (): void => {
    this._tween.eventComplete.remove(this.onEndHide);
    this.view.visible = false;
    this._isHide = false;
  };

  get alpha(): number {
    return this.view.getAlpha();
  }
  set alpha(value: number) {
    this.view.setAlpha(value);
  }
}
