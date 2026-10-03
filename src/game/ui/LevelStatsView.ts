// Port of ru/alientransporter/ui/LevelStatsView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntMath } from '../../engine/utils/AntMath';
import { LevelStatsGoalView } from './LevelStatsGoalView';

export class LevelStatsView extends AntActor {
  static readonly className = 'LevelStatsView';

  private _maxHeight: number; // int
  private _maxValue: number;
  private _bottomLine: AntActor;
  private _goals: LevelStatsGoalView[];

  constructor() {
    super();
    this._maxHeight = 202;
    this._maxValue = 1;
    this._bottomLine = this.recycle(AntActor) as AntActor;
    this._bottomLine.addAnimationFromCache('BgLine_mc');
    this._goals = [];
  }

  override revive(): void {
    super.revive();
    this._bottomLine.revive();
    this._goals.length = 0;
  }

  isEarnGoal(aValue: number): boolean {
    let i = 0; // :int
    const n = this._goals.length | 0; // :int
    while (i < n) {
      const goal = this._goals[i++] as LevelStatsGoalView;
      if (!goal.earned && goal.value <= aValue) {
        goal.earned = true;
        return true;
      }
    }

    return false;
  }

  addGoal(aValue: number): void {
    const goal = this.recycle(LevelStatsGoalView) as LevelStatsGoalView;
    goal.revive();
    goal.reset(0, -50);
    goal.value = aValue;
    this._goals.push(goal);
    this.updateVisual();
  }

  setMaxGoal(aValue: number): void {
    this._maxValue = aValue;
    this.updateVisual();
  }

  private updateVisual(): void {
    let i = 0; // :int
    const n = this._goals.length | 0; // :int
    while (i < n) {
      const goal = this._goals[i++] as LevelStatsGoalView;
      const percent = AntMath.toPercent(goal.value, this._maxValue);
      goal.y = -Math.round(AntMath.fromPercent(percent, this._maxHeight));
    }
  }
}
