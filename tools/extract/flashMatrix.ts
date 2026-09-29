// Flash DisplayObject transform getters computed from a raw matrix [a, b, c, d, tx, ty]
// (docs/02-extraction-pipeline.md §7.2-7.3).
import type { Matrix, Rect } from './types';

export interface Transform {
  x: number;
  y: number;
  /** Degrees, range (-180, 180], y axis down, positive = clockwise. */
  rotation: number;
  scaleX: number;
  /** Negative when the matrix is a reflection (Flash Player puts the flip into scaleY). */
  scaleY: number;
}

export function decomposeMatrix(m: Matrix): Transform {
  const [a, b, c, d, tx, ty] = m;
  const scaleX = Math.sqrt(a * a + b * b);
  let scaleY = Math.sqrt(c * c + d * d);
  if (a * d - b * c < 0) scaleY = -scaleY;
  // `+ 0` folds -0 into 0 so that the JSON output is stable.
  const rotation = (Math.atan2(b, a) * 180) / Math.PI + 0;
  return { x: tx, y: ty, rotation, scaleX, scaleY };
}

/**
 * Flash `width`/`height` of a clip whose content bounds are `rect`, measured as if
 * `rotation = 0` (what Ground.makeBoxBody / makeStopper / the factories read).
 */
export function sizeFromRect(
  rect: Rect,
  scaleX: number,
  scaleY: number,
): { width: number; height: number } {
  return {
    width: (rect.xMax - rect.xMin) * Math.abs(scaleX),
    height: (rect.yMax - rect.yMin) * Math.abs(scaleY),
  };
}
