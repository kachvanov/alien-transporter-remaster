// Not a port. Pure math of the atlas loader: tier choice and the geometry of a frame (docs/01-architecture.md §5).

import type { Frame, Manifest, TierName } from '../engine/assets/schemas';
import { TIER_NAMES, TIER_ZOOM } from '../engine/assets/schemas';

/** Groups that are loaded at start; `level-NN` follows the `levelGroup` of the Frame header. */
export const STARTUP_GROUPS = ['ui', 'game-common', 'shuttles', 'passengers', 'effects'] as const;

/** Physical pixels of the window height from which the 3x tier is used. */
export const TIER_3X_MIN_PIXELS = 1500;

export interface TierChoice {
  /** `--tier=` flag, null = automatic. */
  override: TierName | null;
  innerHeight: number;
  devicePixelRatio: number;
  /** Tiers that the manifest has atlases for. */
  available: readonly TierName[];
}

/** Tiers that have atlases in the manifest. */
export function availableTiers(manifest: Pick<Manifest, 'atlases'>): TierName[] {
  return TIER_NAMES.filter((t) => Object.keys(manifest.atlases[t]).length > 0);
}

/**
 * The flag wins (if the tier exists); automatic: 3x when the window is at least 1500 physical pixels high and the
 * manifest has 3x, otherwise 2x, otherwise the best that exists.
 */
export function selectTier(c: TierChoice): TierName {
  const has = (t: TierName): boolean => c.available.includes(t);
  if (c.override !== null && has(c.override)) return c.override;
  if (c.innerHeight * c.devicePixelRatio >= TIER_3X_MIN_PIXELS && has('3x')) return '3x';
  if (has('2x')) return '2x';
  if (has('1x')) return '1x';
  return has('3x') ? '3x' : '2x';
}

export interface FrameGeometry {
  /** Atlas page key (`<group>-<n>`) of the frame in the tier. */
  atlas: string;
  /** Rectangle in the atlas page, raster pixels: x, y, w, h. */
  rect: readonly [number, number, number, number];
  /** Anchor of the sprite: the registration point relative to the trimmed rectangle (0..1 typically). */
  anchorX: number;
  anchorY: number;
  /** Sprite scale that maps the raster to logical (1x) pixels: `1 / (tier zoom * tier scale)`. */
  baseScale: number;
}

/**
 * Where the registration point of a frame lies in its atlas rectangle.
 *
 * Card formula: `anchor = (origin1x - trim1x.xy) / trim1x.wh`. The same thing in the raster of the tier, which is
 * exact (the trimmed raster rectangle is not exactly `trim1x * zoom`): `origin1x * rasterZoom - trim.xy`
 * over `rect.wh`. `rasterZoom` = tier zoom * `scale` (`scale` is set when a lower raster stands in for the tier).
 */
export function frameGeometry(frame: Frame, tier: TierName): FrameGeometry {
  const t = frame.tiers[tier];
  const rasterZoom = TIER_ZOOM[tier] * (t.scale ?? 1);
  const [rx, ry, rw, rh] = t.rect;
  const anchorX = (frame.origin1x[0] * rasterZoom - t.trim[0]) / rw;
  const anchorY = (frame.origin1x[1] * rasterZoom - t.trim[1]) / rh;
  return { atlas: t.atlas, rect: [rx, ry, rw, rh], anchorX, anchorY, baseScale: 1 / rasterZoom };
}

/** `level-01-1` -> `{ group: 'level-01', page: 1 }`. */
export function parseAtlasKey(key: string): { group: string; page: number } | null {
  const m = /^(.+)-(\d+)$/.exec(key);
  return m === null ? null : { group: m[1] as string, page: Number(m[2]) };
}

/** Atlas page keys of a group in a tier, sorted by page. */
export function groupAtlasKeys(manifest: Pick<Manifest, 'atlases'>, tier: TierName, group: string): string[] {
  const out: { key: string; page: number }[] = [];
  for (const key of Object.keys(manifest.atlases[tier])) {
    const p = parseAtlasKey(key);
    if (p !== null && p.group === group) out.push({ key, page: p.page });
  }
  return out.sort((a, b) => a.page - b.page).map((e) => e.key);
}

/** `levelGroup` of the Frame header (1..20) -> atlas group name; null for "none". */
export function levelGroupName(levelGroup: number): string | null {
  if (levelGroup < 1 || levelGroup > 20) return null;
  return 'level-' + (levelGroup < 10 ? '0' : '') + levelGroup;
}
