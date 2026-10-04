// Not a port. Draws the ext LIGHT nodes of a Frame (docs/01-architecture.md §5, docs/03 §1): the polygon of an AntLight
// filled with a radial gradient. One Graphics per uid (pool), the order in the picture is the order of the nodes.
//
// The geometry is what AntLight.bake() left of the Sprite of the original (beginGradientFill(RADIAL, ...) + lineTo): the
// polygon in screen coordinates, the centre and the radius of the gradient (the half of the gradient box), two stops.
// The Graphics sits at the centre of the gradient and the polygon is drawn relative to it, so the gradient is the same
// for every frame while the stops do not change and is created only then (a FillGradient is a texture).

import { BlurFilter, FillGradient, Graphics } from 'pixi.js';
import type { BLEND_MODES } from 'pixi.js';
import type { LightExt } from '../frame/types';

const BLEND_NAMES: readonly BLEND_MODES[] = ['normal', 'add', 'overlay', 'screen'];

/**
 * BlurFilter(blurX, blurY, quality 2) of Flash is two passes of a box of the width `blur`, about a Gaussian of
 * sigma `0.41 * blur`; the Pixi `strength` is the sigma.
 */
export const BLUR_TO_STRENGTH = 0.41;

export interface GradientStop {
  /** 0..1 */
  offset: number;
  color: { r: number; g: number; b: number; a: number };
}

/**
 * The stops of the LIGHT ext as stops of a Pixi gradient (offset 0..1, alpha 0..1). The Flash gradient is constant
 * before its first stop and after its last one: a stop is added at 0 / 1 when the ext has none there.
 */
export function lightGradientStops(aStops: Uint8Array): GradientStop[] {
  const stops: GradientStop[] = [];
  for (let i = 0; i + 4 < aStops.length; i += 5) {
    stops.push({
      offset: (aStops[i] as number) / 255,
      color: {
        r: aStops[i + 1] as number,
        g: aStops[i + 2] as number,
        b: aStops[i + 3] as number,
        a: (aStops[i + 4] as number) / 255,
      },
    });
  }

  const first = stops[0];
  if (first !== undefined && first.offset > 0) {
    stops.unshift({ offset: 0, color: first.color });
  }

  const last = stops[stops.length - 1];
  if (last !== undefined && last.offset < 1) {
    stops.push({ offset: 1, color: last.color });
  }

  return stops;
}

/** The polygon of the LIGHT ext relative to the centre of the gradient: x0, y0, x1, y1, ... */
export function lightLocalPoints(aExt: LightExt): number[] {
  const out: number[] = [];
  const p = aExt.points;
  for (let i = 0; i + 1 < p.length; i += 2) {
    out.push((p[i] as number) - aExt.gradCenterX, (p[i + 1] as number) - aExt.gradCenterY);
  }

  return out;
}

interface LightEntry {
  graphics: Graphics;
  gradient: FillGradient | null;
  key: string;
  blurX: number;
  blurY: number;
  filter: BlurFilter | null;
}

export class LightRenderer {
  private readonly _pool = new Map<number, LightEntry>();
  private _used = new Set<number>();

  /** Starts a frame: the lights that are not `light()`ed before `end()` are released. */
  begin(): void {
    this._used = new Set<number>();
  }

  /** The Graphics of the light `uid`, drawn from the ext; add it to the scene in the order of the nodes. */
  light(aUid: number, aBlend: number, aExt: LightExt): Graphics {
    let entry = this._pool.get(aUid);
    if (entry === undefined) {
      entry = { graphics: new Graphics(), gradient: null, key: '', blurX: 0, blurY: 0, filter: null };
      this._pool.set(aUid, entry);
    }

    this._used.add(aUid);
    const g = entry.graphics;
    const stops = lightGradientStops(aExt.stops);
    const key = aExt.gradRadius + ':' + Array.prototype.join.call(aExt.stops, ',');
    if (entry.gradient === null || entry.key !== key) {
      entry.gradient?.destroy();
      entry.gradient = new FillGradient({
        type: 'radial',
        center: { x: 0, y: 0 },
        innerRadius: 0,
        outerCenter: { x: 0, y: 0 },
        outerRadius: aExt.gradRadius,
        colorStops: stops,
        textureSpace: 'global',
      });
      entry.key = key;
    }

    g.clear();
    g.position.set(aExt.gradCenterX, aExt.gradCenterY);
    const points = lightLocalPoints(aExt);
    if (points.length >= 6) {
      g.poly(points).fill(entry.gradient);
    }

    g.blendMode = BLEND_NAMES[aBlend] ?? 'normal';
    if (aExt.blurX > 0 || aExt.blurY > 0) {
      if (entry.filter === null) {
        entry.filter = new BlurFilter();
      }

      if (entry.blurX !== aExt.blurX || entry.blurY !== aExt.blurY) {
        entry.filter.strengthX = aExt.blurX * BLUR_TO_STRENGTH;
        entry.filter.strengthY = aExt.blurY * BLUR_TO_STRENGTH;
        entry.blurX = aExt.blurX;
        entry.blurY = aExt.blurY;
      }

      g.filters = [entry.filter];
    } else {
      g.filters = null;
    }

    g.visible = true;
    return g;
  }

  /** Ends the frame: the Graphics of the lights that were not drawn are hidden and forgotten. */
  end(): void {
    for (const [uid, entry] of this._pool) {
      if (!this._used.has(uid)) {
        this._pool.delete(uid);
        entry.graphics.visible = false;
        entry.graphics.destroy();
        entry.gradient?.destroy();
        entry.filter?.destroy();
      }
    }
  }

  destroy(): void {
    this._used = new Set<number>();
    this.end();
  }
}
