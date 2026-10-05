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

/**
 * A change in any of these (directory prefixes end with "/") changes the built application. FIX-8: also what produces or
 * packs the generated assets (tools/extract/**, the icon and signing steps of the build). assets/ itself is not in git, so
 * a change of the pipeline is all a git diff shows; the content of assets/ is watched by its fingerprint
 * (dist-assets.ts, `decideBuild`).
 */
export const BUILD_TRIGGER_PATHS: readonly string[] = [
  'src/',
  'electron/',
  'resources/',
  'package.json',
  'package-lock.json',
  'electron-builder.yml',
  'index.html',
  'electron.vite.config.ts',
  'tools/extract/',
  'tools/build/prepack.ts',
  'tools/build/make-icon.ts',
  'tools/build/adhocSign.cjs',
];

/** Tests never change what is built. */
function isTestFile(f: string): boolean {
  return /\.test\.[cm]?[jt]s$/.test(f);
}

/** True if at least one of the changed files (repository-relative, "/"-separated) affects the built app. */
export function needsBuild(changedFiles: readonly string[]): boolean {
  return changedFiles.some(
    (f) => !isTestFile(f) && BUILD_TRIGGER_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)),
  );
}

export interface DecisionInput {
  /** The state's lastSuccess (null: nothing was built yet). */
  lastSuccess: LastSuccess | null;
  /** Files changed between lastSuccess.commit and the commit to build (null: unknown). */
  changed: string[] | null;
  /** Fingerprint of assets/ now (null: assets/ does not exist). */
  assets: { fingerprint: string; newestMtimeMs: number } | null;
}

export interface BuildDecision {
  build: boolean;
  reason: string;
  /**
   * Set when no build is needed and the last build has no fingerprint yet (a build made before FIX-8) but assets/ is not
   * newer than it: the caller stores this fingerprint as that build's one, so nothing is rebuilt "for nothing" and the
   * next comparison is exact.
   */
  adoptAssets?: string;
}

/**
 * Is a build needed now? Both the sources (git diff against the last successful build) and the generated assets
 * (fingerprint of assets/ against the one recorded by the last successful build) are checked. A request for the very same
 * commit is therefore not "up to date" by itself: `npm run extract` may have changed assets/ since.
 */
export function decideBuild(i: DecisionInput): BuildDecision {
  if (i.lastSuccess === null) return { build: true, reason: 'no successful build yet' };
  if (i.changed === null) return { build: true, reason: 'the changes since the last build cannot be determined' };
  if (needsBuild(i.changed)) return { build: true, reason: 'src/electron/resources/build configuration/tools/extract changed' };
  switch (compareAssets(i.lastSuccess, i.assets)) {
    case 'none':
      return { build: false, reason: 'no build-relevant changes (assets/ is missing: nothing to compare)' };
    case 'same':
      return { build: false, reason: 'no build-relevant changes, the generated assets are the same' };
    case 'changed':
      return { build: true, reason: 'the generated assets (assets/) changed since the last build' };
    case 'unrecorded-newer':
      return { build: true, reason: 'assets/ was modified after the last build (its fingerprint was not recorded)' };
    case 'unrecorded':
      return {
        build: false,
        reason: 'no build-relevant changes; assets/ is older than the last build (fingerprint recorded now)',
        adoptAssets: i.assets?.fingerprint ?? '',
      };
  }
}

/**
 * - none: assets/ does not exist; same / changed: against the fingerprint recorded by the last successful build;
 * - unrecorded(-newer): that build predates the fingerprint (migration). No file in assets/ is newer than the build
 *   ('unrecorded': the build has the current assets) or some file is ('unrecorded-newer': they may have changed).
 */
export type AssetsStatus = 'none' | 'same' | 'changed' | 'unrecorded' | 'unrecorded-newer';

export function compareAssets(
  lastSuccess: LastSuccess,
  assets: { fingerprint: string; newestMtimeMs: number } | null,
): AssetsStatus {
  if (assets === null) return 'none';
  if (lastSuccess.assets !== undefined) return lastSuccess.assets === assets.fingerprint ? 'same' : 'changed';
  return assets.newestMtimeMs > Date.parse(lastSuccess.date) ? 'unrecorded-newer' : 'unrecorded';
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

/** Names in dist/latest/ (T5.5): stable across builds, no spaces, no hash: safe to bookmark and to copy to another machine. */
export const STABLE_NAMES: Readonly<Record<ArtifactKind, string>> = {
  mac: 'Alien-Transporter-Remaster-mac-arm64.dmg',
  'win-setup': 'Alien-Transporter-Remaster-win-setup.exe',
  'win-portable': 'Alien-Transporter-Remaster-win-portable.exe',
};

/** `2026-10-05_1432-49ec902`: the folder of a build in dist/archive/ (local time of the build start). */
export function archiveDirName(date: Date, commit: string): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  const day = `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `${day}_${p(date.getHours())}${p(date.getMinutes())}-${shortHash(commit)}`;
}

/** Only folders with this shape in dist/archive/ belong to the build system; anything else there is the user's. */
export const ARCHIVE_DIR_RE = /^\d{4}-\d{2}-\d{2}_\d{4}-[0-9a-f]{4,40}$/;

const PRODUCT = 'Alien Transporter Remaster';

export interface ParsedArtifactName {
  kind: ArtifactKind;
  version: string;
  hash: string;
  /** A leftover `.partial` of an interrupted move. */
  partial: boolean;
}

/**
 * A loose file of the OLD flat dist/ layout (T5.3 names): `<product>-<ver>-<hash>-arm64.dmg`,
 * `<product> Setup <ver>-<hash>.exe`, `<product> <ver>-<hash>.exe` (+ ".partial"). Anything else is not ours: null.
 */
export function parseArtifactName(fileName: string): ParsedArtifactName | null {
  const partial = fileName.endsWith('.partial');
  const name = partial ? fileName.slice(0, -'.partial'.length) : fileName;
  const ver = '(\\d+(?:\\.\\d+)*)';
  const hash = '([0-9a-f]{4,40})';
  let m = new RegExp(`^${PRODUCT}-${ver}-${hash}-arm64\\.dmg$`).exec(name);
  if (m !== null) return { kind: 'mac', version: m[1] ?? '', hash: m[2] ?? '', partial };
  m = new RegExp(`^${PRODUCT} Setup ${ver}-${hash}\\.exe$`).exec(name);
  if (m !== null) return { kind: 'win-setup', version: m[1] ?? '', hash: m[2] ?? '', partial };
  m = new RegExp(`^${PRODUCT} ${ver}-${hash}\\.exe$`).exec(name);
  if (m !== null) return { kind: 'win-portable', version: m[1] ?? '', hash: m[2] ?? '', partial };
  return null;
}

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
  /** The original hash-named file in dist/archive/<archiveDir>/. */
  name: string;
  /** The stable name of the same file (a hard link) in dist/latest/. */
  latestName: string;
  bytes: number;
}

export interface BuildInfo {
  commit: string;
  shortCommit: string;
  date: string;
  version: string;
  /** True only if every stage succeeded (macOS and Windows). */
  ok: boolean;
  /** 'partial': a platform failed, it is absent from latest/ (see `stages` for the reason). */
  status: 'ok' | 'partial' | 'failed';
  durationMs: number;
  stages: StageResult[];
  files: BuildFile[];
  /** Folder of this build in dist/archive/ ('' if nothing was produced). */
  archiveDir: string;
  /** Fingerprint of assets/ taken when the build started (FIX-8); absent in builds made before it. */
  assets?: string;
  /** Set for a build recovered from the old flat dist/ layout. */
  note?: string;
}

/** Stages that produce a deliverable: a failure of one must not stop the other. */
export const PLATFORM_STAGES: readonly string[] = ['mac', 'win'];

export function makeBuildInfo(args: {
  commit: string;
  date: string;
  version: string;
  stages: StageResult[];
  files: Omit<BuildFile, 'latestName'>[];
  durationMs: number;
  archiveDir?: string;
  assets?: string;
  note?: string;
}): BuildInfo {
  const ok = args.stages.every((s) => s.status === 'ok');
  const platformOk = args.stages.filter((s) => PLATFORM_STAGES.includes(s.name) && s.status === 'ok').length;
  const info: BuildInfo = {
    commit: args.commit,
    shortCommit: shortHash(args.commit),
    date: args.date,
    version: args.version,
    ok,
    status: ok ? 'ok' : platformOk > 0 ? 'partial' : 'failed',
    durationMs: args.durationMs,
    stages: args.stages,
    files: args.files.map((f) => ({ ...f, latestName: STABLE_NAMES[f.kind] })),
    archiveDir: args.archiveDir ?? '',
  };
  if (args.assets !== undefined) info.assets = args.assets;
  if (args.note !== undefined) info.note = args.note;
  return info;
}

export interface HistoryEntry {
  commit: string;
  date: string;
  /** Folder of this build in dist/archive/. */
  dir: string;
}

export interface LastSuccess {
  commit: string;
  date: string;
  /** Fingerprint of assets/ at the start of that build (FIX-8); missing in a state written before it. */
  assets?: string;
}

/** The lastSuccess after `info` finished: only a fully successful build moves it (a failed one keeps the old commit and fingerprint). */
export function successOf(previous: LastSuccess | null, info: BuildInfo): LastSuccess | null {
  if (!info.ok) return previous;
  return info.assets !== undefined
    ? { commit: info.commit, date: info.date, assets: info.assets }
    : { commit: info.commit, date: info.date };
}

export interface BuildState {
  /** Last commit that was built completely (all platforms ok): the base of the "what changed" diff. */
  lastSuccess: LastSuccess | null;
  /** Builds that exist in dist/archive/, newest first; history[0] is what dist/latest/ holds. */
  history: HistoryEntry[];
}

export const EMPTY_STATE: BuildState = { lastSuccess: null, history: [] };

/**
 * How many builds dist/archive/ holds: the newest one (its files are hard-linked into dist/latest/, so it costs no extra
 * disk) plus 1 previous build.
 */
export const KEEP_BUILDS = 2;

/** Keeps the `keep` newest builds; returns the new history and the archive folders that fall out of it. */
export function rotateBuilds(
  history: readonly HistoryEntry[],
  keep: number = KEEP_BUILDS,
): { history: HistoryEntry[]; remove: string[] } {
  return { history: history.slice(0, keep), remove: history.slice(keep).map((h) => h.dir) };
}

/**
 * State after a finished build. A build without files (it failed completely) never becomes latest/ and is not recorded in
 * the history; otherwise the entry goes first (a rebuild of the same commit replaces the old entry).
 */
export function recordBuild(state: BuildState, info: BuildInfo): BuildState {
  const lastSuccess = successOf(state.lastSuccess, info);
  if (info.files.length === 0) return { lastSuccess, history: state.history };
  const entry: HistoryEntry = { commit: info.commit, date: info.date, dir: info.archiveDir };
  return { lastSuccess, history: [entry, ...state.history.filter((h) => h.commit !== info.commit)] };
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
  if (info.ok) return `Build ${info.shortCommit} is ready: dmg + exe in dist/latest`;
  if (info.status === 'partial') {
    const failed = info.stages.filter((s) => s.status === 'failed').map((s) => s.name);
    return `Build ${info.shortCommit} partly failed (${failed.join(', ')}): dist/latest has the rest, see dist/build.log`;
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
  /** The generated assets/ against the last successful build (FIX-8); undefined: not checked. */
  assets?: AssetsStatus;
  distDir: string;
  /** BUILD-INFO.json of dist/latest/ (null: no latest/ yet). */
  latest: BuildInfo | null;
  /** The newest attempt, also one that failed completely and never became latest/. */
  attempt: BuildInfo | null;
  /** Folder names in dist/archive/. */
  archive: string[];
  /** Loose files of the old flat layout are still in dist/ (the next dist:all moves them). */
  flatLayout: boolean;
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
  const assetsOutdated = s.assets === 'changed' || s.assets === 'unrecorded-newer';
  if (s.headCommit !== null) {
    const head = shortHash(s.headCommit);
    if (s.state.lastSuccess?.commit === s.headCommit) {
      lines.push(
        assetsOutdated
          ? `main (${head}): same commit as the build, but the generated assets changed: a build is needed`
          : `main (${head}): up to date`,
      );
    } else if (s.changedSinceBuild === null) {
      lines.push(`main (${head}): differs from the last build (changes unknown): a build is needed`);
    } else if (needsBuild(s.changedSinceBuild)) {
      lines.push(`main (${head}): BEHIND, the build is outdated (src/electron/tools/extract... changed)`);
    } else if (assetsOutdated) {
      lines.push(`main (${head}): BEHIND, the generated assets changed since the build: a build is needed`);
    } else {
      lines.push(`main (${head}): ahead of the build, but only docs/tests/tools changed: no build needed`);
    }
  }
  if (s.assets === 'same') {
    lines.push('assets/: same content as in the last build');
  } else if (s.assets === 'changed') {
    lines.push('assets/: CHANGED since the last build (npm run extract?): run npm run dist:all');
  } else if (s.assets === 'unrecorded-newer') {
    lines.push('assets/: files are newer than the last build, whose fingerprint was not recorded: assume changed, run npm run dist:all');
  } else if (s.assets === 'unrecorded') {
    lines.push('assets/: older than the last build; its fingerprint is recorded at the next build check (counted as up to date)');
  }
  if (s.latest !== null) {
    lines.push(`${s.distDir}/latest: commit ${s.latest.shortCommit} (${s.latest.status}), built ${s.latest.date}`);
    for (const f of s.latest.files) {
      lines.push(`  ${f.kind.padEnd(12)} ${s.distDir}/latest/${f.latestName} (${(f.bytes / 1048576).toFixed(1)} MB)`);
    }
    for (const st of s.latest.stages) {
      if (st.status !== 'ok' && PLATFORM_STAGES.includes(st.name)) {
        lines.push(`  ${st.name}: ${st.status}, absent from latest${st.error !== undefined ? ` (${st.error})` : ''}`);
      }
    }
  } else {
    lines.push(`${s.distDir}/latest: none yet (run npm run dist:all)`);
  }
  if (s.attempt !== null && (s.latest === null || s.attempt.commit !== s.latest.commit)) {
    lines.push(
      `latest attempt: ${s.attempt.shortCommit} ${s.attempt.status} in ${formatDuration(s.attempt.durationMs)} (${s.attempt.stages
        .map((st) => `${st.name}=${st.status}`)
        .join(', ')}); it is not in latest/`,
    );
  }
  if (s.archive.length > 0) lines.push(`archive: ${s.archive.join(', ')} (${s.distDir}/archive)`);
  if (s.flatLayout) lines.push('note: loose files of the old flat layout are still in dist/; the next dist:all moves them');
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
