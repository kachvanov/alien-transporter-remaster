// Port of ru/alientransporter/ai/passenger/PassengerAction.as

import { AntG } from '../../../engine/core/AntG';
import { AntMath } from '../../../engine/utils/AntMath';
import type { PassengerNode } from '../../nodes/PassengerNode';
import { Schedule } from '../Schedule';
import { StateName } from '../StateName';

export class PassengerAction extends Schedule {
  private _node: PassengerNode | null = null;
  private _sounds: string[];

  constructor() {
    super(StateName.ACTION);
    this.addInstantTask(this.onStart);
    this.addTask(this.onUpdate);
    this._sounds = ['SndPassengerHello01', 'SndPassengerHello02', 'SndPassengerHello03'];
  }

  private onStart = (): void => {
    if (this._node == null) {
      this._node = this.userData as PassengerNode;
    }

    const node = this._node;
    const passenger = node.display.passenger!;
    passenger.animationSpeed = 1;
    passenger.switchAnimation(passenger.animAction);
    const index = AntMath.randomRangeInt(0, this._sounds.length - 1); // :int
    AntG.sounds.play(this._sounds[index]!, node.display.view);
  };

  private onUpdate = (): boolean => {
    const node = this._node!;
    return node.display.view.currentFrame == node.display.view.totalFrames - 1;
  };
}
