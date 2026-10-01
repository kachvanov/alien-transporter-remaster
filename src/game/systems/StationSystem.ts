// Port of ru/alientransporter/systems/StationSystem.as
//
// getTimer() is AntG.simTimeMs (docs/04-porting-guide.md section 3). The method closures that the original passes
// to signals and to AntTaskManager are arrow properties (section 3).

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { sortOnAS3, NUMERIC } from '../../engine/utils/as3array';
import { AntMath } from '../../engine/utils/AntMath';
import type { AntPoint } from '../../engine/utils/AntPoint';
import { Display } from '../components/Display';
import { GoalManager } from '../components/GoalManager';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { ArrowPointNode } from '../nodes/ArrowPointNode';
import { CoinPointNode } from '../nodes/CoinPointNode';
import { FlyingLabelNode } from '../nodes/FlyingLabelNode';
import { KeyPointNode } from '../nodes/KeyPointNode';
import { PassengerNode } from '../nodes/PassengerNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { SpawnPointNode } from '../nodes/SpawnPointNode';
import { StationNode } from '../nodes/StationNode';
import { PassengerView } from '../views/PassengerView'; // STUB(T1.9d)
import { GoalSystem } from './GoalSystem'; // STUB(T1.9d)

export class StationSystem extends AntSystem {
  static readonly className = 'StationSystem';

  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _passangerNodes: AntNodeList<PassengerNode> | null = null;
  private _stationNodes: AntNodeList<StationNode> | null = null;
  private _keyPointNodes: AntNodeList<KeyPointNode> | null = null;
  private _spawnPointNodes: AntNodeList<SpawnPointNode> | null = null;
  private _arrowPointNodes: AntNodeList<ArrowPointNode> | null = null;
  private _coinPointNodes: AntNodeList<CoinPointNode> | null = null;
  private _flyingLabelNodes: AntNodeList<FlyingLabelNode> | null = null;
  private _core: AntCore | null = null;
  private _cashInterval: number; // uint

  constructor() {
    super();
    this._cashInterval = 0;
  }

  override addToCore(aCore: AntCore): void {
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._shuttleNodes.eventNodeRemoved.add(this.onShuttleRemoved);
    this._passangerNodes = aCore.getNodes(PassengerNode);
    this._passangerNodes.eventNodeRemoved.add(this.onPassengerRemoved);
    this._stationNodes = aCore.getNodes(StationNode);
    this._stationNodes.eventNodeAdded.add(this.onStationAdded);
    this._keyPointNodes = aCore.getNodes(KeyPointNode);
    this._keyPointNodes.eventNodeAdded.add(this.onKeyPointAdded);
    this._spawnPointNodes = aCore.getNodes(SpawnPointNode);
    this._spawnPointNodes.eventNodeAdded.add(this.onSpawnPointAdded);
    this._arrowPointNodes = aCore.getNodes(ArrowPointNode);
    this._arrowPointNodes.eventNodeAdded.add(this.onArrowPointAdded);
    this._coinPointNodes = aCore.getNodes(CoinPointNode);
    this._coinPointNodes.eventNodeAdded.add(this.onCoinPointAdded);
    this._flyingLabelNodes = aCore.getNodes(FlyingLabelNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._shuttleNodes = null;
    this._passangerNodes = null;
    (this._keyPointNodes as AntNodeList<KeyPointNode>).eventNodeAdded.remove(this.onKeyPointAdded);
    this._keyPointNodes = null;
    (this._spawnPointNodes as AntNodeList<SpawnPointNode>).eventNodeAdded.remove(this.onSpawnPointAdded);
    this._spawnPointNodes = null;
    (this._stationNodes as AntNodeList<StationNode>).eventNodeAdded.remove(this.onStationAdded);
    this._stationNodes = null;
    (this._arrowPointNodes as AntNodeList<ArrowPointNode>).eventNodeAdded.remove(this.onArrowPointAdded);
    this._arrowPointNodes = null;
    (this._coinPointNodes as AntNodeList<CoinPointNode>).eventNodeAdded.remove(this.onCoinPointAdded);
    this._coinPointNodes = null;
    this._flyingLabelNodes = null;
    this._core = null;
  }

  override update(): void {
    const stationNodes = this._stationNodes as AntNodeList<StationNode>;
    let i = 0; // :int
    while (i < stationNodes.numNodes) {
      const node = stationNodes.get(i++) as StationNode;
      this.checkForShuttles(node);
      this.checkForPassengers(node);
      this.updateStationLogic(node);
    }
  }

  private updateStationLogic(aStation: StationNode): void {
    let i = (aStation.station.numShuttles - 1) | 0; // :int
    while (i >= 0) {
      const shuttle = aStation.station.getShuttleAt(i--) as ShuttleNode;
      this.unloadCargo(shuttle, aStation);
      this.refillShuttle(shuttle, aStation);
      this.notifyShipArrived(shuttle, aStation);
    }
  }

  private unloadCargo(aShuttle: ShuttleNode, aStation: StationNode): void {
    if (aShuttle.model.isLanded && aShuttle.cargoHold.hasCargo(aStation.info.alias as string)) {
      this.giveCoins(aStation, 3);
      const sounds = ['SndSpawnCoin01', 'SndSpawnCoin02', 'SndSpawnCoin03'];
      AntG.sounds.play(sounds[AntMath.randomRangeInt(0, sounds.length - 1)] as string, aShuttle.display.view);
      const passengerObject = Factory.makePassenger(aShuttle.display.view.x, aShuttle.display.view.y, false);
      const display = passengerObject.get(Display) as Display;
      const passenger = display.passenger as PassengerView;
      passenger.passengerColor = (aShuttle.display.shuttle as NonNullable<Display['shuttle']>).passengerColor;
      passenger.passengerKind = (aShuttle.display.shuttle as NonNullable<Display['shuttle']>).passengerKind;
      if (AntMath.randomRangeNumber(0, 1) > 0.5) {
        passenger.showNotify(PassengerView.LOVE);
      }

      AntEffectManager.makeEffect(aShuttle.display.view.x, aShuttle.display.view.y, 'PassengerOut_eff', G.gameState.layerMainEffects);
      AntG.sounds.play('SndPassengerComeOut', aShuttle.display.view);
      aShuttle.cargoHold.unloadCargo(aStation.info.alias as string);
      (aShuttle.display.shuttle as NonNullable<Display['shuttle']>).hasPassenger = false;
      const goalSystem = (this._core as AntCore).getSystem(GoalSystem) as GoalSystem;
      goalSystem.track(GoalManager.STAT_DELIVER_ANY);
      G.missions.track('numPassengers');
      switch ((aShuttle.display.shuttle as NonNullable<Display['shuttle']>).passengerColor) {
        case PassengerView.COLOR_GREEN:
          goalSystem.track(GoalManager.STAT_DELIVER_GREEN);
          break;
        case PassengerView.COLOR_BLUE:
          goalSystem.track(GoalManager.STAT_DELIVER_BLUE);
          break;
        case PassengerView.COLOR_ORANGE:
          goalSystem.track(GoalManager.STAT_DELIVER_YELLOW);
          break;
        case PassengerView.COLOR_PINK:
          goalSystem.track(GoalManager.STAT_DELIVER_RED);
      }
    }
  }

  private refillShuttle(aShuttle: ShuttleNode, aStation: StationNode): void {
    if (
      aStation.station.isFuelStation &&
      aShuttle.model.isLanded &&
      aShuttle.stats.fuel < aShuttle.stats.maxFuel &&
      aShuttle.stats.coins > 0
    ) {
      aShuttle.stats.fuel += 0.1 * AntG.elapsed;
      aShuttle.stats.isRefilling = true;
      const time = (AntG.simTimeMs | 0) >>> 0; // :uint = uint(getTimer())
      if (time - this._cashInterval > 150) {
        aShuttle.stats.takeCoins();
        G.missions.track('numSpendCoins', 1);
        this.makeLabel(aShuttle, aShuttle.display.view.x, aShuttle.display.view.y, -1);
        this._cashInterval = time;
      }

      if (!AntG.sounds.isPlaying('SndFuelRefill', aShuttle.display.view)) {
        AntG.sounds.play('SndFuelRefill', aShuttle.display.view, false, 999);
      }
    } else if (aShuttle.stats.isRefilling) {
      aShuttle.stats.isRefilling = false;
      if (AntG.sounds.isPlaying('SndFuelRefill', aShuttle.display.view)) {
        AntG.sounds.stop('SndFuelRefill', aShuttle.display.view);
      }
    }
  }

  private notifyShipArrived(aShuttle: ShuttleNode, aStation: StationNode): void {
    let dist: number; // :int
    const list: { node: PassengerNode; dist: number }[] = [];
    let i = (aStation.station.numPassengers - 1) | 0; // :int
    while (i >= 0) {
      const passenger = aStation.station.getPassengerAt(i--) as PassengerNode;
      passenger.mediator.removeShuttle(aShuttle);
      if (aShuttle.model.isLanded) {
        if (passenger.mediator.hasTicket) {
          dist = AntMath.distance(aShuttle.display.view.x, aShuttle.display.view.y, passenger.display.view.x, passenger.display.view.y) | 0;
          list.push({ node: passenger, dist: dist });
        }
      }
    }

    if (list.length > 0) {
      sortOnAS3(list, 'dist', NUMERIC);
      (list[0] as { node: PassengerNode }).node.mediator.addShuttle(aShuttle);
      (list[0] as { node: PassengerNode }).node.timer.value += 10;
    }
  }

  private makeLabel(aShuttle: ShuttleNode, aX: number, aY: number, aValue: number): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    aValue = aValue | 0; // :int
    const flyingLabelNodes = this._flyingLabelNodes as AntNodeList<FlyingLabelNode>;
    let i = 0; // :int
    while (i < flyingLabelNodes.numNodes) {
      const node = flyingLabelNodes.get(i++) as FlyingLabelNode;
      if (AntMath.distance(aShuttle.display.view.x, aShuttle.display.view.y, node.flyingLabel.x, node.flyingLabel.y) < 30) {
        node.flyingLabel.value = node.flyingLabel.value > 0 ? 0 : node.flyingLabel.value;
        node.flyingLabel.updateValue(aX, aY, aValue, false);
        return;
      }
    }

    Factory.makeFlyingLabel(aX, aY, aValue);
  }

  private giveCoins(aStation: StationNode, aCount: number): void {
    aCount = aCount | 0; // :int
    const points = aStation.station.getRandomPoints(aCount);
    let i = 0; // :int
    const n = points.length | 0; // :int
    const tm = new AntTaskManager();
    while (i < n) {
      const point = points[i++] as AntPoint;
      tm.addInstantTask(this.spawnCoin, [point.x, point.y]);
      tm.addPause(0.1);
    }
  }

  private spawnCoin = (aX: number, aY: number): void => {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    Factory.makeCoin(aX, aY);
    AntEffectManager.makeEffect(aX, aY, 'CoinCollect_eff', G.gameState.layerMainEffects);
  };

  private checkForPassengers(aStation: StationNode): void {
    const passangerNodes = this._passangerNodes as AntNodeList<PassengerNode>;
    let i = 0; // :int
    while (i < passangerNodes.numNodes) {
      const passenger = passangerNodes.get(i++) as PassengerNode;
      if (aStation.station.hasPassenger(passenger)) {
        if (!aStation.station.isInside(passenger.display.view.x, passenger.display.view.y)) {
          aStation.station.removePassenger(passenger);
          if (passenger.mediator.station == aStation) {
            passenger.mediator.station = null;
          }
        }
      } else if (passenger.mediator.station == null && aStation.station.isInside(passenger.display.view.x, passenger.display.view.y)) {
        aStation.station.addPassenger(passenger);
        passenger.mediator.lowerLimit = aStation.station.left + 10;
        passenger.mediator.upperLimit = aStation.station.right - 10;
        passenger.mediator.station = aStation;
      }
    }
  }

  private checkForShuttles(aStation: StationNode): void {
    const shuttleNodes = this._shuttleNodes as AntNodeList<ShuttleNode>;
    let i = 0; // :int
    while (i < shuttleNodes.numNodes) {
      const shuttle = shuttleNodes.get(i++) as ShuttleNode;
      if (aStation.station.hasShuttle(shuttle)) {
        if (!aStation.station.isInside(shuttle.display.view.x, shuttle.display.view.y)) {
          aStation.station.removeShuttle(shuttle);
          this.notifyShipDeparted(shuttle);
          this.stopShuttleRefill(shuttle);
        }
      } else if (aStation.station.isInside(shuttle.display.view.x, shuttle.display.view.y)) {
        aStation.station.addShuttle(shuttle);
      }
    }
  }

  private notifyShipDeparted(aShuttle: ShuttleNode): void {
    const passangerNodes = this._passangerNodes as AntNodeList<PassengerNode>;
    let i = 0; // :int
    while (i < passangerNodes.numNodes) {
      const passenger = passangerNodes.get(i++) as PassengerNode;
      passenger.mediator.removeShuttle(aShuttle);
    }
  }

  private stopShuttleRefill(aShuttle: ShuttleNode): void {
    if (aShuttle.stats.isRefilling) {
      aShuttle.stats.isRefilling = false;
      if (AntG.sounds.isPlaying('SndFuelRefill', aShuttle.display.view)) {
        AntG.sounds.stop('SndFuelRefill', aShuttle.display.view);
      }
    }
  }

  private onShuttleRemoved = (aNode: ShuttleNode): void => {
    this.stopShuttleRefill(aNode);
    const stationNodes = this._stationNodes as AntNodeList<StationNode>;
    let i = 0; // :int
    while (i < stationNodes.numNodes) {
      const station = stationNodes.get(i++) as StationNode;
      if (station.station.hasShuttle(aNode)) {
        station.station.removeShuttle(aNode);
      }
    }
  };

  private onPassengerRemoved = (aNode: PassengerNode): void => {
    const stationNodes = this._stationNodes as AntNodeList<StationNode>;
    let i = 0; // :int
    while (i < stationNodes.numNodes) {
      const station = stationNodes.get(i++) as StationNode;
      if (station.station.hasPassenger(aNode)) {
        station.station.removePassenger(aNode);
      }
    }
  };

  private onStationAdded = (aNode: StationNode): void => {
    const keyPointNodes = this._keyPointNodes as AntNodeList<KeyPointNode>;
    let i = 0; // :int
    while (i < keyPointNodes.numNodes) {
      const keyPoint = keyPointNodes.get(i++) as KeyPointNode;
      if (aNode.station.isInside(keyPoint.point.x, keyPoint.point.y)) {
        aNode.station.addKeyPoint(keyPoint);
      }
    }

    const arrowPointNodes = this._arrowPointNodes as AntNodeList<ArrowPointNode>;
    i = 0;
    while (i < arrowPointNodes.numNodes) {
      const arrowPoint = arrowPointNodes.get(i++) as ArrowPointNode;
      if (aNode.station.isInside(arrowPoint.point.x, arrowPoint.point.y)) {
        aNode.station.addPoint(arrowPoint);
      }
    }

    const coinPointNodes = this._coinPointNodes as AntNodeList<CoinPointNode>;
    i = 0;
    while (i < coinPointNodes.numNodes) {
      const coinPoint = coinPointNodes.get(i++) as CoinPointNode;
      if (aNode.station.isInside(coinPoint.point.x, coinPoint.point.y)) {
        aNode.station.addCoinPoint(coinPoint);
      }
    }
  };

  private onKeyPointAdded = (aNode: KeyPointNode): void => {
    const station = this.getStationInside(aNode.point.x, aNode.point.y);
    if (station != null) {
      station.station.addKeyPoint(aNode);
      const spawnPointNodes = this._spawnPointNodes as AntNodeList<SpawnPointNode>;
      let i = 0; // :int
      while (i < spawnPointNodes.numNodes) {
        const spawnPoint = spawnPointNodes.get(i++) as SpawnPointNode;
        if (aNode.point.isInside(spawnPoint.point.x, spawnPoint.point.y)) {
          aNode.point.addSpawnPoint(spawnPoint);
        }
      }
    }
  };

  private onSpawnPointAdded = (aNode: SpawnPointNode): void => {
    const keyPointNodes = this._keyPointNodes as AntNodeList<KeyPointNode>;
    let i = 0; // :int
    while (i < keyPointNodes.numNodes) {
      const keyPoint = keyPointNodes.get(i++) as KeyPointNode;
      if (keyPoint.point.isInside(aNode.point.x, aNode.point.y)) {
        keyPoint.point.addSpawnPoint(aNode);
      }
    }
  };

  private onArrowPointAdded = (aNode: ArrowPointNode): void => {
    const station = this.getStationInside(aNode.point.x, aNode.point.y);
    if (station != null) {
      station.station.addPoint(aNode);
    }
  };

  private onCoinPointAdded = (aNode: CoinPointNode): void => {
    const station = this.getStationInside(aNode.point.x, aNode.point.y);
    if (station != null) {
      station.station.addCoinPoint(aNode);
    }
  };

  private getStationInside(aX: number, aY: number): StationNode | null {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const stationNodes = this._stationNodes as AntNodeList<StationNode>;
    let i = 0; // :int
    while (i < stationNodes.numNodes) {
      const station = stationNodes.get(i++) as StationNode;
      if (station.station.isInside(aX, aY)) {
        return station;
      }
    }

    return null;
  }
}
