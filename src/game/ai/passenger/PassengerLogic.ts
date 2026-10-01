// Port of ru/alientransporter/ai/passenger/PassengerLogic.as

import type { Ctor } from '../../../engine/utils/types';
import type { ConditionList } from '../ConditionList';
import { ConditionName } from '../ConditionName';
import type { ILogic } from '../ILogic';
import type { Schedule } from '../Schedule';
import { StateName } from '../StateName';
import { PassengerAction } from './PassengerAction';
import { PassengerIdle } from './PassengerIdle';
import { PassengerMove } from './PassengerMove';
import { PassengerMoveToHome } from './PassengerMoveToHome';
import { PassengerMoveToShuttle } from './PassengerMoveToShuttle';
import { PassengerMoveToStation } from './PassengerMoveToStation';

export class PassengerLogic implements ILogic {
  static readonly className = 'PassengerLogic';

  constructor() {
    // super();
  }

  getSchedules(): Ctor<Schedule>[] {
    return [PassengerIdle, PassengerMove, PassengerAction, PassengerMoveToShuttle, PassengerMoveToStation, PassengerMoveToHome];
  }

  /** The AS3 `default: return null` is kept: an unknown schedule name gives null. */
  selectSchedule(aSchedule: Schedule, aConditions: ConditionList): string {
    switch (aSchedule.name) {
      case StateName.IDLE:
        if (
          aConditions.contains(ConditionName.CAN_TO_SHUTTLE) &&
          !aConditions.contains(ConditionName.OBSTACLE) &&
          !aConditions.contains(ConditionName.SHUTTLE_IS_FULL)
        ) {
          return StateName.MOVE_TO_SHUTTLE;
        }

        if (aConditions.contains(ConditionName.CAN_TO_HOME) && !aConditions.contains(ConditionName.OBSTACLE)) {
          return StateName.MOVE_TO_HOME;
        }

        if (aConditions.contains(ConditionName.CAN_TO_STATION) && !aConditions.contains(ConditionName.OBSTACLE)) {
          return StateName.MOVE_TO_STATION;
        }

        if (aConditions.contains(ConditionName.CAN_ACTION)) {
          return StateName.ACTION;
        }

        if (aConditions.contains(ConditionName.CAN_MOVE)) {
          return StateName.MOVE;
        }

        return StateName.IDLE;
      case StateName.MOVE_TO_SHUTTLE:
      case StateName.MOVE_TO_STATION:
      case StateName.MOVE_TO_HOME:
        if (
          aConditions.contains(ConditionName.CAN_TO_SHUTTLE) &&
          !aConditions.contains(ConditionName.OBSTACLE) &&
          !aConditions.contains(ConditionName.SHUTTLE_IS_FULL)
        ) {
          return StateName.MOVE_TO_SHUTTLE;
        }

        if (aConditions.contains(ConditionName.CAN_TO_HOME) && !aConditions.contains(ConditionName.OBSTACLE)) {
          return StateName.MOVE_TO_HOME;
        }

        if (aConditions.contains(ConditionName.CAN_TO_STATION) && !aConditions.contains(ConditionName.OBSTACLE)) {
          return StateName.MOVE_TO_STATION;
        }

        if (aConditions.contains(ConditionName.CAN_ACTION)) {
          return StateName.ACTION;
        }

        return StateName.IDLE;
      case StateName.MOVE:
        if (aConditions.contains(ConditionName.CAN_TO_SHUTTLE)) {
          return StateName.MOVE_TO_SHUTTLE;
        }

        if (aConditions.contains(ConditionName.CAN_TO_HOME)) {
          return StateName.MOVE_TO_HOME;
        }

        if (aConditions.contains(ConditionName.CAN_ACTION)) {
          return StateName.ACTION;
        }

        return StateName.IDLE;
      case StateName.ACTION:
        if (aConditions.contains(ConditionName.CAN_TO_SHUTTLE)) {
          return StateName.MOVE_TO_SHUTTLE;
        }

        if (aConditions.contains(ConditionName.CAN_MOVE)) {
          return StateName.MOVE;
        }

        return StateName.IDLE;
      default:
        return null as unknown as string; // AS3: return null
    }
  }
}
