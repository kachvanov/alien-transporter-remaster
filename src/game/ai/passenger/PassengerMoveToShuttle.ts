// Port of ru/alientransporter/ai/passenger/PassengerMoveToShuttle.as

import { AntMath } from '../../../engine/utils/AntMath';
import type { AntBox2DBody } from '../../../physics/anthill/AntBox2DBody';
import type { PassengerNode } from '../../nodes/PassengerNode';
import { PassengerView } from '../../views/PassengerView';
import { ConditionName } from '../ConditionName';
import { Schedule } from '../Schedule';
import { StateName } from '../StateName';

export class PassengerMoveToShuttle extends Schedule {
  private _node: PassengerNode | null = null;
  private _speed = NaN;

  constructor() {
    super(StateName.MOVE_TO_SHUTTLE);
    this.addInstantTask(this.onStart);
    this.addTask(this.onUpdate);
    this.addInterrupt(ConditionName.OBSTACLE);
    this.addInterrupt(ConditionName.SHUTTLE_IS_FULL);
  }

  private onStart = (): void => {
    if (this._node == null) {
      this._node = this.userData as PassengerNode;
    }

    const passenger = this._node.display.passenger!;
    this._speed = AntMath.randomRangeNumber(1.5, 2);
    passenger.animationSpeed = this._speed;
    passenger.switchAnimation(passenger.animWalk);
    passenger.showNotify(PassengerView.ATTENTION);
  };

  private onUpdate = (): boolean => {
    const node = this._node!;
    const wheel = node.model.wheel as AntBox2DBody;
    wheel.applyAngularVelocity(-5 * this._speed * node.display.view.scaleX);
    wheel.applyTorque(-10 * node.display.view.scaleX);
    if (node.mediator.hasLandedShuttles && node.mediator.hasAvailShuttles) {
      node.display.view.scaleX = node.mediator.getShuttle()!.display.view.x < node.display.view.x ? 1 : -1;
      return false;
    }

    return true;
  };
}
