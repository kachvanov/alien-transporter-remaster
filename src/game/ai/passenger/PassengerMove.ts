// Port of ru/alientransporter/ai/passenger/PassengerMove.as

import { AntG } from '../../../engine/core/AntG';
import { AntMath } from '../../../engine/utils/AntMath';
import type { AntBox2DBody } from '../../../physics/anthill/AntBox2DBody';
import type { PassengerNode } from '../../nodes/PassengerNode';
import { ConditionName } from '../ConditionName';
import { Schedule } from '../Schedule';
import { StateName } from '../StateName';

export class PassengerMove extends Schedule {
  private _node: PassengerNode | null = null;
  private _delay = NaN;

  constructor() {
    super(StateName.MOVE);
    this.addInstantTask(this.onStart);
    this.addTask(this.onUpdate);
    this.addInterrupt(ConditionName.OBSTACLE);
    this.addInterrupt(ConditionName.CAN_TO_SHUTTLE);
  }

  private onStart = (): void => {
    if (this._node == null) {
      this._node = this.userData as PassengerNode;
    }

    const passenger = this._node.display.passenger!;
    passenger.animationSpeed = 1;
    this._delay = AntMath.randomRangeNumber(0.75, 1.5);
    passenger.scaleX *= -1;
    passenger.switchAnimation(passenger.animWalk);
  };

  private onUpdate = (): boolean => {
    const node = this._node!;
    const wheel = node.model.wheel as AntBox2DBody;
    wheel.applyAngularVelocity(-5 * node.display.view.scaleX);
    wheel.applyTorque(-10 * node.display.view.scaleX);
    this._delay -= 2 * AntG.elapsed;
    return this._delay <= 0 && node.display.view.currentFrame == node.display.view.totalFrames;
  };
}
