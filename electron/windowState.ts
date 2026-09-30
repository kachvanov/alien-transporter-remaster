// Size and position of the main window. Pure helpers: unit-tested.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowState = Rect;

export const MIN_WIDTH = 800;
export const MIN_HEIGHT = 600;

/** Default content size: 80% of the work area height at 4:3, not below 800x600 and not above the work area. */
export function defaultWindowRect(workArea: Rect): Rect {
  let height = Math.round(workArea.height * 0.8);
  let width = Math.round((height * 4) / 3);
  if (width > workArea.width) {
    width = workArea.width;
    height = Math.round((width * 3) / 4);
  }
  width = Math.max(MIN_WIDTH, width);
  height = Math.max(MIN_HEIGHT, height);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

/** True when a good part of the window lies inside one of the work areas. */
export function isVisibleOnAny(r: Rect, workAreas: readonly Rect[]): boolean {
  return workAreas.some((w) => {
    const ix = Math.min(r.x + r.width, w.x + w.width) - Math.max(r.x, w.x);
    const iy = Math.min(r.y + r.height, w.y + w.height) - Math.max(r.y, w.y);
    return ix >= 100 && iy >= 50;
  });
}

/** Validates a state read from JSON; null when unusable. */
export function sanitizeWindowState(raw: unknown): WindowState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const nums = [o['x'], o['y'], o['width'], o['height']];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as [number, number, number, number];
  if (width < MIN_WIDTH || height < MIN_HEIGHT || width > 16384 || height > 16384) return null;
  return { x, y, width, height };
}
