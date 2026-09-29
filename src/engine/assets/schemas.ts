// zod schema of assets/manifest.json (docs/02-extraction-pipeline.md §4.5).
// Written by tools/extract/sprites.ts, read and validated by the engine's asset loader.
import { z } from 'zod';

export const TIER_NAMES = ['1x', '2x', '3x'] as const;
export const TierNameSchema = z.enum(TIER_NAMES);
export type TierName = z.infer<typeof TierNameSchema>;

/** Zoom factor of each tier. */
export const TIER_ZOOM: Record<TierName, number> = { '1x': 1, '2x': 2, '3x': 3 };

const IntSchema = z.number().int();

/** `[x, y, w, h]` in integer pixels. */
export const IntRectSchema = z.tuple([IntSchema, IntSchema, IntSchema, IntSchema]);
export type IntRect = z.infer<typeof IntRectSchema>;

/** `[x, y]` / `[w, h]` in logical (1x) pixels, may be fractional. */
export const PairSchema = z.tuple([z.number(), z.number()]);

/**
 * Bit mask (1 bit per pixel, `alpha > 0`, rows padded to whole bytes, MSB first)
 * of the full untrimmed 1x frame, stored in assets/data/alphamasks.bin.
 */
export const MaskRefSchema = z.object({
  /** Byte offset into alphamasks.bin. */
  offset: IntSchema.nonnegative(),
  w: IntSchema.positive(),
  h: IntSchema.positive(),
});
export type MaskRef = z.infer<typeof MaskRefSchema>;

export const TierFrameSchema = z.object({
  /** Key into `atlases[tier]`. */
  atlas: z.string(),
  /** Rectangle of the trimmed frame inside the atlas page, in atlas pixels. */
  rect: IntRectSchema,
  /**
   * Trimmed rectangle relative to the UNtrimmed frame of this tier's raster
   * (raster pixels, see `scale`).
   */
  trim: IntRectSchema,
  /**
   * Raster zoom / nominal tier zoom. Omitted (= 1) normally. Set when the raster of a
   * lower tier stands in for this one (asset-overrides `maxTier`, bitmap fonts):
   * the renderer must scale the sprite by `1 / scale`.
   */
  scale: z.number().positive().optional(),
});
export type TierFrame = z.infer<typeof TierFrameSchema>;

export const FrameSchema = z.object({
  /** `<Symbol>#<0-based frame>`; `gotoAndStop(n)` in AS3 = key `#(n-1)`. */
  key: z.string(),
  group: z.string(),
  /** Logical size of the untrimmed frame (for AntActor.width/height). */
  size1x: PairSchema,
  /** Registration point relative to the top-left corner of the untrimmed frame, 1x. */
  origin1x: PairSchema,
  /** Trimmed rectangle relative to the untrimmed frame, 1x pixels. */
  trim1x: IntRectSchema,
  /** Present only for frames used by AntLight (ShuttleView and its children). */
  mask: MaskRefSchema.optional(),
  tiers: z.object({
    '1x': TierFrameSchema,
    '2x': TierFrameSchema,
    '3x': TierFrameSchema,
  }),
});
export type Frame = z.infer<typeof FrameSchema>;

export const SymbolRefSchema = z.object({
  firstTexId: IntSchema.nonnegative(),
  frames: IntSchema.positive(),
});
export type SymbolRef = z.infer<typeof SymbolRefSchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  /** sha256 of the manifest JSON serialized without this field. */
  buildHash: z.string().regex(/^[0-9a-f]{64}$/),
  tiers: z.tuple([z.literal('1x'), z.literal('2x'), z.literal('3x')]),
  /** tier -> atlas key (`<group>-<n>`) -> path relative to assets/. */
  atlases: z.object({
    '1x': z.record(z.string(), z.string()),
    '2x': z.record(z.string(), z.string()),
    '3x': z.record(z.string(), z.string()),
  }),
  /** texId = index in this array (u16). */
  frames: z.array(FrameSchema).max(65536),
  symbols: z.record(z.string(), SymbolRefSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(json: string): Manifest {
  return ManifestSchema.parse(JSON.parse(json));
}
