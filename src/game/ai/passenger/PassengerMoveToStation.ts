// Port of ru/alientransporter/ai/passenger/PassengerMoveToStation.as

import { AntMath } from '../../../engine/utils/AntMath';
import { AntPoint } from '../../../engine/utils/AntPoint';
import type { AntBox2DBody } from '../../../physics/anthill/AntBox2DBody';
import { G } from '../../G';
import { CollisionRule } from '../../models/CollisionRule';
import type { KeyPointNode } from '../../nodes/KeyPointNode';
import type { PassengerNode } from '../../nodes/PassengerNode';
import { ConditionName } from '../ConditionName';
import { Schedule } from '../Schedule';
import { StateName } from '../StateName';

export class PassengerMoveToStation extends Schedule {
  private _node: PassengerNode | null = null;
  private _keyPointNode: KeyPointNode | null = null;
  private _point: AntPoint | null = null;
  private _outside = false;

  constructor() {
    super(StateName.MOVE_TO_STATION);
    this.addInstantTask(this.onStart);
    this.addTask(this.onMove);
    this.addInstantTask(this.onSelectNextPoint);
    this.addInstantTask(this.onEnd);
    this.addInterrupt(ConditionName.OBSTACLE);
  }

  private onStart = (): void => {
    if (this._node == null) {
      this._node = this.userData as PassengerNode;
    }

    this._outside = true;
    if (this._node.mediator.station != null) {
      this._keyPointNode = this._node.mediator.station.station.getKeyPoint();
      if (this._keyPointNode != null) {
        const passenger = this._node.display.passenger!;
        this._point = new AntPoint(this._keyPointNode.point.x, this._keyPointNode.point.y);
        passenger.switchAnimation(passenger.animWalk);
        passenger.animationSpeed = 1;
        this._outside = false;
      }
    }
  };

  private onMove = (): boolean => {
    if (this._outside) {
      return true;
    }

    const node = this._node!;
    const point = this._point!;
    const wheel = node.model.wheel as AntBox2DBody;
    wheel.applyAngularVelocity(-5 * node.display.view.scaleX);
    wheel.applyTorque(-10 * node.display.view.scaleX);
    node.display.view.scaleX = point.x < node.display.view.x ? 1 : -1;
    return AntMath.distance(node.display.view.x, node.display.view.y, point.x, point.y) < 10;
  };

  private onSelectNextPoint = (): void => {
    if (!this._outside) {
      const node = this._node!;
      G.gameState.layerBGPassengers.remove(node.display.view);
      G.gameState.layerFGPassengers.add(node.display.view);
      node.model.changeCollisionRule(CollisionRule.PASSENGER);
    }
  };

  private onEnd = (): void => {
    const node = this._node!;
    if (!this._outside) {
      node.mediator.justSpawned = false;
    }

    const passenger = node.display.passenger!;
    passenger.animationSpeed = 1;
    passenger.switchAnimation(passenger.animIdle);
  };
}
