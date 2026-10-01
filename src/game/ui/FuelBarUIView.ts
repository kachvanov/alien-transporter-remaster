// Port of ru/alientransporter/ui/FuelBarUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntMath } from '../../engine/utils/AntMath';

export class FuelBarUIView extends AntActor {
  static readonly className = 'FuelBarUIView';

  static readonly LEFT = 'left';
  static readonly RIGHT = 'right';

  private _bar: AntActor;
  private _maxValue: number;
  private _curValue: number;
  private _animValue: number;
  private _align: string;

  constructor() {
    super();
    this.addAnimationFromCache('ShuttleBarLeftBG_mc', FuelBarUIView.LEFT);
    this.addAnimationFromCache('ShuttleBarRightBG_mc', FuelBarUIView.RIGHT);
    this.isScrolled = false;
    this._bar = this.recycle(AntActor) as AntActor;
    this._bar.addAnimationFromCache('ShuttleBarLeftRoller_mc', FuelBarUIView.LEFT);
    this._bar.addAnimationFromCache('ShuttleBarRightRoller_mc', FuelBarUIView.RIGHT);
    this._bar.isScrolled = false;
    this._maxValue = 1;
    this._curValue = 0;
    this._animValue = 0;
    this._align = FuelBarUIView.RIGHT;
  }

  override revive(): void {
    this._bar.revive();
    super.revive();
  }

  override update(): void {
    this._animValue = AntMath.lerp(this._animValue, this._curValue, 0.15);
    const percent = AntMath.toPercent(this._animValue, this._maxValue);
    let frame = AntMath.ceil(AntMath.fromPercent(percent, this._bar.totalFrames)) | 0; // :int
    frame = frame <= 0 ? 1 : frame > this._bar.totalFrames ? this._bar.totalFrames : frame;
    this._bar.gotoAndStop(frame);
    super.update();
  }

  get align(): string {
    return this._align;
  }
  set align(value: string) {
    if (this._align != value) {
      this._align = value;
      this.switchAnimation(this._align);
      this._bar.switchAnimation(this._align);
    }
  }

  get maxValue(): number {
    return this._maxValue;
  }
  set maxValue(value: number) {
    this._maxValue = value;
  }

  get value(): number {
    return this._curValue;
  }
  set value(value: number) {
    this._curValue = value;
  }
}
