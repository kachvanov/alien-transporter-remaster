// Runs before `electron-builder`: makes sure assets/ is present and current (`npm run extract`; its own cache,
// build/extract/.cache.json, decides what to redo), then builds the icon of the platform (icon.icns / icon.ico).
// Usage: `tsx tools/build/prepack.ts [--mac] [--win] [--no-extract]`. `--no-extract` (used by dist-all.ts, which builds in a
// temporary folder that shares assets/ with the main checkout) only checks that assets/ exists and makes the icons.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveSwfPath } from '../extract/decompile';
import { iconIsStale, makeIco, makeIcon } from './make-icon';

export type ExtractDecision = 'run' | 'run-if-possible' | 'skip';

/**
 * - assets (or the extract cache) missing -> extraction is mandatory ('run');
 * - assets present and the original SWF available -> run it, the cache makes it a no-op when nothing changed;
 * - assets present but no SWF on this machine -> use them as they are ('skip').
 */
export function decideExtract(hasAssets: boolean, hasCache: boolean, hasSwf: boolean): ExtractDecision {
  if (!hasAssets || !hasCache) return 'run';
  return hasSwf ? 'run-if-possible' : 'skip';
}

async function main(): Promise<void> {
  const root = process.cwd();
  const mac = process.argv.includes('--mac');
  const win = process.argv.includes('--win');
  const hasAssets = existsSync(join(root, 'assets', 'manifest.json'));
  const hasCache = existsSync(join(root, 'build', 'extract', '.cache.json'));
  const hasSwf = existsSync(resolveSwfPath(root));
  const decision = process.argv.includes('--no-extract') ? 'skip' : decideExtract(hasAssets, hasCache, hasSwf);
  console.log(`[prepack] assets=${hasAssets} cache=${hasCache} swf=${hasSwf} -> extract: ${decision}`);
  if (decision !== 'skip') {
    const r = spawnSync('npm', ['run', 'extract'], { stdio: 'inherit', cwd: root });
    if (r.status !== 0) throw new Error('npm run extract failed');
  }
  if (!existsSync(join(root, 'assets', 'manifest.json'))) throw new Error('assets/manifest.json is missing');
  if (mac) {
    if (iconIsStale(root)) console.log(`[prepack] icon: ${await makeIcon(root)}`);
    else console.log('[prepack] icon up to date');
  }
  if (win) {
    if (iconIsStale(root, 'icon.ico')) console.log(`[prepack] icon: ${await makeIco(root)}`);
    else console.log('[prepack] icon.ico up to date');
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('prepack.ts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
