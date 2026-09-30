// Port of ru/alientransporter/components/AIBehavior.as

import { AntG } from '../../engine/core/AntG';
import { ConditionList } from '../ai/ConditionList'; // STUB(T1.9d)
import type { ILogic } from '../ai/ILogic';
import type { ISense } from '../ai/ISense';
import type { Schedule } from '../ai/Schedule'; // STUB(T1.9d)
import { StateName } from '../ai/StateName';
import type { PassengerNode } from '../nodes/PassengerNode';

export class AIBehavior {
  static readonly className = 'AIBehavior';

  active: boolean;
  logic: ILogic;
  sense: ISense;
  schedule: Schedule | null = null;
  conditions: ConditionList;
  private _schedules: Record<string, Schedule>;
  private _interval: number;

  constructor(aLogic: ILogic, aSense: ISense) {
    // super();
    this._schedules = {};
    this._interval = 0;
    this.active = true;
    this.logic = aLogic;
    this.sense = aSense;
    this.conditions = new ConditionList();
    this.initLogic();
  }

  initLogic(): void {
    let i = 0;
    const schedules = this.logic.getSchedules();
    const n = schedules.length | 0; // :int
    while (i < n) {
      const schedule = new schedules[i++]!();
      this._schedules[schedule.name] = schedule;
    }
  }

  private setSchedule(aName: string, aNode: PassengerNode): void {
    // An unknown name gives undefined and fails on reset(), as null does in AS3.
    this.schedule = this._schedules[aName]!;
    this.schedule.reset(aNode);
  }

  update(aNode: PassengerNode): void {
    this._interval -= 2 * AntG.elapsed;
    if (this._interval <= 0) {
      if (this.active) {
        this.conditions.clear();
        this.sense.getConditions(aNode, this.conditions);
      }

      if (this.schedule == null) {
        this.setSchedule(StateName.IDLE, aNode);
      } else if (this.schedule.isFinished(this.conditions)) {
        this.setSchedule(this.logic.selectSchedule(this.schedule, this.conditions), aNode);
      }

      this._interval = 0.2;
    }

    this.schedule!.update();
  }
}
