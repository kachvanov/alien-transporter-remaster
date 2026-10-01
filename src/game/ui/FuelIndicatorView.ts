// Port of ru/alientransporter/ui/FuelIndicatorView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntMath } from '../../engine/utils/AntMath';
import { Label } from '../fonts/Label';

export class FuelIndicatorView extends AntActor {
  static readonly className = 'FuelIndicatorView';

  static readonly RED = 16712452; // uint
  static readonly WHITE = 16777215; // uint
  static readonly GREEN = 10934876; // uint

  private _label: Label;
  private _bar: AntActor;
  private _maxValue: number;
  private _value: number;

  constructor() {
    super();
    this.addAnimationFromCache('FuelIndicatorBG_mc');
    this._bar = this.recycle(AntActor) as AntActor;
    this._bar.addAnimationFromCache('FuelIndicatorRed_mc', 'red');
    this._bar.addAnimationFromCache('FuelIndicatorYellow_mc', 'yellow');
    this._bar.addAnimationFromCache('FuelIndicatorGreen_mc', 'green');
    this._label = this.recycle(Label) as Label;
    this._label.fontName = 'font03';
    this._label.text = 'low fuel';
    this._label.color = FuelIndicatorView.RED;
    this._maxValue = 1;
    this._value = 0;
  }

  override revive(): void {
    this._bar.revive();
    this._label.revive();
    super.revive();
  }

  private updateVisual(): void {
    this._label.x = this.width * 0.5 - this._label.width * 0.5 - 2;
    this._label.y = -this._label.height + 1;
    const percent = AntMath.toPercent(this._value, this._maxValue);
    let frame = AntMath.ceil(AntMath.fromPercent(percent, this._bar.totalFrames)) | 0; // :int
    frame = frame <= 0 ? 1 : frame > this._bar.totalFrames ? this._bar.totalFrames : frame;
    if (percent >= 60) {
      this._bar.switchAnimation('green');
    } else if (percent < 60 && percent >= 30) {
      this._bar.switchAnimation('yellow');
    } else if (percent < 30) {
      this._bar.switchAnimation('red');
    }

    this._bar.gotoAndStop(frame);
  }

  get labelText(): string {
    return this._label.text;
  }
  set labelText(value: string) {
    this._label.text = value;
    this.updateVisual();
  }

  get labelColor(): number {
    return this._label.color;
  }
  set labelColor(value: number) {
    this._label.color = value >>> 0;
  }

  getAlpha(): number {
    return this.alpha;
  }

  setAlpha(aValue: number): void {
    this.alpha = aValue;
    this._bar.alpha = aValue;
    this._label.alpha = aValue;
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
    this.updateVisual();
  }
}
