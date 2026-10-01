// Not a port. Headless scripted run of Level01 for the tests of the passenger systems (T1.9d) and, later, the golden
// replays (T4.1): a seeded level, the systems of the game, and a scripted pilot who delivers passengers and flies
// into the portal.
//
// What is real: Level01 (assets/data/levels/level01.json through LevelCore), the systems PassengerSystem, SpawnSystem,
// TriggerSystem, PortalSystem and GoalSystem, the passengers' AI, the Box2D world.
// What is a stand-in until T1.9c/T1.9e (marked STUB below): RenderSystem and StationSystem (the doubles below do the
// part the passenger systems depend on: view = body, passengers and shuttles in the stations, the shuttle of the
// station offered to the passenger, the cargo unloaded at its destination), the flight (ShuttleSystem/ControlSystem:
// the pilot moves the shuttle body along waypoints instead of pressing keys) and the game state (the tick below
// updates the layers and the plugins in the order of Anthill.tick).

import type { AntCore } from '../../../src/engine/ants/AntCore';
import type { AntNode, AntNodeClass } from '../../../src/engine/ants/AntNode';
import type { AntNodeList } from '../../../src/engine/ants/AntNodeList';
import { AntSystem } from '../../../src/engine/ants/AntSystem';
import { AntG } from '../../../src/engine/core/AntG';
import { AntPluginManager } from '../../../src/engine/plugins/AntPluginManager';
import { AntMath } from '../../../src/engine/utils/AntMath';
import { GoalManager } from '../../../src/game/components/GoalManager';
import { GameData, MemoryGameSaveStorage } from '../../../src/game/data/GameData';
import { G } from '../../../src/game/G';
import { LevelCore } from '../../../src/game/map/LevelCore';
import { Factory } from '../../../src/game/map/Factory';
import { ArrowPointNode } from '../../../src/game/nodes/ArrowPointNode';
import { GoalManagerNode } from '../../../src/game/nodes/GoalManagerNode';
import { KeyPointNode } from '../../../src/game/nodes/KeyPointNode';
import { PassengerNode } from '../../../src/game/nodes/PassengerNode';
import { PhysicRenderNode } from '../../../src/game/nodes/PhysicRenderNode';
import { PortalNode } from '../../../src/game/nodes/PortalNode';
import { ShuttleNode } from '../../../src/game/nodes/ShuttleNode';
import { SpawnPointNode } from '../../../src/game/nodes/SpawnPointNode';
import { StationNode } from '../../../src/game/nodes/StationNode';
import { GameState } from '../../../src/game/states/GameState';
import { GoalSystem } from '../../../src/game/systems/GoalSystem';
import { MenuSystem } from '../../../src/game/systems/MenuSystem';
import { PassengerSystem } from '../../../src/game/systems/PassengerSystem';
import { PortalSystem } from '../../../src/game/systems/PortalSystem';
import { SpawnSystem } from '../../../src/game/systems/SpawnSystem';
import { TriggerSystem } from '../../../src/game/systems/TriggerSystem';
import { UISystem } from '../../../src/game/systems/UISystem';

/** STUB(T1.9c): ru/alientransporter/systems/RenderSystem.as (complete: it is this short). */
export class RenderSystemDouble extends AntSystem {
  static readonly className = 'RenderSystem';

  private _renderNodes: AntNodeList<PhysicRenderNode> | null = null;

  override addToCore(aCore: AntCore): void {
    this._renderNodes = aCore.getNodes(PhysicRenderNode);
  }

  override update(): void {
    const nodes = this._renderNodes as AntNodeList<PhysicRenderNode>;
    let i = 0;
    while (i < nodes.numNodes) {
      const node = nodes.get(i++) as PhysicRenderNode;
      node.display.view.x = node.physic.body.x;
      node.display.view.y = node.physic.body.y;
      node.display.view.angle = node.physic.body.angle;
    }
  }
}

/**
 * STUB(T1.9c): the part of ru/alientransporter/systems/StationSystem.as that the passenger systems need: the key,
 * spawn and arrow points of the stations, the passengers and the shuttles inside a station, the nearest passenger with
 * a ticket gets the landed shuttle (notifyShipArrived), the cargo is unloaded at its destination (unloadCargo: no coins,
 * no new passenger, but the goal is tracked as in the original).
 */
export class StationSystemDouble extends AntSystem {
  static readonly className = 'StationSystem';

  private _shuttleNodes!: AntNodeList<ShuttleNode>;
  private _passengerNodes!: AntNodeList<PassengerNode>;
  private _stationNodes!: AntNodeList<StationNode>;
  private _keyPointNodes!: AntNodeList<KeyPointNode>;
  private _spawnPointNodes!: AntNodeList<SpawnPointNode>;
  private _arrowPointNodes!: AntNodeList<ArrowPointNode>;
  private _core!: AntCore;

  /** The number of the cargo unloaded so far. */
  delivered = 0;

  override addToCore(aCore: AntCore): void {
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._passengerNodes = aCore.getNodes(PassengerNode);
    this._stationNodes = aCore.getNodes(StationNode);
    this._stationNodes.eventNodeAdded.add(this.onStationAdded);
    this._keyPointNodes = aCore.getNodes(KeyPointNode);
    this._keyPointNodes.eventNodeAdded.add(this.onKeyPointAdded);
    this._spawnPointNodes = aCore.getNodes(SpawnPointNode);
    this._spawnPointNodes.eventNodeAdded.add(this.onSpawnPointAdded);
    this._arrowPointNodes = aCore.getNodes(ArrowPointNode);
    this._arrowPointNodes.eventNodeAdded.add(this.onArrowPointAdded);
    this._passengerNodes.eventNodeRemoved.add(this.onPassengerRemoved);
    this._core = aCore;
  }

  override update(): void {
    let i = 0;
    while (i < this._stationNodes.numNodes) {
      const station = this._stationNodes.get(i++) as StationNode;
      this.checkForShuttles(station);
      this.checkForPassengers(station);
      this.updateStationLogic(station);
    }
  }

  private updateStationLogic(aStation: StationNode): void {
    let i = aStation.station.numShuttles - 1;
    while (i >= 0) {
      const shuttle = aStation.station.getShuttleAt(i--) as ShuttleNode;
      this.unloadCargo(shuttle, aStation);
      this.notifyShipArrived(shuttle, aStation);
    }
  }

  private unloadCargo(aShuttle: ShuttleNode, aStation: StationNode): void {
    if (aShuttle.model.isLanded && aShuttle.cargoHold.hasCargo(aStation.info.alias as string)) {
      aShuttle.cargoHold.unloadCargo(aStation.info.alias as string);
      (aShuttle.display.shuttle as unknown as { hasPassenger: boolean }).hasPassenger = false;
      const goal = this._core.getSystem(GoalSystem) as GoalSystem;
      goal.track(GoalManager.STAT_DELIVER_ANY);
      ++this.delivered;
    }
  }

  private notifyShipArrived(aShuttle: ShuttleNode, aStation: StationNode): void {
    const list: { node: PassengerNode; dist: number }[] = [];
    let i = aStation.station.numPassengers - 1;
    while (i >= 0) {
      const passenger = aStation.station.getPassengerAt(i--) as PassengerNode;
      passenger.mediator.removeShuttle(aShuttle);
      if (aShuttle.model.isLanded) {
        if (passenger.mediator.hasTicket) {
          const dist = AntMath.distance(
            aShuttle.display.view.x,
            aShuttle.display.view.y,
            passenger.display.view.x,
            passenger.display.view.y,
          );
          list.push({ node: passenger, dist });
        }
      }
    }

    if (list.length > 0) {
      list.sort((a, b) => a.dist - b.dist);
      (list[0] as { node: PassengerNode }).node.mediator.addShuttle(aShuttle);
      (list[0] as { node: PassengerNode }).node.timer.value += 10;
    }
  }

  private checkForPassengers(aStation: StationNode): void {
    let i = 0;
    while (i < this._passengerNodes.numNodes) {
      const passenger = this._passengerNodes.get(i++) as PassengerNode;
      if (aStation.station.hasPassenger(passenger)) {
        if (!aStation.station.isInside(passenger.display.view.x, passenger.display.view.y)) {
          aStation.station.removePassenger(passenger);
          if (passenger.mediator.station == aStation) {
            passenger.mediator.station = null;
          }
        }
      } else if (
        passenger.mediator.station == null &&
        aStation.station.isInside(passenger.display.view.x, passenger.display.view.y)
      ) {
        aStation.station.addPassenger(passenger);
        passenger.mediator.lowerLimit = aStation.station.left + 10;
        passenger.mediator.upperLimit = aStation.station.right - 10;
        passenger.mediator.station = aStation;
      }
    }
  }

  private checkForShuttles(aStation: StationNode): void {
    let i = 0;
    while (i < this._shuttleNodes.numNodes) {
      const shuttle = this._shuttleNodes.get(i++) as ShuttleNode;
      if (aStation.station.hasShuttle(shuttle)) {
        if (!aStation.station.isInside(shuttle.display.view.x, shuttle.display.view.y)) {
          aStation.station.removeShuttle(shuttle);
          let j = 0;
          while (j < this._passengerNodes.numNodes) {
            (this._passengerNodes.get(j++) as PassengerNode).mediator.removeShuttle(shuttle);
          }
        }
      } else if (aStation.station.isInside(shuttle.display.view.x, shuttle.display.view.y)) {
        aStation.station.addShuttle(shuttle);
      }
    }
  }

  private onPassengerRemoved = (aNode: PassengerNode): void => {
    let i = 0;
    while (i < this._stationNodes.numNodes) {
      const station = this._stationNodes.get(i++) as StationNode;
      if (station.station.hasPassenger(aNode)) {
        station.station.removePassenger(aNode);
      }
    }
  };

  private onStationAdded = (aNode: StationNode): void => {
    let i = 0;
    while (i < this._keyPointNodes.numNodes) {
      const keyPoint = this._keyPointNodes.get(i++) as KeyPointNode;
      if (aNode.station.isInside(keyPoint.point.x, keyPoint.point.y)) {
        aNode.station.addKeyPoint(keyPoint);
      }
    }

    i = 0;
    while (i < this._arrowPointNodes.numNodes) {
      const arrowPoint = this._arrowPointNodes.get(i++) as ArrowPointNode;
      if (aNode.station.isInside(arrowPoint.point.x, arrowPoint.point.y)) {
        aNode.station.addPoint(arrowPoint);
      }
    }
  };

  private onKeyPointAdded = (aNode: KeyPointNode): void => {
    const station = this.getStationInside(aNode.point.x, aNode.point.y);
    if (station != null) {
      station.station.addKeyPoint(aNode);
      let i = 0;
      while (i < this._spawnPointNodes.numNodes) {
        const spawnPoint = this._spawnPointNodes.get(i++) as SpawnPointNode;
        if (aNode.point.isInside(spawnPoint.point.x, spawnPoint.point.y)) {
          aNode.point.addSpawnPoint(spawnPoint);
        }
      }
    }
  };

  private onSpawnPointAdded = (aNode: SpawnPointNode): void => {
    let i = 0;
    while (i < this._keyPointNodes.numNodes) {
      const keyPoint = this._keyPointNodes.get(i++) as KeyPointNode;
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

  private getStationInside(aX: number, aY: number): StationNode | null {
    let i = 0;
    while (i < this._stationNodes.numNodes) {
      const station = this._stationNodes.get(i++) as StationNode;
      if (station.station.isInside(aX, aY)) {
        return station;
      }
    }

    return null;
  }
}

/**
 * A fresh seeded game: a new plugin manager (the Box2D world, core, music, tweens and tasks of the previous game are
 * gone; the order of the plugins depends on how many there are), a new save, the seed.
 */
export function resetGame(aSeed = 12345): void {
  if (G.physics != null) {
    G.physics.stop();
  }

  AntG.plugins = new AntPluginManager();
  GameData.storage = new MemoryGameSaveStorage();
  AntG.simTimeMs = 0;
  AntMath.seed(aSeed);
  G.init(new GameState());
}

/** A seeded game with Level01 loaded and the systems of the original order (the stand-ins are marked above). */
export function initLevel01(aSeed = 12345): void {
  resetGame(aSeed);
  G.core.addSystem(new RenderSystemDouble(), 0);
  G.core.addSystem(new StationSystemDouble(), 0);
  G.core.addSystem(new PassengerSystem(), 0);
  G.core.addSystem(new SpawnSystem(), 0);
  G.core.addSystem(new PortalSystem(), 0);
  G.core.addSystem(new TriggerSystem(), 0);
  G.core.addSystem(new UISystem(), 0);
  G.core.addSystem(new MenuSystem(), 0);
  G.core.addSystem(new GoalSystem(), 0);
  const level = new LevelCore(1);
  level.name = 'Level01';
  level.create();
}

/** One 35 Hz tick: the layers of the game state in the order of GameState.as (the bodies, the views), then the plugins. */
export function tick(): void {
  AntG.simTimeMs += 1000 / 35;
  AntG.elapsed = 1 / 35;
  const state = G.gameState;
  state.layerBack.update();
  state.layerBackEffects.update();
  state.layerBG.update();
  state.layerBGPassengers.update();
  state.layerHouses.update();
  state.layerIndicators.update();
  state.layerMain.update();
  state.layerPhysic.update();
  state.layerEngineEffects.update();
  state.layerShuttles.update();
  state.layerFGPassengers.update();
  state.layerFragments.update();
  state.layerMainEffects.update();
  state.layerBonuses.update();
  state.layerFG.update();
  state.layerRocks.update();
  state.layerFrontEffects.update();
  AntG.plugins.update();
}

export function nodes<T extends AntNode>(aClass: AntNodeClass<T>): AntNodeList<T> {
  return G.core.getNodes(aClass);
}

export function stationDouble(): StationSystemDouble {
  return G.core.getSystem(StationSystemDouble) as StationSystemDouble;
}

export function goalNode(): GoalManagerNode {
  return nodes(GoalManagerNode).get(0) as GoalManagerNode;
}

export function portalNode(): PortalNode {
  return nodes(PortalNode).get(0) as PortalNode;
}

export type PilotPhase = 'spawn' | 'load' | 'fly' | 'land' | 'portal' | 'done';

/**
 * The scripted pilot: puts a shuttle at the spawn of Player1, waits until a passenger boards, flies it (the body is moved
 * along waypoints) to the station of the cargo, lands there (the body is let go and falls), waits for the unloading,
 * repeats until the goal is complete and the portal is open, then flies into the portal.
 */
export class ScriptedPilot {
  phase: PilotPhase = 'spawn';
  shuttle: ShuttleNode | null = null;
  /** The tick of every delivery. */
  deliveredAt: number[] = [];
  /** The tick at which the goal opened the portal. */
  portalOpenAt = -1;
  /** The tick at which the portal took the shuttle. */
  doneAt = -1;
  private _waypoints: { x: number; y: number }[] = [];
  private _tick = 0;

  /** Call once per tick, before tick(). */
  step(): void {
    this._tick++;
    if (this.phase == 'portal' && !nodes(ShuttleNode).contains(this.shuttle as ShuttleNode)) {
      this.phase = 'done'; // PortalSystem took the shuttle
      this.doneAt = this._tick;
    }

    if (this.shuttle != null && this.phase != 'done') {
      this.stabilize();
    }

    switch (this.phase) {
      case 'spawn':
        Factory.makeShuttle(155, 304, 'Player1');
        this.shuttle = nodes(ShuttleNode).get(0) as ShuttleNode;
        this.phase = 'load';
        break;
      case 'load':
        if (this.cargoDestination() != null) {
          this.flyTo(this.stationPoint(this.cargoDestination() as string));
          this.phase = 'fly';
        }

        break;
      case 'fly':
        if (this.follow()) {
          this.phase = 'land';
        }

        break;
      case 'land':
        if (this.cargoDestination() == null) {
          this.deliveredAt.push(this._tick);
          if (portalNode().portal.isActive) {
            this.portalOpenAt = this._tick;
            this.flyTo({ x: portalNode().portal.x, y: portalNode().portal.y });
            this.phase = 'portal';
          } else {
            this.phase = 'load';
          }
        }

        break;
      case 'portal':
        if (this.follow()) {
          this.phase = 'done';
        }

        break;
      default:
        break;
    }
  }

  /** STUB(T1.9c): the attitude hold of ShuttleSystem.update() with steering = 0. */
  private stabilize(): void {
    const body = (this.shuttle as ShuttleNode).physic.body;
    if (!AntMath.equal(0, body.angle, 1)) {
      body.applyTorque(0 - body.angle);
      body.applyAngularVelocity(0);
    }
  }

  private cargoDestination(): string | null {
    const stations = nodes(StationNode);
    let i = 0;
    while (i < stations.numNodes) {
      const station = stations.get(i++) as StationNode;
      if ((this.shuttle as ShuttleNode).cargoHold.hasCargo(station.info.alias as string)) {
        return station.info.alias as string;
      }
    }

    return null;
  }

  private stationPoint(aAlias: string): { x: number; y: number } {
    const stations = nodes(StationNode);
    let i = 0;
    while (i < stations.numNodes) {
      const station = stations.get(i++) as StationNode;
      if (station.info.alias == aAlias) {
        return { x: station.station.x, y: station.station.y };
      }
    }

    throw new Error('no station ' + aAlias);
  }

  /** Up to the lane above the level, along the lane, down onto the target. */
  private flyTo(aTarget: { x: number; y: number }): void {
    const view = (this.shuttle as ShuttleNode).display.view;
    this._waypoints = [
      { x: view.x, y: 130 },
      { x: aTarget.x, y: 130 },
      { x: aTarget.x, y: aTarget.y },
    ];
  }

  /** Moves the body 6 px along the waypoints; true when the last one is reached. */
  private follow(): boolean {
    const body = (this.shuttle as ShuttleNode).physic.body;
    const target = this._waypoints[0];
    if (target == null) {
      return true;
    }

    const dx = target.x - body.x;
    const dy = target.y - body.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 6) {
      body.applyPosition(target.x, target.y);
      this._waypoints.shift();
    } else {
      body.applyPosition(body.x + (dx / dist) * 6, body.y + (dy / dist) * 6);
    }

    body.applyVelocity(0, 0);
    body.applyAwake(true);
    return this._waypoints.length == 0;
  }
}
