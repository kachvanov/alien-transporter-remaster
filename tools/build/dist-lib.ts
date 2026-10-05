// Pure(ish) logic of the local auto builds (T5.3): which changes need a build, the lock and the queue, artifact names,
// rotation of old builds, BUILD-INFO.json and the notification texts. No electron-builder here, so it is unit-testable.
// The side effects (git archive, electron-builder, notifications) live in dist-all.ts.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------------------------------------------
// Path filter: is a build needed?
// ---------------------------------------------------------------------------------------------------------------

/** A change in any of these (directory prefixes end with "/") changes the built application. */
export const BUILD_TRIGGER_PATHS: readonly string[] = [
  'src/',
  'electron/',
  'resources/',
  'package.json',
  'package-lock.json',
  'electron-builder.yml',
  'index.html',
  'electron.vite.config.ts',
];

/** True if at least one of the changed files (repository-relative, "/"-separated) affects the built app. */
export function needsBuild(changedFiles: readonly string[]): boolean {
  return changedFiles.some((f) =>
    BUILD_TRIGGER_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

/** Short commit id used in file names (BUILD_ID). */
export function shortHash(commit: string): string {
  return commit.trim().slice(0, 7);
}

/** BUILD_ID for electron-builder (`${env.BUILD_ID}` in electron-builder.yml): the env value, else the short HEAD hash, else "dev". */
export function resolveBuildId(envValue: string | undefined, headCommit: string | null): string {
  if (envValue !== undefined && envValue.trim() !== '') return envValue.trim();
  if (headCommit !== null && headCommit.trim() !== '') return shortHash(headCommit);
  return 'dev';
}

export type ArtifactKind = 'mac' | 'win-setup' | 'win-portable';

/**
 * Which deliverable a file in electron-builder's output is (null: not a deliverable: blockmaps, unpacked dirs, yml).
 * Only files carrying this build's id count, so a leftover of an older build is never picked up.
 */
export function classifyArtifact(fileName: string, buildId: string): ArtifactKind | null {
  if (!fileName.includes(`-${buildId}`)) return null;
  if (fileName.endsWith('.dmg')) return 'mac';
  if (fileName.endsWith('.exe')) return / Setup /.test(fileName) ? 'win-setup' : 'win-portable';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// BUILD-INFO.json and the state file
// ---------------------------------------------------------------------------------------------------------------

export type StageStatus = 'ok' | 'failed' | 'skipped';

export interface StageResult {
  name: string;
  status: StageStatus;
  ms: number;
  error?: string;
}

export interface BuildFile {
  kind: ArtifactKind;
  name: string;
  bytes: number;
}

export interface BuildInfo {
  commit: string;
  shortCommit: string;
  date: string;
  version: string;
  /** True only if every stage succeeded (macOS and Windows). */
  ok: boolean;
  status: 'ok' | 'partial' | 'failed';
  durationMs: number;
  stages: StageResult[];
  files: BuildFile[];
}

/** Stages that produce a deliverable: a failure of one must not stop the other. */
export const PLATFORM_STAGES: readonly string[] = ['mac', 'win'];

export function makeBuildInfo(args: {
  commit: string;
  date: string;
  version: string;
  stages: StageResult[];
  files: BuildFile[];
  durationMs: number;
}): BuildInfo {
  const ok = args.stages.every((s) => s.status === 'ok');
  const platformOk = args.stages.filter((s) => PLATFORM_STAGES.includes(s.name) && s.status === 'ok').length;
  return {
    commit: args.commit,
    shortCommit: shortHash(args.commit),
    date: args.date,
    version: args.version,
    ok,
    status: ok ? 'ok' : platformOk > 0 ? 'partial' : 'failed',
    durationMs: args.durationMs,
    stages: args.stages,
    files: args.files,
  };
}

export interface HistoryEntry {
  commit: string;
  date: string;
  /** File names in dist/ that belong to this build. */
  files: string[];
}

export interface BuildState {
  /** Last commit that was built completely (all platforms ok): the base of the "what changed" diff. */
  lastSuccess: { commit: string; date: string } | null;
  /** Newest first. */
  history: HistoryEntry[];
}

export const EMPTY_STATE: BuildState = { lastSuccess: null, history: [] };

/** How many newest builds (a "pair" = dmg + exe set of one commit) are kept in dist/. */
export const KEEP_BUILDS = 2;

/** Keeps the `keep` newest builds that have files; returns the new history and the file names to delete. */
export function rotateBuilds(
  history: readonly HistoryEntry[],
  keep: number = KEEP_BUILDS,
): { history: HistoryEntry[]; remove: string[] } {
  const withFiles = history.filter((h) => h.files.length > 0);
  const kept = withFiles.slice(0, keep);
  const keptFiles = new Set(kept.flatMap((h) => h.files));
  const remove: string[] = [];
  for (const h of withFiles.slice(keep)) {
    for (const f of h.files) if (!keptFiles.has(f) && !remove.includes(f)) remove.push(f);
  }
  return { history: kept, remove };
}

/** State after a finished build: the entry goes first (a rebuild of the same commit replaces the old entry). */
export function recordBuild(state: BuildState, info: BuildInfo): BuildState {
  const entry: HistoryEntry = { commit: info.commit, date: info.date, files: info.files.map((f) => f.name) };
  const history = [entry, ...state.history.filter((h) => h.commit !== info.commit)];
  return {
    lastSuccess: info.ok ? { commit: info.commit, date: info.date } : state.lastSuccess,
    history,
  };
}

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------------------------------------------
// Lock and queue
// ---------------------------------------------------------------------------------------------------------------

export interface LockInfo {
  pid: number;
  startedAt: string;
}

/** A lock older than this is considered dead even if its pid exists (pid reuse after a crash/reboot). */
export const LOCK_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLock(lockPath: string): LockInfo | null {
  const l = readJson<LockInfo | null>(lockPath, null);
  return l !== null && typeof l.pid === 'number' ? l : null;
}

export interface LockOptions {
  isAlive?: (pid: number) => boolean;
  now?: () => number;
  maxAgeMs?: number;
}

/** True if the lock is held by a live, not too old process. A stale lock is not "active". */
export function lockIsActive(lockPath: string, opts: LockOptions = {}): boolean {
  const info = readLock(lockPath);
  if (info === null) return false;
  const isAlive = opts.isAlive ?? isPidAlive;
  const now = (opts.now ?? Date.now)();
  const age = now - Date.parse(info.startedAt);
  if (Number.isFinite(age) && age > (opts.maxAgeMs ?? LOCK_MAX_AGE_MS)) return false;
  return isAlive(info.pid);
}

/** Atomically takes the lock (O_EXCL). A stale lock (dead pid, too old, unreadable) is removed first. */
export function acquireLock(lockPath: string, pid: number, opts: LockOptions = {}): boolean {
  mkdirSync(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx');
      const info: LockInfo = { pid, startedAt: new Date((opts.now ?? Date.now)()).toISOString() };
      writeSync(fd, JSON.stringify(info));
      closeSync(fd);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (lockIsActive(lockPath, opts)) return false;
      rmSync(lockPath, { force: true }); // stale: remove and try once more
    }
  }
  return false;
}

/** Releases the lock if it is ours. */
export function releaseLock(lockPath: string, pid: number): void {
  const info = readLock(lockPath);
  if (info === null || info.pid === pid) rmSync(lockPath, { force: true });
}

export interface BuildRequest {
  commit: string;
  /** Build even if no trigger path changed (a manual `npm run dist:all`). */
  force: boolean;
  requestedAt: string;
}

/** Puts a request in the single "pending" slot: several requests coalesce into one (the newest commit; force sticks). */
export function enqueue(pendingPath: string, req: BuildRequest): void {
  const old = readJson<BuildRequest | null>(pendingPath, null);
  writeJsonAtomic(pendingPath, { ...req, force: req.force || (old?.force ?? false) });
}

export function peekPending(pendingPath: string): BuildRequest | null {
  const r = readJson<BuildRequest | null>(pendingPath, null);
  return r !== null && typeof r.commit === 'string' ? r : null;
}

/** Takes the pending request (and empties the slot). */
export function takePending(pendingPath: string): BuildRequest | null {
  const taken = `${pendingPath}.${process.pid}.taken`;
  try {
    renameSync(pendingPath, taken);
  } catch {
    return null;
  }
  const r = peekPending(taken);
  rmSync(taken, { force: true });
  return r;
}

export interface QueuePaths {
  lock: string;
  pending: string;
}

export interface QueueDeps {
  pid: number;
  lockOptions?: LockOptions;
  /** Decides at the moment the request is taken (so that docs-only requests after a finished build are skipped). */
  shouldBuild: (req: BuildRequest) => boolean | Promise<boolean>;
  build: (req: BuildRequest) => void | Promise<void>;
  log: (msg: string) => void;
}

export interface QueueResult {
  /** Another build holds the lock: our request stays in the queue and will be built after it. */
  busy: boolean;
  built: string[];
  skipped: string[];
}

/**
 * Runs the queue: if no build is active, takes the lock and builds the pending request, then the next one that arrived
 * meanwhile (coalesced into one), until the slot is empty. If a build is active, the request just stays pending.
 * Never two builds in parallel; the lock is always released (also on a throwing build).
 */
export async function processQueue(paths: QueuePaths, deps: QueueDeps): Promise<QueueResult> {
  const result: QueueResult = { busy: false, built: [], skipped: [] };
  for (;;) {
    if (peekPending(paths.pending) === null) return result;
    if (!acquireLock(paths.lock, deps.pid, deps.lockOptions)) {
      result.busy = true;
      deps.log(`a build is already running (pid ${readLock(paths.lock)?.pid ?? '?'}); the request stays queued`);
      return result;
    }
    try {
      for (let req = takePending(paths.pending); req !== null; req = takePending(paths.pending)) {
        if (await deps.shouldBuild(req)) {
          try {
            await deps.build(req);
            result.built.push(req.commit);
          } catch (e) {
            deps.log(`build of ${shortHash(req.commit)} crashed: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          deps.log(`${shortHash(req.commit)}: no build-relevant changes, skipped`);
          result.skipped.push(req.commit);
        }
      }
    } finally {
      releaseLock(paths.lock, deps.pid);
    }
    result.busy = false;
    // A request that arrived between our last take and the lock release found the lock busy and left: pick it up.
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Notifications and status text
// ---------------------------------------------------------------------------------------------------------------

export function notificationFor(info: BuildInfo): string {
  if (info.ok) return `Build ${info.shortCommit} is ready: dmg + exe`;
  if (info.status === 'partial') {
    const failed = info.stages.filter((s) => s.status === 'failed').map((s) => s.name);
    return `Build ${info.shortCommit} partly failed (${failed.join(', ')}): see dist/build.log`;
  }
  return 'Build failed: see dist/build.log';
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export interface StatusInput {
  running: LockInfo | null;
  pending: BuildRequest | null;
  state: BuildState;
  headCommit: string | null;
  /** Files changed between the last successful build and HEAD (null: unknown). */
  changedSinceBuild: string[] | null;
  distDir: string;
  info: BuildInfo | null;
}

export function formatStatus(s: StatusInput): string {
  const lines: string[] = [];
  lines.push(
    s.running !== null
      ? `build: RUNNING (pid ${s.running.pid}, since ${s.running.startedAt})`
      : 'build: not running',
  );
  if (s.pending !== null) lines.push(`queued: ${shortHash(s.pending.commit)} (starts after the running build)`);
  if (s.state.lastSuccess !== null) {
    lines.push(`last successful build: ${shortHash(s.state.lastSuccess.commit)} at ${s.state.lastSuccess.date}`);
  } else {
    lines.push('last successful build: none');
  }
  if (s.headCommit !== null) {
    if (s.state.lastSuccess?.commit === s.headCommit) {
      lines.push(`main (${shortHash(s.headCommit)}): up to date`);
    } else if (s.changedSinceBuild === null) {
      lines.push(`main (${shortHash(s.headCommit)}): differs from the last build (changes unknown): a build is needed`);
    } else if (needsBuild(s.changedSinceBuild)) {
      lines.push(`main (${shortHash(s.headCommit)}): BEHIND, the build is outdated (src/electron/... changed)`);
    } else {
      lines.push(`main (${shortHash(s.headCommit)}): ahead of the build, but only docs/tests/tools changed: no build needed`);
    }
  }
  if (s.info !== null) {
    lines.push(
      `latest attempt: ${s.info.shortCommit} ${s.info.status} in ${formatDuration(s.info.durationMs)} (${s.info.stages
        .map((st) => `${st.name}=${st.status}`)
        .join(', ')})`,
    );
    for (const f of s.info.files) lines.push(`  ${f.kind.padEnd(12)} ${s.distDir}/${f.name} (${(f.bytes / 1048576).toFixed(1)} MB)`);
  }
  lines.push(`log: ${s.distDir}/build.log`);
  return lines.join('\n');
}

/** Existing, non-empty file. */
export function fileSize(path: string): number | null {
  try {
    return existsSync(path) ? statSync(path).size : null;
  } catch {
    return null;
  }
}

export function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // already gone
  }
}
