// Port of ru/alientransporter/ai/passenger/PassengerSense.as

import { AntG } from '../../../engine/core/AntG';
import { AntMath } from '../../../engine/utils/AntMath';
import type { PassengerNode } from '../../nodes/PassengerNode';
import { ConditionName } from '../ConditionName';
import type { ConditionList } from '../ConditionList';
import type { ISense } from '../ISense';

export class PassengerSense implements ISense {
  static readonly className = 'PassengerSense';

  private _actionInterval: number;
  private _idleInterval: number;
  private _moveInterval: number;

  constructor() {
    // super();
    this._actionInterval = 2.5;
    this._idleInterval = 0;
    this._moveInterval = 0;
  }

  getConditions(aNode: PassengerNode, aConditions: ConditionList): void {
    aConditions.add(ConditionName.CAN_IDLE);
    aConditions.add(ConditionName.CAN_MOVE);
    if (
      (aNode.display.view.scaleX > 0 && aNode.model.hasLeftObstacle) ||
      (aNode.display.view.scaleX < 0 && aNode.model.hasRightObstacle)
    ) {
      aConditions.add(ConditionName.OBSTACLE);
    }

    if (
      (aNode.display.view.x < aNode.mediator.lowerLimit && aNode.display.view.scaleX == 1) ||
      (aNode.display.view.x > aNode.mediator.upperLimit && aNode.display.view.scaleX == -1)
    ) {
      aConditions.add(ConditionName.OBSTACLE);
    }

    if (aNode.mediator.justSpawned) {
      aConditions.add(ConditionName.CAN_TO_STATION);
    } else if (aNode.mediator.hasTicket) {
      this._actionInterval -= 2 * AntG.elapsed;
      if (this._actionInterval <= 0) {
        aConditions.add(ConditionName.CAN_ACTION);
        this._actionInterval = AntMath.randomRangeNumber(2, 4);
      }

      if (aNode.mediator.hasAvailShuttles) {
        aConditions.add(ConditionName.CAN_TO_SHUTTLE);
      }
    } else if (aNode.mediator.station != null || aNode.timer.isOut) {
      aConditions.add(ConditionName.CAN_TO_HOME);
    }
  }
}
