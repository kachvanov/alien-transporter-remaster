// Port of ru/alientransporter/ai/ILogic.as
// (complete: the interface has only these two members)

import type { Ctor } from '../../engine/utils/types';
import type { ConditionList } from './ConditionList';
import type { Schedule } from './Schedule';

export interface ILogic {
  /** AS3 `Vector.<Class>`: the classes of the schedules, instantiated without arguments. */
  getSchedules(): Ctor<Schedule>[];
  selectSchedule(aSchedule: Schedule, aConditions: ConditionList): string;
}
