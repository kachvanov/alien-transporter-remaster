// Port of ru/alientransporter/systems/PassengerSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import type { AntObject } from '../../engine/ants/AntObject';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntMath } from '../../engine/utils/AntMath';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { ArrowPointNode } from '../nodes/ArrowPointNode';
import { PassengerNode } from '../nodes/PassengerNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { StationNode } from '../nodes/StationNode';
import { PassengerView } from '../views/PassengerView';

/**
 * The members of ShuttleView that this system sets. DEVIATION (merge order with T1.9c): ShuttleView.ts is still the
 * stub of T1.9c here, which has none of them; the cast keeps this file independent of it and may be dropped when the
 * real ShuttleView is merged.
 */
interface ShuttleViewCargo {
  passengerColor: string | null;
  passengerKind: number; // int
  hasPassenger: boolean;
}

export class PassengerSystem extends AntSystem {
  static readonly className = 'PassengerSystem';

  private _aiNodes: AntNodeList<PassengerNode> | null = null;
  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _stationNodes: AntNodeList<StationNode> | null = null;
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._aiNodes = aCore.getNodes(PassengerNode);
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._shuttleNodes.eventNodeRemoved.add(this.onShuttleRemoved);
    this._stationNodes = aCore.getNodes(StationNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    (this._shuttleNodes as AntNodeList<ShuttleNode>).eventNodeRemoved.remove(this.onShuttleRemoved);
    this._shuttleNodes = null;
    this._stationNodes = null;
    this._aiNodes = null;
    this._core = null;
  }

  override update(): void {
    const aiNodes = this._aiNodes as AntNodeList<PassengerNode>;
    let i = 0; // :* (an int in practice)
    while (i < aiNodes.numNodes) {
      const passengerNode = aiNodes.get(i++) as PassengerNode;
      passengerNode.behavior.update(passengerNode);
      if (passengerNode.model.isDead) {
        passengerNode.model.createRagdoll(
          passengerNode.display.view.x,
          passengerNode.display.view.y,
          passengerNode.display.view.scaleX,
        );
        (this._core as AntCore).removeObject(passengerNode.object as AntObject);
      } else if (passengerNode.mediator.isGone) {
        (this._core as AntCore).removeObject(passengerNode.object as AntObject);
      } else if (
        passengerNode.mediator.hasTicket &&
        passengerNode.mediator.hasAvailShuttles &&
        AntMath.distance(
          passengerNode.display.view.x,
          passengerNode.display.view.y,
          (passengerNode.mediator.getShuttle() as ShuttleNode).display.view.x,
          (passengerNode.mediator.getShuttle() as ShuttleNode).display.view.y,
        ) < 20
      ) {
        const shuttleNode = passengerNode.mediator.getShuttle() as ShuttleNode;
        const stationNode = this.selectStation(passengerNode);
        const arrowPointNode = stationNode.station.getPointAt(shuttleNode.stats.playerId) as ArrowPointNode;
        const indicator = Factory.makeIndicator(arrowPointNode.point.x, arrowPointNode.point.y, shuttleNode.stats.playerName);
        shuttleNode.cargoHold.loadCargo(passengerNode.info.id, stationNode.info.alias as string, indicator);
        const shuttleView = shuttleNode.display.shuttle as unknown as ShuttleViewCargo;
        shuttleView.passengerColor = (passengerNode.display.passenger as PassengerView).passengerColor;
        shuttleView.passengerKind = (passengerNode.display.passenger as PassengerView).passengerKind;
        shuttleView.hasPassenger = true;
        AntG.sounds.play('SndPassengerComeIn', shuttleNode.display.view);
        AntG.sounds.play('SndLoadPassenger', shuttleNode.display.view);
        AntEffectManager.makeEffect(
          passengerNode.display.view.x,
          passengerNode.display.view.y,
          'PassengerIn_eff',
          G.gameState.layerMainEffects,
        );
        (this._core as AntCore).removeObject(passengerNode.object as AntObject);
        break;
      }

      if (!passengerNode.timer.isOut && passengerNode.mediator.station != null) {
        passengerNode.timer.value -= 2 * AntG.elapsed;
        if (passengerNode.timer.value < 0) {
          passengerNode.mediator.hasTicket = false;
          (passengerNode.display.view as PassengerView).showNotify(PassengerView.FAIL);
          passengerNode.timer.isOut = true;
        }
      }
    }
  }

  private selectStation(aNode: PassengerNode): StationNode {
    const stationNodes = this._stationNodes as AntNodeList<StationNode>;
    let i = 0; // :int
    const stations: StationNode[] = [];
    const sourceStation = (aNode.mediator.station as StationNode).station;
    if (sourceStation.stationList != null) {
      while (i < stationNodes.numNodes) {
        const stationNode = stationNodes.get(i++) as StationNode;
        if (sourceStation.stationList.indexOf(stationNode.info.alias as string) > -1) {
          stations.push(stationNode);
        }
      }
    } else {
      while (i < stationNodes.numNodes) {
        const stationNode = stationNodes.get(i++) as StationNode;
        if (aNode.mediator.station != stationNode && !stationNode.station.isFuelStation) {
          stations.push(stationNode);
        }
      }
    }

    i = AntMath.randomRangeInt(0, stations.length - 1);
    return stations[i] as StationNode;
  }

  private onShuttleRemoved = (aNode: ShuttleNode): void => {
    const aiNodes = this._aiNodes as AntNodeList<PassengerNode>;
    let i = 0;
    while (i < aiNodes.numNodes) {
      const passengerNode = aiNodes.get(i++) as PassengerNode;
      passengerNode.mediator.removeShuttle(aNode);
    }
  };
}
