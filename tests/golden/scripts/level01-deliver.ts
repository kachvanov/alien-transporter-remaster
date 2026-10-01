// Not a port. Headless scripted run of Level01 for the tests of the passenger systems (T1.9d) and, later, the golden
// replays (T4.1): a seeded level, the game state with all its systems (the real RenderSystem, StationSystem, ShuttleSystem,
// ControlSystem, ..., as GameState.create adds them), and a scripted pilot who delivers passengers and flies into the portal.
//
// What is a stand-in: the flight. The pilot moves the shuttle body along waypoints instead of pressing keys (for a pilot
// that presses keys see level01-bot.ts); ShuttleSystem and the rest of the game run for real around it. Every tick is
// Anthill.tick of the original order (input, the state, the cameras, the plugins: Box2D, then the systems).

import type { AntNode, AntNodeClass } from '../../../src/engine/ants/AntNode';
import type { AntNodeList } from '../../../src/engine/ants/AntNodeList';
import { AntG } from '../../../src/engine/core/AntG';
import { emptyInputSnapshot } from '../../../src/engine/input/InputSnapshot';
import { AntMath } from '../../../src/engine/utils/AntMath';
import { GameData, MemoryGameSaveStorage } from '../../../src/game/data/GameData';
import { G } from '../../../src/game/G';
import { LevelCore } from '../../../src/game/map/LevelCore';
import { Factory } from '../../../src/game/map/Factory';
import { GoalManagerNode } from '../../../src/game/nodes/GoalManagerNode';
import { PortalNode } from '../../../src/game/nodes/PortalNode';
import { ShuttleNode } from '../../../src/game/nodes/ShuttleNode';
import { StationNode } from '../../../src/game/nodes/StationNode';
import { startGame } from '../../unit/helpers/game';

/**
 * A fresh seeded game: a new plugin manager (the Box2D world, core, music, tweens and tasks of the previous game are
 * gone; the order of the plugins depends on how many there are), a new save, the seed.
 */
export function resetGame(aSeed = 12345): void {
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(aSeed);
  startGame(); // the real GameState without its systems; stops the world of the previous game, new Anthill = new AntG
}

/**
 * A seeded game with Level01 loaded: the real GameState with the systems of GameState.as. The level is made by LevelCore
 * (not by LevelManager.loadLevel), so no shuttle is spawned: the pilot makes it.
 */
export function initLevel01(aSeed = 12345): void {
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(aSeed);
  startGame({ systems: true });
  const level = new LevelCore(1);
  level.name = 'Level01';
  level.create();
}

/** One 35 Hz tick of the game: Anthill.tick (the keys are none). */
export function tick(): void {
  (AntG.anthill as NonNullable<typeof AntG.anthill>).tick(emptyInputSnapshot());
}

export function nodes<T extends AntNode>(aClass: AntNodeClass<T>): AntNodeList<T> {
  return G.core.getNodes(aClass);
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
