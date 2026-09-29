// zod schemas + loaders for build/extract/{symbols,placements}.json (written by SymbolInfo.java).
// Coordinates are in pixels (twips / 20); matrices are raw Flash [a, b, c, d, tx, ty].
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const RectSchema = z.object({
  xMin: z.number(),
  yMin: z.number(),
  xMax: z.number(),
  yMax: z.number(),
});
export type Rect = z.infer<typeof RectSchema>;

export const SoundInfoSchema = z.object({
  /** SWF sound format: 2 = MP3. */
  format: z.number().int(),
  rate: z.number().int(),
  stereo: z.boolean(),
  sampleCount: z.number().int(),
  seekSamples: z.number().int(),
});
export type SoundInfo = z.infer<typeof SoundInfoSchema>;

/** `kind` is sprite|shape|image|sound, or the raw JPEXS tag class name for anything else. */
export const SymbolInfoSchema = z.object({
  id: z.number().int(),
  className: z.string(),
  kind: z.string(),
  frames: z.number().int().optional(),
  rect: RectSchema.optional(),
  rectWithFilters: RectSchema.optional(),
  sound: SoundInfoSchema.optional(),
});
export type SymbolInfo = z.infer<typeof SymbolInfoSchema>;

export const SymbolsSchema = z.array(SymbolInfoSchema);

export const MatrixSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export type Matrix = z.infer<typeof MatrixSchema>;

export const PlacementSchema = z.object({
  depth: z.number().int(),
  characterId: z.number().int(),
  /** null = unnamed editor graphics (ignored by the game). */
  className: z.string().nullable(),
  instanceName: z.string().nullable(),
  move: z.boolean(),
  matrix: MatrixSchema,
});
export type Placement = z.infer<typeof PlacementSchema>;

/** Clip class name -> frame-1 placements in tag order (sort by depth before use). */
export const PlacementsSchema = z.record(z.string(), z.array(PlacementSchema));
export type Placements = z.infer<typeof PlacementsSchema>;

export const SYMBOLS_FILE = 'symbols.json';
export const PLACEMENTS_FILE = 'placements.json';

export function parseSymbols(json: string): SymbolInfo[] {
  return SymbolsSchema.parse(JSON.parse(json));
}

export function parsePlacements(json: string): Placements {
  return PlacementsSchema.parse(JSON.parse(json));
}

export function loadSymbols(extractDir: string): SymbolInfo[] {
  return parseSymbols(readFileSync(join(extractDir, SYMBOLS_FILE), 'utf8'));
}

export function loadPlacements(extractDir: string): Placements {
  return parsePlacements(readFileSync(join(extractDir, PLACEMENTS_FILE), 'utf8'));
}
