// `npm run dist:all`: builds the macOS dmg (arm64) and the Windows Setup + portable (x64) of one commit into dist/ (T5.3).
//
// - Builds the COMMITTED state: `git archive <commit>` into a temporary folder (node_modules, assets, vendor, build,
//   reference are symlinks to this checkout, like in the agents' worktrees). The working copy may be dirty or move on
//   (another merge) while the build runs: it does not matter. Nothing is built from uncommitted files.
// - One build at a time (dist/.build.lock); a request that arrives meanwhile waits in a single "pending" slot, several
//   requests coalesce into one extra build (dist-lib.ts: processQueue).
// - Output names carry the version and the short commit hash (BUILD_ID, electron-builder.yml). dist/BUILD-INFO.json
//   describes the build; the 2 newest builds are kept, older ones are deleted.
// - Layout of dist/ (T5.5, dist-layout.ts): the files are produced into dist/archive/<date>-<hash>/ with their hash names,
//   then dist/latest/ is refilled (atomically) with hard links to them under stable names. The loose files of the old
//   flat layout are moved into the new places on the first run.
// - A failure of one platform does not erase the other one's result.
//
// Usage:
//   tsx tools/build/dist-all.ts                  manual: build HEAD now (or queue it behind the running build)
//   tsx tools/build/dist-all.ts --commit <rev>   manual: build that commit
//   tsx tools/build/dist-all.ts --trigger [--commit <rev>]   from the post-merge hook: only if src/, electron/..., tools/extract
//                                                or the generated assets/ (fingerprint, FIX-8) changed since the last good build;
//                                                also the manual way to "build if needed" after `npm run extract`
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  type BuildFile,
  type BuildInfo,
  type BuildRequest,
  type BuildState,
  type StageResult,
  EMPTY_STATE,
  archiveDirName,
  classifyArtifact,
  enqueue,
  formatDuration,
  makeBuildInfo,
  notificationFor,
  processQueue,
  readJson,
  releaseLock,
  shortHash,
  writeJsonAtomic,
} from './dist-lib';
import { adoptAssetsFingerprint, assetsFingerprint, evaluateBuild } from './dist-assets';
import { type DistPaths, cleanGitEnv, distPaths, git, resolveCommit } from './dist-env';
import { finalizeBuild, migrateFlatLayout, recoverLatest, rotateLog, sweepArchive } from './dist-layout';

/** Folders of this checkout that the temporary build folder links to instead of copying (they are not in git or are huge). */
const SHARED_DIRS = ['node_modules', 'assets', 'vendor', 'build', 'reference'];

// ---------------------------------------------------------------------------------------------------------------
// Logging (to stdout; the hook redirects stdout to dist/build.log, an interactive run is tee'd into it)
// ---------------------------------------------------------------------------------------------------------------

let teeLog: string | null = null;

function write(text: string): void {
  process.stdout.write(text);
  if (teeLog !== null) {
    try {
      appendFileSync(teeLog, text);
    } catch {
      // the log is best effort
    }
  }
}

function log(msg: string): void {
  write(`[dist ${new Date().toISOString()}] ${msg}\n`);
}

/** Runs a command, streaming its output into the log. Resolves with the exit code. */
function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d: Buffer) => write(d.toString()));
    child.stderr.on('data', (d: Buffer) => write(d.toString()));
    child.on('error', (e) => {
      write(`spawn ${cmd} failed: ${e.message}\n`);
      done(127);
    });
    child.on('close', (code) => done(code ?? 1));
  });
}

async function runOrThrow(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  log(`$ ${cmd} ${args.join(' ')}`);
  const code = await run(cmd, args, cwd, env);
  if (code !== 0) throw new Error(`${cmd} ${args[0] ?? ''} exited with ${code}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------------------------------------------

export function notify(message: string): void {
  if (process.platform !== 'darwin') return;
  // The text goes in as osascript arguments, never spliced into the script: no quoting problems.
  spawnSync(
    'osascript',
    [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 1 of argv) with title (item 2 of argv)',
      '-e',
      'end run',
      message,
      'Alien Transporter',
    ],
    { stdio: 'ignore' },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// One build
// ---------------------------------------------------------------------------------------------------------------

/** Moves a file within a volume, copies it across volumes. Written under a temporary name first. */
function moveInto(src: string, dest: string): void {
  const part = `${dest}.partial`;
  rmSync(part, { force: true });
  try {
    renameSync(src, part);
  } catch {
    copyFileSync(src, part);
    unlinkSync(src);
  }
  renameSync(part, dest);
}

function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
  } catch {
    return [];
  }
}

/** Extracts the committed tree of `commit` into `work` and links the shared folders. */
async function prepareWorkTree(paths: DistPaths, commit: string, work: string): Promise<void> {
  const archive = spawnSync('git', ['archive', '--format=tar', commit], {
    cwd: paths.root,
    env: cleanGitEnv(),
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (archive.status !== 0) throw new Error(`git archive ${commit} failed: ${String(archive.stderr)}`);
  const tar = spawnSync('tar', ['-x', '-C', work], { input: archive.stdout });
  if (tar.status !== 0) throw new Error(`tar extraction failed: ${String(tar.stderr)}`);
  for (const name of SHARED_DIRS) {
    const target = join(paths.root, name);
    const link = join(work, name);
    if (!existsSync(target)) continue;
    let occupied = true;
    try {
      lstatSync(link);
    } catch {
      occupied = false;
    }
    if (!occupied) symlinkSync(realpathSync(target), link);
  }
}

/** Removes the temporary folder. The symlinks are unlinked first so nothing of the shared folders can be touched. */
function removeWorkTree(work: string): void {
  for (const name of SHARED_DIRS) {
    const link = join(work, name);
    try {
      if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
    } catch {
      // not there
    }
  }
  rmSync(work, { recursive: true, force: true });
}

export async function buildCommit(paths: DistPaths, commit: string): Promise<BuildInfo> {
  const startedAt = Date.now();
  const id = shortHash(commit);
  const archiveDir = archiveDirName(new Date(startedAt), commit);
  // Hash-named files are produced here; finalizeBuild turns it into archive/<archiveDir> and refills latest/.
  const partialDir = join(paths.archive, `${archiveDir}.partial`);
  const stages: StageResult[] = [];
  const files: Array<Omit<BuildFile, 'latestName'>> = [];
  let version = '?';
  let work: string | null = null;

  const stage = async (name: string, fn: () => Promise<void>): Promise<boolean> => {
    const t = Date.now();
    log(`--- stage ${name}: start`);
    try {
      await fn();
      stages.push({ name, status: 'ok', ms: Date.now() - t });
      log(`--- stage ${name}: ok (${formatDuration(Date.now() - t)})`);
      return true;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      stages.push({ name, status: 'failed', ms: Date.now() - t, error });
      log(`--- stage ${name}: FAILED (${formatDuration(Date.now() - t)}): ${error}`);
      return false;
    }
  };
  const skip = (name: string, why: string): void => {
    stages.push({ name, status: 'skipped', ms: 0, error: why });
    log(`--- stage ${name}: skipped (${why})`);
  };

  const env: NodeJS.ProcessEnv = { ...cleanGitEnv(), BUILD_ID: id, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
  const stageDirs: string[] = [];
  // FIX-8: the assets are taken at the start; if they change while the build runs, the next comparison sees the difference.
  const assets = assetsFingerprint(paths.root, paths.assetsCache);
  if (assets !== null) log(`assets/ fingerprint ${assets.fingerprint.slice(0, 12)} (${assets.files} files, ${assets.hashed} hashed)`);
  try {
    const ready = await stage('prepare', async () => {
      if (!existsSync(join(paths.root, 'assets', 'manifest.json'))) {
        throw new Error('assets/manifest.json is missing: run `npm run extract` first');
      }
      work = mkdtempSync(join(tmpdir(), `at-dist-${id}-`));
      await prepareWorkTree(paths, commit, work);
      version = (JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')) as { version: string }).version;
      // Icons are generated from the assets, not committed; no extraction here (assets/ is shared and already extracted).
      await runOrThrow(
        join(work, 'node_modules', '.bin', 'tsx'),
        ['tools/build/prepack.ts', '--mac', '--win', '--no-extract'],
        work,
        env,
      );
    });
    let built = false;
    if (ready && work !== null) {
      const w: string = work;
      built = await stage('vite', () => runOrThrow('npm', ['run', 'build'], w, env));
      const builder = join(w, 'node_modules', '.bin', 'electron-builder');
      const platform = async (name: 'mac' | 'win', args: string[]): Promise<void> => {
        if (!built) return skip(name, 'vite build failed');
        if (name === 'mac' && process.platform !== 'darwin') return skip(name, 'the dmg needs macOS');
        const out = join(w, `stage-${name}`);
        stageDirs.push(out);
        await stage(name, async () => {
          // `--publish never`: nothing is uploaded, whatever electron-builder's CI detection thinks.
          await runOrThrow(builder, [...args, '--publish', 'never', `-c.directories.output=${out}`], w, env);
          mkdirSync(partialDir, { recursive: true });
          let n = 0;
          for (const f of listFiles(out)) {
            const kind = classifyArtifact(f, id);
            if (kind === null) continue;
            moveInto(join(out, f), join(partialDir, f));
            files.push({ kind, name: f, bytes: statSync(join(partialDir, f)).size });
            n++;
          }
          if (n === 0) throw new Error(`electron-builder produced no deliverable with "-${id}" in its name`);
        });
      };
      await platform('mac', ['--mac', '--arm64']);
      await platform('win', ['--win', '--x64']);
    }
  } finally {
    if (work !== null) {
      try {
        removeWorkTree(work);
      } catch (e) {
        log(`could not remove ${work}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const info = makeBuildInfo({
    commit,
    date: new Date().toISOString(),
    version,
    stages,
    files,
    durationMs: Date.now() - startedAt,
    archiveDir,
    ...(assets !== null ? { assets: assets.fingerprint } : {}),
  });
  finishBuild(paths, info);
  return info;
}

/** Archive folder + latest/ (hard links), BUILD-INFO.json, state, rotation of old builds, the notification. */
function finishBuild(paths: DistPaths, info: BuildInfo): void {
  mkdirSync(paths.stateDir, { recursive: true });
  const done = finalizeBuild(paths, info, readJson<BuildState>(paths.state, EMPTY_STATE));
  writeJsonAtomic(paths.state, done.state);
  for (const d of done.removed) log(`rotation: removed archive/${d}`);
  log(`build ${info.shortCommit}: ${info.status} in ${formatDuration(info.durationMs)}`);
  for (const f of info.files) {
    log(`  ${paths.latest}/${f.latestName} <- archive/${info.archiveDir}/${f.name} (${(f.bytes / 1048576).toFixed(1)} MB)`);
  }
  if (info.files.length === 0) log('nothing was produced: dist/latest is left as it was');
  notify(notificationFor(info));
}

/** Housekeeping at the start of a build (under the lock): the old flat layout, a crashed latest/ swap, build folders that never finished. */
function tidyDist(paths: DistPaths): void {
  const m = migrateFlatLayout(paths);
  if (m.skipped) log('migration of the old flat dist/ layout skipped: an old-layout build is still running');
  else if (m.archived.length > 0 || m.removed.length > 0) {
    log(`migrated the old flat dist/ layout: archived ${m.archived.join(', ') || 'nothing'}; removed ${m.removed.join(', ') || 'nothing'}`);
  }
  recoverLatest(paths);
  const state = readJson<BuildState>(paths.state, EMPTY_STATE);
  for (const d of sweepArchive(paths, state.history.map((h) => h.dir))) log(`removed stale archive/${d}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------------------------------

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const root = process.cwd();
  const paths = distPaths(root);
  mkdirSync(paths.stateDir, { recursive: true });
  rotateLog(paths.log);
  const trigger = process.argv.includes('--trigger');
  if (process.stdout.isTTY === true) teeLog = paths.log;

  const commit = resolveCommit(root, argValue('--commit') ?? 'HEAD');
  if (commit === null) {
    log('cannot resolve the commit to build');
    return 1;
  }
  const dirty = git(root, ['status', '--porcelain']);
  if (dirty !== null && dirty !== '' && !trigger) {
    log('note: the working copy has uncommitted changes; they are NOT in the build (the build is of the committed state)');
  }
  log(`${trigger ? 'trigger' : 'manual run'}: commit ${shortHash(commit)}`);

  const req: BuildRequest = { commit, force: !trigger, requestedAt: new Date().toISOString() };
  enqueue(paths.pending, req);

  const onSignal = (): never => {
    releaseLock(paths.lock, process.pid);
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const result = await processQueue(
    { lock: paths.lock, pending: paths.pending },
    {
      pid: process.pid,
      log,
      shouldBuild: (r) => {
        if (r.force) return true;
        const state = readJson<BuildState>(paths.state, EMPTY_STATE);
        // FIX-8: the sources (git diff) and the generated assets (fingerprint of assets/, not in git) both count.
        const { decision } = evaluateBuild(paths, state, r.commit);
        log(`${shortHash(r.commit)}: ${decision.build ? 'build needed' : 'no build'}: ${decision.reason}`);
        // Migration of a build made before the fingerprint existed: record it, do not rebuild.
        adoptAssetsFingerprint(paths, state, decision);
        return decision.build;
      },
      build: async (r) => {
        tidyDist(paths);
        log(`building ${shortHash(r.commit)}`);
        await buildCommit(paths, r.commit);
      },
    },
  );
  if (result.busy) log(`queued ${shortHash(commit)}: it is built right after the running build`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('dist-all.ts')) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      log(`dist:all crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      notify('Build failed: see dist/build.log');
      process.exit(1);
    },
  );
}
