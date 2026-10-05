// Paths and git helpers shared by dist-all.ts, dist-status.ts and dist-open.ts (T5.3, T5.5).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export interface DistPaths {
  root: string;
  dist: string;
  /** dist/build.log: the only loose file in dist/ besides latest/ and archive/. */
  log: string;
  /** dist/latest/: the newest build under stable names. */
  latest: string;
  /** dist/archive/<date>-<hash>/: builds with their original hash-named files. */
  archive: string;
  /** dist/.state/: internal files, hidden from the user's view. */
  stateDir: string;
  lock: string;
  pending: string;
  state: string;
  /** The newest attempt, also a failed one that never became latest/. */
  attempt: string;
  /** Cache of the content hashes of assets/ files (dist-assets.ts): only an optimisation. */
  assetsCache: string;
  /** latest/ is built here and swapped in; the replaced one waits here until it is deleted. */
  latestNext: string;
  latestOld: string;
  /** BUILD-INFO.json inside latest/. */
  latestInfo: string;
}

export function distPaths(root: string): DistPaths {
  const dist = join(root, 'dist');
  const stateDir = join(dist, '.state');
  const latest = join(dist, 'latest');
  return {
    root,
    dist,
    log: join(dist, 'build.log'),
    latest,
    archive: join(dist, 'archive'),
    stateDir,
    lock: join(stateDir, 'build.lock'),
    pending: join(stateDir, 'build.pending'),
    state: join(stateDir, 'build-state.json'),
    attempt: join(stateDir, 'last-attempt.json'),
    assetsCache: join(stateDir, 'assets-hash-cache.json'),
    latestNext: join(stateDir, 'latest.next'),
    latestOld: join(stateDir, 'latest.old'),
    latestInfo: join(latest, 'BUILD-INFO.json'),
  };
}

/** The environment without git's own variables: a hook runs with GIT_DIR/GIT_INDEX_FILE set, which would mislead any git call. */
export function cleanGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  for (const k of Object.keys(out)) if (k.startsWith('GIT_')) delete out[k];
  return out;
}

/** Output of `git <args>` in `cwd`, or null if git fails. */
export function git(cwd: string, args: string[]): string | null {
  const r = spawnSync('git', args, { cwd, env: cleanGitEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function resolveCommit(root: string, rev: string): string | null {
  return git(root, ['rev-parse', '--verify', `${rev}^{commit}`]);
}

/** Files changed between two commits, or null if that cannot be determined (unknown base: build to be safe). */
export function changedFiles(root: string, from: string, to: string): string[] | null {
  if (resolveCommit(root, from) === null) return null;
  const out = git(root, ['diff', '--name-only', from, to]);
  return out === null ? null : out.split('\n').filter((l) => l !== '');
}
