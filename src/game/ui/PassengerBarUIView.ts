// Port of ru/alientransporter/ui/PassengerBarUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntFormat } from '../../engine/utils/AntFormat';
import { AntMath } from '../../engine/utils/AntMath';
import type { AnyFunction } from '../../engine/utils/types';
import { Label } from '../fonts/Label';

export class PassengerBarUIView extends AntActor {
  static readonly className = 'PassengerBarUIView';

  private _roller: AntActor;
  private _icon: AntActor;
  private _maxValue: number;
  private _value: number;
  private _toValue: number;
  private _curValue: number;
  private _labelMax: Label;
  private _labelCur: Label;

  constructor() {
    super();
    this.addAnimationFromCache('PassengerBar_mc');
    this.isScrolled = false;
    this._roller = this.recycle(AntActor) as AntActor;
    this._roller.addAnimationFromCache('PassengerBarRoller_mc');
    this._roller.isScrolled = false;
    this._icon = this.recycle(AntActor) as AntActor;
    this._icon.addAnimationFromCache('PassengerBarIcons_mc');
    this._icon.isScrolled = false;
    this._icon.reset(-119, 1);
    this._maxValue = 1;
    this._value = 0;
    this._toValue = 0;
    this._curValue = 0;
    this._labelCur = new Label();
    this._labelCur.isScrolled = false;
    this._labelCur.fontName = 'font01';
    this._labelCur.text = '0';
    this._labelCur.color = 16768145;
    this.add(this._labelCur);
    this._labelMax = new Label();
    this._labelMax.isScrolled = false;
    this._labelMax.fontName = 'font02';
    this._labelMax.text = '/1';
    this._labelMax.color = 16768145;
    this.add(this._labelMax);
    this.updateVisual();
  }

  override revive(): void {
    super.revive();
    this._roller.revive();
    this._icon.revive();
    this._labelCur.revive();
    this._labelMax.revive();
  }

  override update(): void {
    this._curValue = AntMath.lerp(this._curValue, this._toValue, 0.1);
    if (this._curValue != this._toValue) {
      const percent = AntMath.toPercent(this._curValue, this._maxValue);
      let frame = AntMath.ceil(AntMath.fromPercent(percent, this._roller.totalFrames)) | 0; // :int
      frame = frame <= 0 ? 1 : frame > this._roller.totalFrames ? this._roller.totalFrames : frame;
      this._roller.gotoAndStop(frame);
      this._labelCur.text = AntFormat.formatNumber(this._curValue, 0, false);
      this.updateLabels();
    }

    if (AntMath.equal(this._curValue, this._toValue, 0.01)) {
      this._curValue = this._toValue;
    }

    super.update();
  }

  show(): void {
    const y = this.y | 0; // :int
    this.y -= 50;
    const tween = AntTween.get(this, 0.5, AntTransition.EASE_OUT);
    tween.animate('y', y);
    tween.start();
  }

  hide(aCallback: AnyFunction | null = null, aArgs: unknown[] | null = null): void {
    const tween = AntTween.get(this, 0.25, AntTransition.EASE_IN);
    tween.animate('y', this.y - 50);
    if (aCallback != null) {
      tween.eventComplete.add(aCallback);
      if (aArgs != null) {
        tween.completeArgs = aArgs;
      }
    }

    tween.start();
  }

  private updateVisual(): void {
    this._labelMax.text = '/' + this._maxValue.toFixed();
    this.updateLabels();
    const percent = AntMath.toPercent(this._value, this._maxValue);
    let frame = AntMath.ceil(AntMath.fromPercent(percent, this._roller.totalFrames)) | 0; // :int
    frame = frame <= 0 ? 1 : frame > this._roller.totalFrames ? this._roller.totalFrames : frame;
    this._roller.gotoAndStop(frame);
  }

  private updateLabels(): void {
    this._labelMax.y = -this._labelMax.height + 10;
    this._labelCur.y = -this._labelCur.height + 12;
    this._labelCur.x = -90;
    this._labelMax.x = -90 + this._labelCur.width;
  }

  get maxValue(): number {
    return this._maxValue;
  }
  set maxValue(value: number) {
    this._maxValue = value;
    this.updateVisual();
  }

  get value(): number {
    return this._value;
  }
  set value(value: number) {
    this._value = value;
    this._toValue = value;
    this.updateVisual();
  }
}
