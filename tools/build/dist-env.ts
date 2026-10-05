// Paths and git helpers shared by dist-all.ts and dist-status.ts (T5.3).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export interface DistPaths {
  root: string;
  dist: string;
  log: string;
  lock: string;
  pending: string;
  state: string;
  info: string;
}

export function distPaths(root: string): DistPaths {
  const dist = join(root, 'dist');
  return {
    root,
    dist,
    log: join(dist, 'build.log'),
    lock: join(dist, '.build.lock'),
    pending: join(dist, '.build.pending'),
    state: join(dist, '.build-state.json'),
    info: join(dist, 'BUILD-INFO.json'),
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
