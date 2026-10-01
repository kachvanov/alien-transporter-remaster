// Port of ru/alientransporter/ui/HullBarUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntFormat } from '../../engine/utils/AntFormat';
import { AntMath } from '../../engine/utils/AntMath';

export class HullBarUIView extends AntActor {
  static readonly className = 'HullBarUIView';

  private _maxValue: number;
  private _curValue: number;
  private _animValue: number;
  private _shuttleKind: number; // int
  private _shuttleColor: number; // int

  constructor() {
    super();
    this.addAnimationFromCache('ShuttleHull01Color01_mc');
    this.addAnimationFromCache('ShuttleHull01Color02_mc');
    this.addAnimationFromCache('ShuttleHull01Color03_mc');
    this.addAnimationFromCache('ShuttleHull01Color04_mc');
    this.addAnimationFromCache('ShuttleHull01Color05_mc');
    this.addAnimationFromCache('ShuttleHull02Color01_mc');
    this.addAnimationFromCache('ShuttleHull02Color02_mc');
    this.addAnimationFromCache('ShuttleHull02Color03_mc');
    this.addAnimationFromCache('ShuttleHull02Color04_mc');
    this.addAnimationFromCache('ShuttleHull02Color05_mc');
    this.addAnimationFromCache('ShuttleHull03Color01_mc');
    this.addAnimationFromCache('ShuttleHull03Color02_mc');
    this.addAnimationFromCache('ShuttleHull03Color03_mc');
    this.addAnimationFromCache('ShuttleHull03Color04_mc');
    this.addAnimationFromCache('ShuttleHull03Color05_mc');
    this.addAnimationFromCache('ShuttleHull04Color01_mc');
    this.addAnimationFromCache('ShuttleHull04Color02_mc');
    this.addAnimationFromCache('ShuttleHull04Color03_mc');
    this.addAnimationFromCache('ShuttleHull04Color04_mc');
    this.addAnimationFromCache('ShuttleHull04Color05_mc');
    this.isScrolled = false;
    this._maxValue = 1;
    this._curValue = 0;
    this._animValue = 0;
    this._shuttleKind = 1;
    this._shuttleColor = 1;
  }

  override update(): void {
    this._animValue = AntMath.lerp(this._animValue, this._curValue, 0.15);
    const percent = AntMath.toPercent(this._animValue, this._maxValue);
    let frame = AntMath.ceil(AntMath.fromPercent(percent, this.totalFrames)) | 0; // :int
    frame = frame <= 0 ? 1 : frame > this.totalFrames ? this.totalFrames : frame;
    this.gotoAndStop(frame);
    super.update();
  }

  private updateVisual(): void {
    this.switchAnimation(AntFormat.formatString('ShuttleHull0{0}Color0{1}_mc', this._shuttleKind, this._shuttleColor));
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
