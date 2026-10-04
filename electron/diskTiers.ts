// Not a port. Which graphics tiers a build really has (T4.4): the manifest lists `gfx/1x`, `gfx/2x` and `gfx/3x`, but the Windows
// build does not ship `gfx/3x` (electron-builder.yml, docs/05 §9). The main process checks the files and tells the renderer, so
// the automatic choice of the tier never lands on atlases that are not there (a 404 on every page).
// Node only (main process and tests).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TierName } from '../src/app/at';

const TIERS: readonly TierName[] = ['1x', '2x', '3x'];

/** `tier -> { atlas key -> path relative to the assets root }` (the `atlases` part of manifest.json). */
export type AtlasPaths = Partial<Record<TierName, Record<string, string>>>;

/** The tiers whose atlas pages all exist under `root`. A tier without pages, or with a missing page, is not available. */
export function detectDiskTiers(root: string, atlases: AtlasPaths, exists: (path: string) => boolean = existsSync): TierName[] {
  return TIERS.filter((tier) => {
    const pages = Object.values(atlases[tier] ?? {});
    return pages.length > 0 && pages.every((p) => exists(join(root, p)));
  });
}

/** Reads `atlases` of `<root>/manifest.json`; null when the file is missing or broken (the renderer then trusts the manifest). */
export function readAtlasPaths(root: string): AtlasPaths | null {
  try {
    const doc = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { atlases?: unknown };
    if (typeof doc.atlases !== 'object' || doc.atlases === null) return null;
    const out: AtlasPaths = {};
    for (const tier of TIERS) {
      const pages = (doc.atlases as Record<string, unknown>)[tier];
      if (typeof pages !== 'object' || pages === null) continue;
      out[tier] = Object.fromEntries(Object.entries(pages).filter((e): e is [string, string] => typeof e[1] === 'string'));
    }
    return out;
  } catch {
    return null;
  }
}

/** Tiers of the build at `root`, or null when they cannot be told. */
export function diskTiersOf(root: string): TierName[] | null {
  const atlases = readAtlasPaths(root);
  return atlases === null ? null : detectDiskTiers(root, atlases);
}
