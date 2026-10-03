// Port of ru/alientransporter/ui/LevelStatsGoalView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntLabel } from '../fonts/AntLabel';

export class LevelStatsGoalView extends AntActor {
  static readonly className = 'LevelStatsGoalView';

  private _star: AntActor;
  private _label: AntLabel;
  private _value: number; // int
  private _earned: boolean;

  constructor() {
    super();
    this.addAnimationFromCache('BgLine_mc');
    this._star = this.recycle(AntActor) as AntActor;
    this._star.addAnimationFromCache('StarTiny_mc');
    this._star.reset(-this.width * 0.5, -3);
    this._label = new AntLabel('system', 8, 6572122);
    this._label.text = '0';
    this._label.y -= this._label.height;
    this.add(this._label);
    this._value = 0;
    this._earned = false; // `_earned = 0` of the original (a Boolean)
    this.updateVisual();
  }

  override revive(): void {
    super.revive();
    this._star.revive();
    this._label.revive();
    this._value = 0;
    this._earned = false;
  }

  private updateVisual(): void {
    this._label.text = this._value.toString();
    this._label.x = this.width * 0.5 - this._label.width * 0.5;
  }

  get value(): number {
    return this._value;
  }
  set value(value: number) {
    this._value = value | 0;
    this.updateVisual();
  }

  get earned(): boolean {
    return this._earned;
  }
  set earned(value: boolean) {
    this._earned = value;
  }
}
