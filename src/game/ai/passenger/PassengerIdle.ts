// Port of ru/alientransporter/ai/passenger/PassengerIdle.as

import { AntG } from '../../../engine/core/AntG';
import { AntMath } from '../../../engine/utils/AntMath';
import type { PassengerNode } from '../../nodes/PassengerNode';
import { ConditionName } from '../ConditionName';
import { Schedule } from '../Schedule';
import { StateName } from '../StateName';

export class PassengerIdle extends Schedule {
  private _delay = NaN;
  private _node: PassengerNode | null = null;

  constructor() {
    super(StateName.IDLE);
    this.addInstantTask(this.onStart);
    this.addTask(this.onUpdate);
    this.addInterrupt(ConditionName.CAN_TO_SHUTTLE);
    this.addInterrupt(ConditionName.CAN_TO_HOME);
  }

  private onStart = (): void => {
    if (this._node == null) {
      this._node = this.userData as PassengerNode;
    }

    const passenger = this._node.display.passenger!;
    passenger.animationSpeed = 1;
    passenger.switchAnimation(passenger.animIdle);
    this._delay = AntMath.randomRangeNumber(1.75, 3);
  };

  private onUpdate = (): boolean => {
    const node = this._node!;
    this._delay -= 2 * AntG.elapsed;
    return this._delay <= 0 && node.display.view.currentFrame == node.display.view.totalFrames;
  };
}
