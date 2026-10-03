// Not a port. A pilot that plays Level01 by pressing keys (UP, LEFT, RIGHT), like a player: the real GameState with all its
// systems, the real shuttle physics (unlike level01-deliver.ts, whose pilot moves the body). It reads the nodes of the
// game, flies along waypoints (a climb out of the cave, a lane over the central rock, a descent), lands on the station of
// the passenger on board, waits for the unloading, and when the goal is complete flies down into the portal.
//
// Used by tests/unit/level01-playthrough.test.ts (the acceptance of T1.9e: Level01 from the spawn to the portal) and, later,
// by the golden replays (T4.1).

import type { InputSnapshot } from '../../../src/engine/input/InputSnapshot';
import { G } from '../../../src/game/G';
import { GoalManagerNode } from '../../../src/game/nodes/GoalManagerNode';
import { PortalNode } from '../../../src/game/nodes/PortalNode';
import { ShuttleNode } from '../../../src/game/nodes/ShuttleNode';
import { StationNode } from '../../../src/game/nodes/StationNode';
import { GameState } from '../../../src/game/states/GameState';

export const KEY_UP = 38;
export const KEY_LEFT = 37;
export const KEY_RIGHT = 39;

/** The initial state of the run: the game state that starts Level01 at once (`--start-level=Level01`). */
export class Level01State extends GameState {
  override create(): void {
    super.create();
    this.debugStartLevel('Level01');
  }
}

interface Waypoint {
  x: number;
  y: number;
  /** The last point of a route: the descent onto the pad (the shuttle has to be landed there). */
  land?: boolean;
}

export type BotMode = 'idle' | 'route' | 'unload';

export class Level01Bot {
  mode: BotMode = 'idle';
  /** Station alias or `portal`. */
  target = '';
  /** Tick of every delivery (the cargo is out of the shuttle). */
  deliveredAt: number[] = [];
  /** Tick at which the bot started to fly to the open portal; -1 before. */
  portalFlightAt = -1;
  /** Tick at which the shuttle was gone while it flew to the portal (the portal took it); -1 before. */
  portalTookAt = -1;
  /** Ticks the shuttle of Player1 was in the game. */
  shuttleTicks = 0;
  minHull = 1;
  minFuel = 1;
  private _route: Waypoint[] = [];
  private _tick = 0;

  /** Keys of the next tick (call it before the tick, with the number of the tick). */
  step(aTick: number): InputSnapshot {
    this._tick = aTick;
    const shuttles = G.core.getNodes(ShuttleNode);
    if (shuttles.numNodes === 0) {
      if (this.mode === 'route' && this.target === 'portal' && this.portalTookAt < 0) {
        this.portalTookAt = aTick;
      }

      this.mode = 'idle';
      return this.snap([]);
    }

    const shuttle = shuttles.get(0) as ShuttleNode;
    this.shuttleTicks++;
    this.minHull = Math.min(this.minHull, shuttle.stats.hull);
    this.minFuel = Math.min(this.minFuel, shuttle.stats.fuel);
    const body = shuttle.physic.body;
    const cargo = this.cargoDestination(shuttle);

    if (this.mode === 'idle') {
      const goal = G.core.getNodes(GoalManagerNode).get(0);
      const portal = G.core.getNodes(PortalNode).get(0);
      if (cargo != null && shuttle.model.isLanded) {
        this._route = this.makeRoute(body.x, this.stationPoint(cargo), false);
        this.target = cargo;
        this.mode = 'route';
      } else if (goal != null && goal.goal.isCompleted() && portal != null && portal.portal.isActive) {
        this._route = this.makeRoute(body.x, { x: portal.portal.x, y: portal.portal.y }, true);
        this.target = 'portal';
        this.mode = 'route';
        this.portalFlightAt = aTick;
      } else {
        return this.snap([]);
      }
    }

    if (this.mode === 'unload') {
      // delivered: the cargo is out, or another passenger (for another station) has boarded at once
      if (cargo == null || cargo !== this.target) {
        this.deliveredAt.push(aTick);
        this.mode = 'idle';
      }

      return this.snap([]);
    }

    const point = this._route[0] as Waypoint;
    const dx = point.x - body.x;
    const dy = point.y - body.y;
    let wantVx = Math.max(-4, Math.min(4, dx * 0.07));
    let wantVy = Math.max(-3.5, Math.min(2.5, dy * 0.06));
    if (point.land === true) {
      wantVx = Math.max(-1.5, Math.min(1.5, dx * 0.1));
      wantVy = Math.min(1.5, Math.max(0.5, dy * 0.05 + 0.5));
    }

    const keys: number[] = [];
    if (body.velocity.x < wantVx - 0.25) keys.push(KEY_RIGHT);
    else if (body.velocity.x > wantVx + 0.25) keys.push(KEY_LEFT);
    if (body.velocity.y > wantVy) keys.push(KEY_UP);

    const reached = point.land === true ? shuttle.model.isLanded && Math.abs(dx) < 25 : Math.abs(dx) < 25 && Math.abs(dy) < 25;
    if (reached) {
      this._route.shift();
      if (this._route.length === 0) {
        this.mode = this.target === 'portal' ? 'idle' : 'unload';
      }
    }

    return this.snap(keys);
  }

  private snap(aKeys: number[]): InputSnapshot {
    return { keysDown: aKeys, mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
  }

  private stationPoint(aAlias: string): Waypoint {
    const stations = G.core.getNodes(StationNode);
    for (let i = 0; i < stations.numNodes; i++) {
      const station = stations.get(i) as StationNode;
      if (station.info.alias == aAlias) {
        return { x: station.station.x, y: station.station.y };
      }
    }

    throw new Error('no station ' + aAlias + ' at tick ' + this._tick);
  }

  private cargoDestination(aShuttle: ShuttleNode): string | null {
    const stations = G.core.getNodes(StationNode);
    for (let i = 0; i < stations.numNodes; i++) {
      const station = stations.get(i) as StationNode;
      if (aShuttle.cargoHold.hasCargo(station.info.alias as string)) {
        return station.info.alias as string;
      }
    }

    return null;
  }

  /** Out of the cave, over the central rock (or back), then straight down onto the pad (or into the portal). */
  private makeRoute(aFromX: number, aTo: Waypoint, aPortal: boolean): Waypoint[] {
    const route: Waypoint[] = [{ x: aFromX, y: 215 }];
    const fromLeft = aFromX < 380;
    if (aTo.x > 380 && fromLeft) {
      route.push({ x: 300, y: 170 }, { x: 470, y: 150 });
    } else if (aTo.x <= 380 && !fromLeft) {
      route.push({ x: 470, y: 150 }, { x: 300, y: 170 });
    }

    if (aPortal) {
      route.push({ x: aTo.x, y: 200 });
    } else {
      route.push({ x: aTo.x, y: aTo.y - 70 });
    }

    route.push({ x: aTo.x, y: aTo.y + 25, land: true });
    return route;
  }
}
