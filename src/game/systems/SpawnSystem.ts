// Port of ru/alientransporter/systems/SpawnSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntMath } from '../../engine/utils/AntMath';
import { Factory } from '../map/Factory';
import type { KeyPointNode } from '../nodes/KeyPointNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { SpawnManagerNode } from '../nodes/SpawnManagerNode';
import type { SpawnPointNode } from '../nodes/SpawnPointNode';
import { StationNode } from '../nodes/StationNode';

export class SpawnSystem extends AntSystem {
  static readonly className = 'SpawnSystem';

  private _spawnManagerNodes: AntNodeList<SpawnManagerNode> | null = null;
  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _stationNodes: AntNodeList<StationNode> | null = null;
  private _timeScale = NaN;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._timeScale = 2;
    this._spawnManagerNodes = aCore.getNodes(SpawnManagerNode);
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._stationNodes = aCore.getNodes(StationNode);
    this._shuttleNodes.eventNodeAdded.add(this.onShuttleNodeUpdate);
    this._shuttleNodes.eventNodeRemoved.add(this.onShuttleNodeUpdate);
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    const shuttleNodes = this._shuttleNodes as AntNodeList<ShuttleNode>;
    shuttleNodes.eventNodeAdded.remove(this.onShuttleNodeUpdate);
    shuttleNodes.eventNodeRemoved.remove(this.onShuttleNodeUpdate);
    this._spawnManagerNodes = null;
    this._shuttleNodes = null;
    this._stationNodes = null;
  }

  override update(): void {
    const spawnManagerNodes = this._spawnManagerNodes as AntNodeList<SpawnManagerNode>;
    let i = 0; // :* (an int in practice)
    while (i < spawnManagerNodes.numNodes) {
      const spawnManagerNode = spawnManagerNodes.get(i++) as SpawnManagerNode;
      spawnManagerNode.manager.currentTime -= this._timeScale * AntG.elapsed;
      if (spawnManagerNode.manager.currentTime <= 0) {
        spawnManagerNode.manager.resetTimer();
        if (spawnManagerNode.manager.availPassengers > 0) {
          if (this.spawnPassenger(spawnManagerNode.manager.stationList)) {
            --spawnManagerNode.manager.availPassengers;
          }
        }
      }
    }
  }

  private spawnPassenger(aStationList: string[] | null): boolean {
    const stationNodes = this._stationNodes as AntNodeList<StationNode>;
    let i = 0; // :* (an int in practice)
    let stationNode: StationNode | null;
    const stations: StationNode[] = [];
    while (i < stationNodes.numNodes) {
      stationNode = stationNodes.get(i++) as StationNode;
      if (
        aStationList != null &&
        aStationList.indexOf(stationNode.info.alias as string) > -1 &&
        stationNode.station.numPassengers < stationNode.station.maxPassengers &&
        !stationNode.station.isFuelStation
      ) {
        stations.push(stationNode);
      } else if (
        aStationList == null &&
        stationNode.station.numPassengers < stationNode.station.maxPassengers &&
        !stationNode.station.isFuelStation
      ) {
        stations.push(stationNode);
      }
    }

    stationNode = null;
    if (stations.length > 0) {
      stationNode = stations[AntMath.randomRangeInt(0, stations.length - 1)] as StationNode;
    }

    if (stationNode != null) {
      const spawnPointNode = (stationNode.station.getKeyPoint() as KeyPointNode).point.getSpawnPoint() as SpawnPointNode;
      Factory.makePassenger(spawnPointNode.point.x, spawnPointNode.point.y, true, true);
      return true;
    }

    return false;
  }

  /** AS3 `onShuttleNodeUpdate(param1:ShuttleNode)`; the node is not used. */
  private onShuttleNodeUpdate = (_aNode: ShuttleNode): void => {
    void _aNode;
    this._timeScale = 1 + (this._shuttleNodes as AntNodeList<ShuttleNode>).numNodes;
  };
}
