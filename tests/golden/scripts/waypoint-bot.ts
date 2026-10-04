// Not a port. A pilot that flies the shuttle of Player1 through a list of waypoints by pressing the keys (UP, LEFT, RIGHT), with
// the velocity controller of level01-bot.ts, and hovers at the last one. The scenario replays of T4.1 (level11-barrels,
// level13-sensor) are recorded from it: the bot reads the game (`golden:record`), the replay that is saved holds only the keys.

import { G } from '../../../src/game/G';
import { ShuttleNode } from '../../../src/game/nodes/ShuttleNode';
import { KEY_LEFT, KEY_RIGHT, KEY_UP } from './idle-then-gas';

export interface WaypointStop {
  x: number;
  y: number;
  /** Stay at the point until this tick (the next point comes after it); default: go on as soon as it is reached. */
  until?: number;
  /** The distance (px) at which the point counts as reached; default 25. */
  radius?: number;
}

export class WaypointBot {
  /** Index of the waypoint that is flown to. */
  index = 0;
  private readonly _route: readonly WaypointStop[];

  constructor(aRoute: readonly WaypointStop[]) {
    this._route = aRoute;
  }

  /** The keys of the tick (call it before the tick). */
  step(aTick: number): number[] {
    const shuttles = G.core.getNodes(ShuttleNode);
    if (shuttles.numNodes === 0 || this._route.length === 0) {
      return [];
    }

    const body = (shuttles.get(0) as ShuttleNode).physic.body;
    const point = this._route[Math.min(this.index, this._route.length - 1)] as WaypointStop;
    const dx = point.x - body.x;
    const dy = point.y - body.y;
    const wantVx = Math.max(-4, Math.min(4, dx * 0.07));
    const wantVy = Math.max(-3.5, Math.min(2.5, dy * 0.06));
    const keys: number[] = [];
    if (body.velocity.x < wantVx - 0.25) keys.push(KEY_RIGHT);
    else if (body.velocity.x > wantVx + 0.25) keys.push(KEY_LEFT);
    if (body.velocity.y > wantVy) keys.push(KEY_UP);

    const radius = point.radius ?? 25;
    const reached = Math.abs(dx) < radius && Math.abs(dy) < radius;
    if (reached && this.index < this._route.length - 1 && (point.until === undefined || aTick >= point.until)) {
      this.index++;
    }

    return keys;
  }
}
