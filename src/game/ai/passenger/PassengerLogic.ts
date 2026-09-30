// STUB(T1.9d): stand-in for ru/alientransporter/ai/passenger/PassengerLogic.as.
// T1.9d ports the real class (the schedules of the passenger) and replaces this file. Factory.makePassenger
// needs the class; the stub has no schedules and always selects the idle state.

import type { Ctor } from '../../../engine/utils/types';
import type { ILogic } from '../ILogic';
import type { ConditionList } from '../ConditionList';
import type { Schedule } from '../Schedule';
import { StateName } from '../StateName';

export class PassengerLogic implements ILogic {
  static readonly className = 'PassengerLogic';

  constructor() {
    // super();
  }

  getSchedules(): Ctor<Schedule>[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  selectSchedule(_aSchedule: Schedule, _aConditions: ConditionList): string {
    return StateName.IDLE;
  }
}
