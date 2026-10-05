// Fingerprint of the generated assets (FIX-8). assets/ is NOT in git (it is produced by `npm run extract`) but it is shipped
// in every package (electron-builder.yml, extraResources), so a git diff never shows that the look of the game changed.
// The auto build therefore compares this fingerprint with the one stored at the last successful build.
//
// The fingerprint is a sha256 over (relative path, size, sha256 of the content) of every file in assets/, so it depends
// on the content only: an idempotent re-run of `npm run extract` (it rewrites identical files, mtimes change) leaves it as it was.
// To stay cheap (~200 files, ~220 MB) the content hash of a file is cached by (size, mtime): an unchanged file is only
// stat'ed, a rewritten one is read again (and gives the same hash if its content is the same).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type DistPaths, changedFiles } from './dist-env';
import { type BuildDecision, type BuildState, decideBuild, readJson, writeJsonAtomic } from './dist-lib';

export interface AssetsFingerprint {
  /** Hex sha256 over the sorted (path, size, content hash) list. */
  fingerprint: string;
  files: number;
  bytes: number;
  /** Newest mtime of any file (ms since epoch): a cheap "was anything touched after time T" check. */
  newestMtimeMs: number;
  /** Files whose content was read this time (the others came from the cache). */
  hashed: number;
}

type HashCache = Record<string, { size: number; mtimeMs: number; sha: string }>;

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * Fingerprint of `<root>/assets`, or null if that folder does not exist. `cachePath` (optional) is the file where the
 * per-file hash cache lives; without it every file is read.
 */
export function assetsFingerprint(root: string, cachePath?: string): AssetsFingerprint | null {
  const dir = join(root, 'assets');
  let files: string[];
  try {
    files = listFiles(dir).sort();
  } catch {
    return null;
  }
  const old = cachePath !== undefined ? readJson<HashCache>(cachePath, {}) : {};
  const next: HashCache = {};
  const total = createHash('sha256');
  let bytes = 0;
  let newest = 0;
  let hashed = 0;
  for (const f of files) {
    const rel = relative(dir, f).split('\\').join('/');
    const st = statSync(f);
    const hit = old[rel];
    let sha: string;
    if (hit !== undefined && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
      sha = hit.sha;
    } else {
      sha = createHash('sha256').update(readFileSync(f)).digest('hex');
      hashed++;
    }
    next[rel] = { size: st.size, mtimeMs: st.mtimeMs, sha };
    total.update(`${rel}\0${st.size}\0${sha}\n`);
    bytes += st.size;
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  }
  if (cachePath !== undefined && (hashed > 0 || Object.keys(old).length !== files.length)) {
    try {
      mkdirSync(dirname(cachePath), { recursive: true });
      writeJsonAtomic(cachePath, next);
    } catch {
      // the cache is an optimisation only
    }
  }
  return { fingerprint: total.digest('hex'), files: files.length, bytes, newestMtimeMs: newest, hashed };
}

/** The decision for `commit` against the recorded state, with the facts it was made from (also used by dist:status). */
export function evaluateBuild(
  paths: DistPaths,
  state: BuildState,
  commit: string,
): { decision: BuildDecision; changed: string[] | null; assets: AssetsFingerprint | null } {
  const changed = state.lastSuccess === null ? null : changedFiles(paths.root, state.lastSuccess.commit, commit);
  const assets = assetsFingerprint(paths.root, paths.assetsCache);
  return { decision: decideBuild({ lastSuccess: state.lastSuccess, changed, assets }), changed, assets };
}

/**
 * Migration of a state written before the fingerprint existed: when `decision` says "no build, adopt this fingerprint",
 * the last build's record gets it. Returns the new state (written to paths.state) or null if nothing was to be adopted.
 */
export function adoptAssetsFingerprint(paths: DistPaths, state: BuildState, decision: BuildDecision): BuildState | null {
  if (decision.adoptAssets === undefined || decision.adoptAssets === '' || state.lastSuccess === null) return null;
  const next: BuildState = { ...state, lastSuccess: { ...state.lastSuccess, assets: decision.adoptAssets } };
  writeJsonAtomic(paths.state, next);
  return next;
}
