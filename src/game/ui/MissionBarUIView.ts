// Port of ru/alientransporter/ui/MissionBarUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntMath } from '../../engine/utils/AntMath';
import { TextUIView } from './TextUIView';

export class MissionBarUIView extends AntActor {
  static readonly className = 'MissionBarUIView';

  private _maxValue: number;
  private _value: number;
  private _lightBack: AntActor;
  private _lightFront: AntActor;
  private _icon: AntActor;
  private _desc: TextUIView;
  private _goal: TextUIView;
  private _tween: AntTween;
  private _isAnimation: boolean;

  constructor() {
    super();
    this.addAnimationFromCache('MissionBar_mc');
    this.isScrolled = false;
    this._lightBack = this.recycle(AntActor) as AntActor;
    this._lightBack.addAnimationFromCache('MissionCompleteLight01_mc');
    this._lightBack.reset(-83, 0);
    this._lightBack.blend = 'overlay';
    this._lightBack.play();
    this._lightBack.visible = false;
    this._icon = this.recycle(AntActor) as AntActor;
    this._icon.addAnimationFromCache('ShuttleHull01Color01_mc');
    this._icon.reset(-83, 0);
    this._lightFront = this.recycle(AntActor) as AntActor;
    this._lightFront.addAnimationFromCache('MissionCompleteLight02_mc');
    this._lightFront.reset(-83, 0);
    this._lightFront.blend = 'overlay';
    this._lightFront.play();
    this._lightFront.visible = false;
    this._desc = this.recycle(TextUIView) as TextUIView;
    this._desc.reset(24, -29);
    this._desc.text = '';
    this._goal = this.recycle(TextUIView) as TextUIView;
    this._goal.reset(24, -29 + this._desc.textHeight);
    this._goal.textColor = 12380988;
    this._goal.text = '';
    this._goal.size = 16;
    this._maxValue = 1;
    this._value = 0;
    this._tween = new AntTween(this, 0.5, AntTransition.EASE_OUT);
    this._tween.autocaching = false;
    this._isAnimation = false;
  }

  show(): void {
    const y = this.y | 0; // :int
    this.reset(400, 600 + 26);
    this._tween.reset(this, 0.5, AntTransition.EASE_OUT);
    this._tween.animate('y', y);
    this._tween.eventComplete.add(this.onEndAnimation);
    this._tween.start();
    this._isAnimation = true;
  }

  hide(): void {
    this._tween.reset(this, 0.5, AntTransition.EASE_IN);
    this._tween.animate('y', 600 + 26);
    this._tween.eventComplete.add(this.onEndAnimation);
    this._tween.start();
    this._isAnimation = true;
  }

  private onEndAnimation = (): void => {
    this._tween.eventComplete.remove(this.onEndAnimation);
    this._isAnimation = false;
  };

  override revive(): void {
    super.revive();
    this._icon.revive();
    this._desc.revive();
    this._goal.revive();
    this._lightFront.revive();
    this._lightBack.revive();
    this.enableEffect = false;
  }

  updateVisual(): void {
    const percent = AntMath.toPercent(this._value, this._maxValue);
    let frame = AntMath.ceil(AntMath.fromPercent(percent, this.totalFrames)) | 0; // :int
    frame = frame <= 0 ? 1 : frame > this.totalFrames ? this.totalFrames : frame;
    this.gotoAndStop(frame);
    this._goal.text = Math.round(this._value).toString();
    this._goal.visible = this._maxValue > 1;
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

  get icon(): string | null {
    return this._icon.currentAnimation;
  }
  set icon(value: string) {
    this._icon.clearAnimations();
    this._icon.addAnimationFromCache(value);
  }

  get description(): string {
    return this._desc.text;
  }
  set description(value: string) {
    this._desc.text = value;
    this._desc.highlightText = this._value.toString();
    this._desc.highlightText = this._maxValue.toString();
    this._goal.reset(this._goal.x, this._desc.y + this._desc.textHeight);
  }

  get isAnimation(): boolean {
    return this._isAnimation;
  }

  get enableEffect(): boolean {
    return this._lightFront.visible;
  }
  set enableEffect(value: boolean) {
    this._lightFront.visible = this._lightBack.visible = value;
  }
}
