// The layout of dist/ (T5.5):
//
//   dist/latest/            the newest build under stable names, hard links of the files in archive/ (+ BUILD-INFO.json)
//   dist/archive/<date>-<hash>/   builds with their original hash-named files (the newest + 1 previous one)
//   dist/build.log          rotated, the last ~1 MB
//   dist/.state/            lock, queue, state and scratch folders, hidden from the user's view
//
// File-system side of it, free of electron-builder and git so that it is unit-testable: filling latest/ atomically,
// rotating archive/, recovering after a crash, moving the loose files of the old flat layout (T5.3) into the new places
// and trimming the log. dist-all.ts calls it.
import {
  closeSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { DistPaths } from './dist-env';
import {
  ARCHIVE_DIR_RE,
  type BuildFile,
  type BuildInfo,
  type BuildState,
  EMPTY_STATE,
  type HistoryEntry,
  KEEP_BUILDS,
  type StageResult,
  archiveDirName,
  lockIsActive,
  makeBuildInfo,
  parseArtifactName,
  readJson,
  rotateBuilds,
  writeJsonAtomic,
} from './dist-lib';

export type LinkFn = (existingPath: string, newPath: string) => void;

/** A hard link (no second copy on disk); a plain copy if the file system refuses links. */
export function linkOrCopy(src: string, dest: string, link: LinkFn = linkSync): 'link' | 'copy' {
  rmSync(dest, { force: true });
  try {
    link(src, dest);
    return 'link';
  } catch {
    copyFileSync(src, dest);
    return 'copy';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// latest/
// ---------------------------------------------------------------------------------------------------------------

/** After a crash between the two renames of a swap: puts the replaced latest/ back; drops scratch leftovers. */
export function recoverLatest(paths: DistPaths): void {
  if (!existsSync(paths.latest) && existsSync(paths.latestOld)) renameSync(paths.latestOld, paths.latest);
  rmSync(paths.latestOld, { recursive: true, force: true });
  rmSync(paths.latestNext, { recursive: true, force: true });
}

/**
 * Replaces latest/ by latest.next/ (prepared next to it, on the same volume). A reader sees either the old complete set or
 * the new complete set; between the two renames (microseconds) latest/ does not exist.
 */
export function swapLatest(paths: DistPaths): void {
  rmSync(paths.latestOld, { recursive: true, force: true });
  if (existsSync(paths.latest)) renameSync(paths.latest, paths.latestOld);
  renameSync(paths.latestNext, paths.latest);
  rmSync(paths.latestOld, { recursive: true, force: true });
}

/**
 * Makes dist/latest/ the build `info` describes: hard links of its files in archive/<archiveDir>/ under the stable names,
 * plus BUILD-INFO.json. latest/ never mixes commits: it is replaced as a whole, a platform that failed is simply absent.
 * Returns how each file got there.
 */
export function publishLatest(paths: DistPaths, info: BuildInfo, link: LinkFn = linkSync): Array<'link' | 'copy'> {
  recoverLatest(paths);
  mkdirSync(paths.latestNext, { recursive: true });
  const how: Array<'link' | 'copy'> = [];
  for (const f of info.files) {
    how.push(linkOrCopy(join(paths.archive, info.archiveDir, f.name), join(paths.latestNext, f.latestName), link));
  }
  writeJsonAtomic(join(paths.latestNext, 'BUILD-INFO.json'), info);
  swapLatest(paths);
  return how;
}

// ---------------------------------------------------------------------------------------------------------------
// archive/
// ---------------------------------------------------------------------------------------------------------------

/** Folders of builds in dist/archive/, newest first (the names start with the date). Anything else there is not ours. */
export function listArchive(paths: DistPaths): string[] {
  try {
    return readdirSync(paths.archive)
      .filter((n) => ARCHIVE_DIR_RE.test(n) && statSync(join(paths.archive, n)).isDirectory())
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Removes the build folders (and `.partial` ones of builds that never finished) that are not in `keep`.
 * Folders that do not look like ours are never touched.
 */
export function sweepArchive(paths: DistPaths, keep: readonly string[]): string[] {
  const removed: string[] = [];
  let names: string[];
  try {
    names = readdirSync(paths.archive);
  } catch {
    return removed;
  }
  for (const n of names) {
    const base = n.endsWith('.partial') ? n.slice(0, -'.partial'.length) : n;
    if (!ARCHIVE_DIR_RE.test(base) || keep.includes(n)) continue;
    rmSync(join(paths.archive, n), { recursive: true, force: true });
    removed.push(n);
  }
  return removed;
}

/**
 * Brings a finished build into the layout: the build's folder (hash-named files, written as `<dir>.partial`) becomes
 * archive/<dir>, latest/ is refilled if the build produced anything, the old builds are rotated out. A build that produced
 * nothing is removed and does not touch latest/. Returns the new state and the removed archive folders.
 */
export function finalizeBuild(
  paths: DistPaths,
  info: BuildInfo,
  state: BuildState,
  link: LinkFn = linkSync,
): { state: BuildState; removed: string[] } {
  const partial = join(paths.archive, `${info.archiveDir}.partial`);
  if (info.files.length === 0) {
    rmSync(partial, { recursive: true, force: true });
    writeJsonAtomic(paths.attempt, info);
    const removed = sweepArchive(paths, state.history.map((h) => h.dir));
    return { state: { lastSuccess: state.lastSuccess, history: state.history }, removed };
  }
  writeJsonAtomic(join(partial, 'BUILD-INFO.json'), info);
  const dir = join(paths.archive, info.archiveDir);
  rmSync(dir, { recursive: true, force: true });
  renameSync(partial, dir);
  publishLatest(paths, info, link);
  writeJsonAtomic(paths.attempt, info);

  const entry: HistoryEntry = { commit: info.commit, date: info.date, dir: info.archiveDir };
  const history = [entry, ...state.history.filter((h) => h.commit !== info.commit)];
  const rotated = rotateBuilds(history, KEEP_BUILDS);
  const removed = sweepArchive(paths, rotated.history.map((h) => h.dir));
  return {
    state: { lastSuccess: info.ok ? { commit: info.commit, date: info.date } : state.lastSuccess, history: rotated.history },
    removed,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Migration of the old flat layout (T5.3)
// ---------------------------------------------------------------------------------------------------------------

/** State/internal files of the flat layout that sat in dist/ itself. */
const FLAT_INTERNAL = ['BUILD-INFO.json', '.build-state.json', '.build.lock', '.build.pending'];

function looseFiles(dist: string): string[] {
  try {
    return readdirSync(dist).filter((n) => {
      try {
        return statSync(join(dist, n)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/** True if dist/ still holds loose files of the old flat layout. */
export function hasFlatLayout(dist: string): boolean {
  return looseFiles(dist).some((n) => FLAT_INTERNAL.includes(n) || parseArtifactName(n) !== null);
}

export interface MigrationResult {
  /** archive folders created from loose files. */
  archived: string[];
  /** loose files deleted (older builds, leftovers, internal files of the old layout). */
  removed: string[];
  /** true: a build of the old layout is running, nothing was touched. */
  skipped: boolean;
}

interface Group {
  hash: string;
  version: string;
  files: Array<{ name: string; kind: BuildFile['kind']; bytes: number }>;
  mtimeMs: number;
}

function moveFile(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch {
    copyFileSync(src, dest);
    rmSync(src, { force: true });
  }
}

interface FlatState {
  lastSuccess?: { commit: string; date: string } | null;
  history?: Array<{ commit: string; date: string }>;
}

/**
 * Moves the loose files of the old flat dist/ layout into the new places: the newest build into archive/ (+ latest/), the
 * one before it into archive/, older builds are deleted, together with the internal files of the old layout. Files that
 * do not match the names `dist:all` produced (the user's own) are never touched. Does nothing if there is nothing to move.
 */
export function migrateFlatLayout(paths: DistPaths, link: LinkFn = linkSync): MigrationResult {
  const result: MigrationResult = { archived: [], removed: [], skipped: false };
  if (!hasFlatLayout(paths.dist)) return result;
  if (lockIsActive(join(paths.dist, '.build.lock'))) return { ...result, skipped: true };

  const flatInfo = readJson<BuildInfo | null>(join(paths.dist, 'BUILD-INFO.json'), null);
  const flatState = readJson<FlatState | null>(join(paths.dist, '.build-state.json'), null);
  const flatHistory = flatState?.history;

  const groups = new Map<string, Group>();
  const remove = (name: string): void => {
    rmSync(join(paths.dist, name), { force: true });
    result.removed.push(name);
  };
  for (const name of looseFiles(paths.dist)) {
    const p = parseArtifactName(name);
    if (p === null) continue;
    if (p.partial) {
      remove(name);
      continue;
    }
    const st = statSync(join(paths.dist, name));
    const g = groups.get(p.hash) ?? { hash: p.hash, version: p.version, files: [], mtimeMs: 0 };
    g.files.push({ name, kind: p.kind, bytes: st.size });
    g.mtimeMs = Math.max(g.mtimeMs, st.mtimeMs);
    groups.set(p.hash, g);
  }

  const fullCommit = (hash: string): string => {
    if (flatInfo !== null && flatInfo.commit.startsWith(hash)) return flatInfo.commit;
    return flatHistory?.find((h) => h.commit.startsWith(hash))?.commit ?? hash;
  };
  const dateOf = (g: Group): string => {
    if (flatInfo !== null && flatInfo.commit.startsWith(g.hash)) return flatInfo.date;
    const h = flatHistory?.find((e) => e.commit.startsWith(g.hash));
    return h?.date ?? new Date(g.mtimeMs).toISOString();
  };
  const sorted = [...groups.values()]
    .map((g) => ({ g, date: dateOf(g) }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  for (const { g } of sorted.slice(KEEP_BUILDS)) for (const f of g.files) remove(f.name);

  const state = readJson<BuildState>(paths.state, EMPTY_STATE);
  const migrated: Array<{ entry: HistoryEntry; info: BuildInfo }> = [];
  for (const { g, date } of sorted.slice(0, KEEP_BUILDS)) {
    const commit = fullCommit(g.hash);
    const dir = archiveDirName(new Date(date), commit);
    mkdirSync(join(paths.archive, dir), { recursive: true });
    for (const f of g.files) moveFile(join(paths.dist, f.name), join(paths.archive, dir, f.name));
    const has = (k: BuildFile['kind']): boolean => g.files.some((f) => f.kind === k);
    const stages: StageResult[] =
      flatInfo !== null && flatInfo.commit.startsWith(g.hash)
        ? flatInfo.stages
        : [
            { name: 'mac', status: has('mac') ? 'ok' : 'failed', ms: 0, ...(has('mac') ? {} : { error: 'missing in the old flat layout' }) },
            {
              name: 'win',
              status: has('win-setup') && has('win-portable') ? 'ok' : 'failed',
              ms: 0,
              ...(has('win-setup') && has('win-portable') ? {} : { error: 'missing in the old flat layout' }),
            },
          ];
    const info = makeBuildInfo({
      commit,
      date,
      version: g.version,
      stages,
      files: g.files.map((f) => ({ kind: f.kind, name: f.name, bytes: f.bytes })),
      durationMs: flatInfo !== null && flatInfo.commit.startsWith(g.hash) ? flatInfo.durationMs : 0,
      archiveDir: dir,
      note: 'moved from the old flat dist/ layout',
    });
    writeJsonAtomic(join(paths.archive, dir, 'BUILD-INFO.json'), info);
    migrated.push({ entry: { commit, date, dir }, info });
    result.archived.push(dir);
  }

  const history = [...migrated.map((m) => m.entry), ...state.history.filter((h) => !migrated.some((m) => m.entry.commit === h.commit))]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const rotated = rotateBuilds(history, KEEP_BUILDS);
  const lastSuccess =
    state.lastSuccess ??
    flatState?.lastSuccess ??
    (flatInfo !== null && flatInfo.ok ? { commit: flatInfo.commit, date: flatInfo.date } : null);
  mkdirSync(paths.stateDir, { recursive: true });
  writeJsonAtomic(paths.state, { lastSuccess, history: rotated.history });

  // latest/ gets the newest migrated build, unless a build of the new layout already filled it.
  const newest = migrated[0];
  if (newest !== undefined && newest.entry.dir === rotated.history[0]?.dir && !existsSync(paths.latestInfo)) {
    publishLatest(paths, newest.info, link);
  }
  sweepArchive(paths, rotated.history.map((h) => h.dir));

  // Internal files of the old layout: a queued request survives (moved), the rest is dropped.
  for (const n of ['BUILD-INFO.json', '.build-state.json', '.build.lock']) {
    if (existsSync(join(paths.dist, n))) remove(n);
  }
  const oldPending = join(paths.dist, '.build.pending');
  if (existsSync(oldPending)) {
    if (existsSync(paths.pending)) remove('.build.pending');
    else {
      moveFile(oldPending, paths.pending);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// build.log
// ---------------------------------------------------------------------------------------------------------------

export const LOG_TRIM_ABOVE = 1.5 * 1024 * 1024;
export const LOG_KEEP = 1024 * 1024;

/**
 * Keeps dist/build.log at about 1 MB: above 1.5 MB only the last 1 MB (from a line start) is kept. The file is truncated and
 * rewritten in place, so a detached build that already has it open for appending keeps writing to the same file.
 */
export function rotateLog(logPath: string, trimAbove: number = LOG_TRIM_ABOVE, keep: number = LOG_KEEP): boolean {
  let size: number;
  try {
    size = statSync(logPath).size;
  } catch {
    return false;
  }
  if (size <= trimAbove) return false;
  const buf = Buffer.alloc(keep);
  const fd = openSync(logPath, 'r');
  try {
    readSync(fd, buf, 0, keep, size - keep);
  } finally {
    closeSync(fd);
  }
  const nl = buf.indexOf(0x0a);
  const tail = nl >= 0 && nl < keep - 1 ? buf.subarray(nl + 1) : buf;
  writeFileSync(logPath, tail);
  return true;
}
