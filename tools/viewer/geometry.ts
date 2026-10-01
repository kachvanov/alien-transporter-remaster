// Dev Asset Viewer (T0.8): overlay geometry and colors of level objects. Pure, no DOM.
// Colors follow the T0.7 overlay (tools/extract/levels.ts): red ground, magenta stoppers,
// yellow zones, blue points; the rest (not drawn by T0.7) gets own colors.
import type { LevelObject } from '../../src/engine/assets/schemas';

export type Category = 'ground' | 'stopper' | 'zone' | 'point' | 'object' | 'logic';

export const CATEGORIES: readonly Category[] = ['ground', 'stopper', 'zone', 'point', 'object', 'logic'];

export const CATEGORY_COLOR: Record<Category, number> = {
  ground: 0xff0000,
  stopper: 0xff00ff,
  zone: 0xffee00,
  point: 0x0060ff,
  object: 0x00d8c0,
  logic: 0xb0b0b0,
};

const ZONE = new Set(['Station_com', 'Trigger_com', 'Sensor_com', 'ExitPortal_com']);
const POINT = new Set(['ShuttleSpawn_com', 'CoinPoint_mc', 'SpawnPoint_mc', 'KeyPoint_mc']);
const OBJECT =
  /^(Rock0\d_com|BarrelExp_com|Barrel_com|BoxBig_com|BoxSmall_com|Coin_mc|Fuel_mc|Trophy_mc|Passenger_com|Shuttle01PassGreen_mc|HouseFront01_mc|MissilePoint_com)$/;

export function categoryOf(cls: string): Category {
  if (cls === 'GroundBox_com' || cls === 'GroundCircle_com') return 'ground';
  if (cls === 'Stopper_com') return 'stopper';
  if (ZONE.has(cls)) return 'zone';
  if (POINT.has(cls)) return 'point';
  if (OBJECT.test(cls)) return 'object';
  return 'logic';
}

export type OverlayShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rotation: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'point'; x: number; y: number; r: number };

/** Radius (px) of the marker drawn for point-like objects. */
export const POINT_RADIUS = 3.5;

/** How the object is drawn (and hit-tested), in level coordinates. */
export function shapeOf(o: LevelObject): OverlayShape {
  const cat = categoryOf(o.cls);
  if (o.cls === 'GroundCircle_com') return { kind: 'circle', x: o.x, y: o.y, r: o.width / 2 };
  if (cat === 'point' || cat === 'logic') return { kind: 'point', x: o.x, y: o.y, r: POINT_RADIUS };
  return { kind: 'rect', x: o.x, y: o.y, w: o.width, h: o.height, rotation: o.rotation };
}

/** Hit radius floor: tiny shapes stay hoverable. */
const MIN_HIT = 5;

export function shapeContains(s: OverlayShape, px: number, py: number): boolean {
  const dx = px - s.x;
  const dy = py - s.y;
  if (s.kind === 'rect') {
    const a = (-s.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= Math.max(s.w / 2, MIN_HIT) && Math.abs(ly) <= Math.max(s.h / 2, MIN_HIT);
  }
  const r = Math.max(s.r, s.kind === 'point' ? MIN_HIT + 1 : MIN_HIT);
  return dx * dx + dy * dy <= r * r;
}

function areaOf(s: OverlayShape): number {
  if (s.kind === 'rect') return s.w * s.h;
  if (s.kind === 'circle') return Math.PI * s.r * s.r;
  return 0;
}

/** Objects under the point, smallest shape first (so a point wins over the ground box beneath it). */
export function hitTest(
  objects: readonly LevelObject[],
  px: number,
  py: number,
  enabled: (cls: string) => boolean,
): LevelObject[] {
  const hits: { o: LevelObject; area: number; order: number }[] = [];
  objects.forEach((o, order) => {
    if (!enabled(o.cls)) return;
    const s = shapeOf(o);
    if (shapeContains(s, px, py)) hits.push({ o, area: areaOf(s), order });
  });
  hits.sort((a, b) => a.area - b.area || b.order - a.order);
  return hits.map((h) => h.o);
}

/** Union of frame boxes relative to the registration point: `[minX, minY, maxX, maxY]` in 1x pixels. */
export function unionBox(
  frames: readonly { size1x: readonly [number, number]; origin1x: readonly [number, number] }[],
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    minX = Math.min(minX, -f.origin1x[0]);
    minY = Math.min(minY, -f.origin1x[1]);
    maxX = Math.max(maxX, f.size1x[0] - f.origin1x[0]);
    maxY = Math.max(maxY, f.size1x[1] - f.origin1x[1]);
  }
  return [minX, minY, maxX, maxY];
}
