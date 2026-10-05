// Unit tests of the local auto builds (T5.3): pure logic only, electron-builder is never started.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adoptAssetsFingerprint, assetsFingerprint, evaluateBuild } from './dist-assets';
import type { DistPaths } from './dist-env';
import { distPaths } from './dist-env';
import {
  type LinkFn,
  finalizeBuild,
  hasFlatLayout,
  linkOrCopy,
  listArchive,
  migrateFlatLayout,
  recoverLatest,
  rotateLog,
  sweepArchive,
} from './dist-layout';
import {
  ARCHIVE_DIR_RE,
  type ArtifactKind,
  type BuildInfo,
  type BuildRequest,
  type BuildState,
  EMPTY_STATE,
  STABLE_NAMES,
  type StatusInput,
  acquireLock,
  archiveDirName,
  classifyArtifact,
  compareAssets,
  decideBuild,
  enqueue,
  formatStatus,
  lockIsActive,
  makeBuildInfo,
  needsBuild,
  notificationFor,
  parseArtifactName,
  type QueueDeps,
  peekPending,
  processQueue,
  readLock,
  recordBuild,
  releaseLock,
  resolveBuildId,
  rotateBuilds,
  shortHash,
  successOf,
  takePending,
} from './dist-lib';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'at-dist-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const req = (commit: string, force = false): BuildRequest => ({ commit, force, requestedAt: '2026-01-01T00:00:00Z' });

function info(commit: string, files: string[], ok = true, archiveDir = ''): BuildInfo {
  return makeBuildInfo({
    commit,
    date: '2026-01-01T00:00:00Z',
    version: '0.1.0',
    stages: [
      { name: 'mac', status: ok ? 'ok' : 'failed', ms: 10 },
      { name: 'win', status: 'ok', ms: 20 },
    ],
    files: files.map((name) => ({ kind: 'mac', name, bytes: 100 })),
    durationMs: 30,
    archiveDir,
  });
}

describe('needsBuild (path filter)', () => {
  it('builds for game code, electron, resources and build configuration', () => {
    for (const f of [
      'src/game/Foo.ts',
      'electron/main.ts',
      'resources/icon.png',
      'package.json',
      'package-lock.json',
      'electron-builder.yml',
      'index.html',
      'electron.vite.config.ts',
    ]) {
      expect(needsBuild(['docs/x.md', f]), f).toBe(true);
    }
  });

  it('does not build for docs, tests, tools, .claude and look-alike names', () => {
    expect(needsBuild([])).toBe(false);
    expect(needsBuild(['docs/05.md', 'tests/unit/a.test.ts', 'tools/build/x.ts', '.claude/skills/x', 'README.md'])).toBe(false);
    expect(needsBuild(['docs/src/x.md', 'tools/src/y.ts', 'xpackage.json', 'src-old/a.ts'])).toBe(false);
  });
});

describe('names', () => {
  it('shortHash and BUILD_ID', () => {
    expect(shortHash('0123456789abcdef\n')).toBe('0123456');
    expect(resolveBuildId('abc1234', 'ffffffffff')).toBe('abc1234');
    expect(resolveBuildId(undefined, '0123456789abcdef')).toBe('0123456');
    expect(resolveBuildId('  ', null)).toBe('dev');
  });

  it('classifies deliverables of this build only', () => {
    const id = 'abc1234';
    expect(classifyArtifact(`Alien Transporter Remaster-0.1.0-${id}-arm64.dmg`, id)).toBe('mac');
    expect(classifyArtifact(`Alien Transporter Remaster Setup 0.1.0-${id}.exe`, id)).toBe('win-setup');
    expect(classifyArtifact(`Alien Transporter Remaster 0.1.0-${id}.exe`, id)).toBe('win-portable');
    expect(classifyArtifact(`Alien Transporter Remaster Setup 0.1.0-${id}.exe.blockmap`, id)).toBeNull();
    expect(classifyArtifact('Alien Transporter Remaster-0.1.0-oldold1-arm64.dmg', id)).toBeNull();
    expect(classifyArtifact('builder-debug.yml', id)).toBeNull();
  });
});

describe('BUILD-INFO and state', () => {
  it('derives ok / partial / failed from the stages', () => {
    expect(info('a'.repeat(40), ['x.dmg']).status).toBe('ok');
    const partial = info('a'.repeat(40), ['x.dmg'], false);
    expect(partial.ok).toBe(false);
    expect(partial.status).toBe('partial');
    const failed = makeBuildInfo({
      commit: 'b'.repeat(40),
      date: 'd',
      version: '1',
      stages: [
        { name: 'prepare', status: 'failed', ms: 1, error: 'assets missing' },
        { name: 'mac', status: 'skipped', ms: 0 },
        { name: 'win', status: 'skipped', ms: 0 },
      ],
      files: [],
      durationMs: 1,
    });
    expect(failed.status).toBe('failed');
    expect(failed.shortCommit).toBe('bbbbbbb');
  });

  it('lastSuccess moves only on a fully successful build; a rebuild replaces its history entry', () => {
    let s = recordBuild(EMPTY_STATE, info('a'.repeat(40), ['a.dmg'], true, 'dir-a'));
    expect(s.lastSuccess?.commit).toBe('a'.repeat(40));
    s = recordBuild(s, info('b'.repeat(40), ['b.dmg'], false, 'dir-b'));
    expect(s.lastSuccess?.commit).toBe('a'.repeat(40));
    expect(s.history.map((h) => h.commit)).toEqual(['b'.repeat(40), 'a'.repeat(40)]);
    s = recordBuild(s, info('a'.repeat(40), ['a2.dmg'], true, 'dir-a2'));
    expect(s.history.map((h) => h.dir)).toEqual(['dir-a2', 'dir-b']);
  });

  it('a build that produced nothing is not recorded in the history (it never becomes latest)', () => {
    const s0 = recordBuild(EMPTY_STATE, info('a'.repeat(40), ['a.dmg'], true, 'dir-a'));
    const s1 = recordBuild(s0, info('b'.repeat(40), [], false, 'dir-b'));
    expect(s1.history.map((h) => h.dir)).toEqual(['dir-a']);
    expect(s1.lastSuccess?.commit).toBe('a'.repeat(40));
  });

  it('rotation keeps the 2 newest builds (latest + 1 previous) and lists the archive folders to delete', () => {
    const h = ['c', 'b', 'a', 'z'].map((c, i) => ({ commit: c, date: String(i), dir: `dir-${c}` }));
    const r = rotateBuilds(h);
    expect(r.history.map((e) => e.commit)).toEqual(['c', 'b']);
    expect(r.remove).toEqual(['dir-a', 'dir-z']);
    expect(rotateBuilds(h.slice(0, 2)).remove).toEqual([]);
  });

  it('notification texts', () => {
    expect(notificationFor(info('a'.repeat(40), ['a.dmg']))).toBe('Build aaaaaaa is ready: dmg + exe in dist/latest');
    expect(notificationFor(info('a'.repeat(40), ['a.dmg'], false))).toContain('partly failed (mac)');
    const failed = makeBuildInfo({ commit: 'a'.repeat(40), date: 'd', version: '1', stages: [{ name: 'prepare', status: 'failed', ms: 1 }], files: [], durationMs: 1 });
    expect(notificationFor(failed)).toBe('Build failed: see dist/build.log');
  });

  it('status text: running, behind, up to date, latest/ paths', () => {
    const base: StatusInput = {
      running: null,
      pending: null,
      state: recordBuild(EMPTY_STATE, info('a'.repeat(40), ['a.dmg'])),
      headCommit: 'b'.repeat(40),
      changedSinceBuild: ['src/a.ts'],
      distDir: '/d',
      latest: info('a'.repeat(40), ['a.dmg']),
      attempt: info('a'.repeat(40), ['a.dmg']),
      archive: ['2026-01-01_0000-aaaaaaa'],
      flatLayout: false,
    };
    expect(formatStatus(base)).toContain('BEHIND');
    expect(formatStatus({ ...base, changedSinceBuild: ['docs/a.md'] })).toContain('no build needed');
    expect(formatStatus({ ...base, headCommit: 'a'.repeat(40) })).toContain('up to date');
    const running = formatStatus({ ...base, running: { pid: 42, startedAt: 'now' }, pending: req('c'.repeat(40)) });
    expect(running).toContain('RUNNING (pid 42');
    expect(running).toContain('queued: ccccccc');
    expect(running).toContain('/d/latest/Alien-Transporter-Remaster-mac-arm64.dmg');
    expect(running).toContain('/d/latest: commit aaaaaaa (ok)');
    expect(running).toContain('archive: 2026-01-01_0000-aaaaaaa');
  });

  it('status text: a platform that failed is absent from latest, a total failure is shown as an attempt', () => {
    const partial = info('a'.repeat(40), ['a.dmg'], false);
    const failed = makeBuildInfo({
      commit: 'b'.repeat(40),
      date: 'd',
      version: '1',
      stages: [{ name: 'prepare', status: 'failed', ms: 1 }],
      files: [],
      durationMs: 1000,
    });
    const text = formatStatus({
      running: null,
      pending: null,
      state: EMPTY_STATE,
      headCommit: null,
      changedSinceBuild: null,
      distDir: '/d',
      latest: partial,
      attempt: failed,
      archive: [],
      flatLayout: true,
    });
    expect(text).toContain('/d/latest: commit aaaaaaa (partial)');
    expect(text).toContain('mac: failed, absent from latest');
    expect(text).toContain('latest attempt: bbbbbbb failed');
    expect(text).toContain('old flat layout');
    expect(formatStatus({ running: null, pending: null, state: EMPTY_STATE, headCommit: null, changedSinceBuild: null, distDir: '/d', latest: null, attempt: null, archive: [], flatLayout: false })).toContain('/d/latest: none yet');
  });
});

describe('lock', () => {
  it('is exclusive and released by its owner only', () => {
    const lock = join(dir, '.build.lock');
    expect(acquireLock(lock, process.pid)).toBe(true);
    expect(acquireLock(lock, 999999)).toBe(false);
    expect(readLock(lock)?.pid).toBe(process.pid);
    releaseLock(lock, 12345); // not ours: stays
    expect(existsSync(lock)).toBe(true);
    releaseLock(lock, process.pid);
    expect(existsSync(lock)).toBe(false);
    expect(acquireLock(lock, process.pid)).toBe(true);
  });

  it('a stale lock (dead pid) does not stick after a crash', () => {
    const lock = join(dir, '.build.lock');
    writeFileSync(lock, JSON.stringify({ pid: 4242, startedAt: new Date().toISOString() }));
    const dead = { isAlive: () => false };
    expect(lockIsActive(lock, dead)).toBe(false);
    expect(acquireLock(lock, process.pid, dead)).toBe(true);
    expect(readLock(lock)?.pid).toBe(process.pid);
  });

  it('a live pid keeps the lock, but only up to the maximum age', () => {
    const lock = join(dir, '.build.lock');
    writeFileSync(lock, JSON.stringify({ pid: 4242, startedAt: '2026-01-01T00:00:00Z' }));
    const alive = { isAlive: () => true, now: () => Date.parse('2026-01-01T01:00:00Z') };
    expect(lockIsActive(lock, alive)).toBe(true);
    expect(acquireLock(lock, 1, alive)).toBe(false);
    const later = { isAlive: () => true, now: () => Date.parse('2026-01-02T00:00:00Z') };
    expect(lockIsActive(lock, later)).toBe(false);
    expect(acquireLock(lock, 1, later)).toBe(true);
  });

  it('an unreadable lock file counts as stale', () => {
    const lock = join(dir, '.build.lock');
    writeFileSync(lock, 'garbage');
    expect(acquireLock(lock, process.pid)).toBe(true);
  });

  it('the real process check: this process is alive, a bogus pid is not', () => {
    const lock = join(dir, '.build.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    expect(lockIsActive(lock)).toBe(true);
    writeFileSync(lock, JSON.stringify({ pid: 2 ** 30, startedAt: new Date().toISOString() }));
    expect(lockIsActive(lock)).toBe(false);
  });
});

describe('queue', () => {
  it('coalesces several requests into one pending slot (newest commit wins, force sticks)', () => {
    const p = join(dir, '.build.pending');
    enqueue(p, req('c1', true));
    enqueue(p, req('c2'));
    enqueue(p, req('c3'));
    expect(peekPending(p)).toMatchObject({ commit: 'c3', force: true });
    expect(takePending(p)?.commit).toBe('c3');
    expect(peekPending(p)).toBeNull();
    expect(takePending(p)).toBeNull();
  });

  it('two quick merges: one active, one deferred, never parallel', async () => {
    const paths = { lock: join(dir, '.build.lock'), pending: join(dir, '.build.pending') };
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    // The lock owner is this process; the "other trigger processes" below see that lock as held by a live process.
    const lockOptions = { isAlive: (pid: number) => pid === process.pid };
    const mk = (pid: number): QueueDeps => ({
      pid,
      lockOptions,
      log: () => undefined,
      shouldBuild: () => true,
      build: async (r) => {
        active++;
        maxActive = Math.max(maxActive, active);
        log.push(`start ${r.commit}`);
        if (r.commit === 'm1') {
          // While build 1 runs, merges 2 and 3 arrive (each one is its own trigger process).
          enqueue(paths.pending, req('m2'));
          expect(await processQueue(paths, mk(2))).toMatchObject({ busy: true, built: [] });
          enqueue(paths.pending, req('m3'));
          expect(await processQueue(paths, mk(3))).toMatchObject({ busy: true, built: [] });
        }
        await new Promise((done) => setTimeout(done, 5));
        log.push(`end ${r.commit}`);
        active--;
      },
    });
    enqueue(paths.pending, req('m1'));
    const res = await processQueue(paths, mk(process.pid));
    expect(maxActive).toBe(1);
    // m1 ran, then ONE deferred build (m2 and m3 coalesced into m3), then nothing.
    expect(res.built).toEqual(['m1', 'm3']);
    expect(log).toEqual(['start m1', 'end m1', 'start m3', 'end m3']);
    expect(existsSync(paths.lock)).toBe(false);
    expect(peekPending(paths.pending)).toBeNull();
  });

  it('skips requests that need no build, and the lock is released when a build crashes', async () => {
    const paths = { lock: join(dir, '.build.lock'), pending: join(dir, '.build.pending') };
    const logs: string[] = [];
    enqueue(paths.pending, req('docs-only'));
    const r1 = await processQueue(paths, {
      pid: process.pid,
      log: (m) => logs.push(m),
      shouldBuild: () => false,
      build: () => {
        throw new Error('must not build');
      },
    });
    expect(r1).toEqual({ busy: false, built: [], skipped: ['docs-only'] });
    expect(existsSync(paths.lock)).toBe(false);

    enqueue(paths.pending, req('boom'));
    const r2 = await processQueue(paths, {
      pid: process.pid,
      log: (m) => logs.push(m),
      shouldBuild: () => true,
      build: () => {
        throw new Error('electron-builder exploded');
      },
    });
    expect(r2.built).toEqual([]);
    expect(logs.join('\n')).toContain('electron-builder exploded');
    expect(existsSync(paths.lock)).toBe(false); // not stuck
  });
});

// ---------------------------------------------------------------------------------------------------------------
// T5.5: the layout of dist/
// ---------------------------------------------------------------------------------------------------------------

const PRODUCT = 'Alien Transporter Remaster';
const hashed = {
  mac: (h: string): string => `${PRODUCT}-0.1.0-${h}-arm64.dmg`,
  'win-setup': (h: string): string => `${PRODUCT} Setup 0.1.0-${h}.exe`,
  'win-portable': (h: string): string => `${PRODUCT} 0.1.0-${h}.exe`,
};
const KINDS: ArtifactKind[] = ['mac', 'win-setup', 'win-portable'];
const commitOf = (h: string): string => h.padEnd(40, '0');

/** Fakes what dist-all does: hash-named files in archive/<dir>.partial, then finalizeBuild. */
function fakeBuild(
  paths: DistPaths,
  state: BuildState,
  hash: string,
  when: Date,
  kinds: ArtifactKind[] = KINDS,
  opts: { link?: LinkFn; assets?: string } = {},
): { info: BuildInfo; state: BuildState; removed: string[] } {
  const archiveDir = archiveDirName(when, commitOf(hash));
  const partial = join(paths.archive, `${archiveDir}.partial`);
  mkdirSync(partial, { recursive: true });
  for (const k of kinds) writeFileSync(join(partial, hashed[k](hash)), `${k} of ${hash}`);
  const failedWin = !(kinds.includes('win-setup') && kinds.includes('win-portable'));
  const i = makeBuildInfo({
    commit: commitOf(hash),
    date: when.toISOString(),
    version: '0.1.0',
    stages: [
      { name: 'mac', status: kinds.includes('mac') ? 'ok' : 'failed', ms: 1 },
      { name: 'win', status: failedWin ? 'failed' : 'ok', ms: 1, ...(failedWin ? { error: 'wine exploded' } : {}) },
    ],
    files: kinds.map((k) => ({ kind: k, name: hashed[k](hash), bytes: `${k} of ${hash}`.length })),
    durationMs: 5,
    archiveDir,
    ...(opts.assets !== undefined ? { assets: opts.assets } : {}),
  });
  const done = finalizeBuild(paths, i, state, opts.link);
  return { info: i, state: done.state, removed: done.removed };
}

const listDir = (d: string): string[] => readdirSync(d).sort();
const STABLE = Object.values(STABLE_NAMES).sort();

describe('dist layout (T5.5)', () => {
  let paths: DistPaths;
  beforeEach(() => {
    paths = distPaths(dir);
    mkdirSync(paths.dist, { recursive: true });
  });

  it('names: stable names have no spaces, archive folders are <date>-<hash>, old artifact names are recognised', () => {
    for (const n of Object.values(STABLE_NAMES)) expect(n).not.toMatch(/\s/);
    expect(STABLE_NAMES).toEqual({
      mac: 'Alien-Transporter-Remaster-mac-arm64.dmg',
      'win-setup': 'Alien-Transporter-Remaster-win-setup.exe',
      'win-portable': 'Alien-Transporter-Remaster-win-portable.exe',
    });
    const d = archiveDirName(new Date(2026, 9, 5, 14, 3), '49ec902ad98be16943f33d9df6b14393521a9c96');
    expect(d).toBe('2026-10-05_1403-49ec902');
    expect(ARCHIVE_DIR_RE.test(d)).toBe(true);
    expect(parseArtifactName(`${PRODUCT}-0.1.0-49ec902-arm64.dmg`)).toMatchObject({ kind: 'mac', hash: '49ec902', version: '0.1.0' });
    expect(parseArtifactName(`${PRODUCT} Setup 0.1.0-49ec902.exe`)).toMatchObject({ kind: 'win-setup', hash: '49ec902' });
    expect(parseArtifactName(`${PRODUCT} 0.1.0-49ec902.exe`)).toMatchObject({ kind: 'win-portable', hash: '49ec902' });
    expect(parseArtifactName(`${PRODUCT} 0.1.0-49ec902.exe.partial`)).toMatchObject({ kind: 'win-portable', partial: true });
    for (const foreign of ['notes.txt', 'My Alien Transporter Remaster 0.1.0-49ec902.exe', `${PRODUCT} 0.1.0-49ec902.exe.blockmap`, 'builder-debug.yml']) {
      expect(parseArtifactName(foreign), foreign).toBeNull();
    }
  });

  it('first build: archive/<date>-<hash> with the hash-named files, latest/ with hard links under stable names, nothing else loose', () => {
    const b = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const dirA = b.info.archiveDir;
    expect(listDir(paths.dist)).toEqual(['.state', 'archive', 'latest']); // .state is hidden internal state
    expect(listDir(paths.archive)).toEqual([dirA]);
    expect(listDir(join(paths.archive, dirA))).toEqual(['BUILD-INFO.json', ...KINDS.map((k) => hashed[k]('aaaaaaa'))].sort());
    expect(listDir(paths.latest)).toEqual(['BUILD-INFO.json', ...STABLE].sort());
    for (const k of KINDS) {
      const a = statSync(join(paths.archive, dirA, hashed[k]('aaaaaaa')));
      const l = statSync(join(paths.latest, STABLE_NAMES[k]));
      expect(l.ino, k).toBe(a.ino); // the same file: the data is stored once
      expect(l.dev).toBe(a.dev);
      expect(l.nlink).toBe(2);
      expect(readFileSync(join(paths.latest, STABLE_NAMES[k]), 'utf8')).toBe(`${k} of aaaaaaa`);
    }
    const written = JSON.parse(readFileSync(join(paths.latest, 'BUILD-INFO.json'), 'utf8')) as BuildInfo;
    expect(written.commit).toBe(commitOf('aaaaaaa'));
    expect(written.files.map((f) => f.latestName).sort()).toEqual(STABLE);
    expect(written.archiveDir).toBe(dirA);
    expect(b.state.history.map((h) => h.dir)).toEqual([dirA]);
    expect(b.state.lastSuccess?.commit).toBe(commitOf('aaaaaaa'));
  });

  it('falls back to copying when hard links are refused', () => {
    const refuse: LinkFn = () => {
      throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
    };
    fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0), KINDS, { link: refuse });
    expect(listDir(paths.latest)).toEqual(['BUILD-INFO.json', ...STABLE].sort());
    expect(statSync(join(paths.latest, STABLE_NAMES.mac)).nlink).toBe(1);
    expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of aaaaaaa');
    expect(linkOrCopy(join(paths.latest, 'BUILD-INFO.json'), join(paths.latest, 'copy.json'), refuse)).toBe('copy');
  });

  it('the swap is atomic: until it happens latest/ is the old complete set, afterwards the new complete set', () => {
    const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const seen: string[][] = [];
    const spy: LinkFn = (src, dest) => {
      // The new set is being prepared (in .state/latest.next): a reader of latest/ must see the old build unchanged.
      seen.push(listDir(paths.latest));
      expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of aaaaaaa');
      expect(dest.startsWith(paths.latest + '/')).toBe(false);
      linkSync(src, dest);
    };
    fakeBuild(paths, s1.state, 'bbbbbbb', new Date(2026, 9, 5, 11, 0), KINDS, { link: spy });
    expect(seen.length).toBe(3);
    for (const names of seen) expect(names).toEqual(['BUILD-INFO.json', ...STABLE].sort());
    expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of bbbbbbb');
    expect((JSON.parse(readFileSync(join(paths.latest, 'BUILD-INFO.json'), 'utf8')) as BuildInfo).commit).toBe(commitOf('bbbbbbb'));
    expect(existsSync(paths.latestNext)).toBe(false);
    expect(existsSync(paths.latestOld)).toBe(false);
  });

  it('recovers latest/ after a crash between the two renames of a swap, and drops scratch folders', () => {
    fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    renameSync(paths.latest, paths.latestOld); // crashed: latest/ gone, the replaced one waits
    mkdirSync(paths.latestNext, { recursive: true });
    writeFileSync(join(paths.latestNext, 'half-written.exe'), 'x');
    recoverLatest(paths);
    expect(listDir(paths.latest)).toEqual(['BUILD-INFO.json', ...STABLE].sort());
    expect(existsSync(paths.latestOld)).toBe(false);
    expect(existsSync(paths.latestNext)).toBe(false);
  });

  it('rotation: a second build keeps exactly one previous build in archive/, a third removes the oldest', () => {
    const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const s2 = fakeBuild(paths, s1.state, 'bbbbbbb', new Date(2026, 9, 5, 11, 0));
    expect(listDir(paths.archive)).toEqual([s1.info.archiveDir, s2.info.archiveDir].sort());
    expect(s2.removed).toEqual([]);
    expect(s2.state.history.map((h) => h.commit)).toEqual([commitOf('bbbbbbb'), commitOf('aaaaaaa')]);
    // latest/ is the newest only: no file of the previous build is left in it
    expect(readFileSync(join(paths.latest, STABLE_NAMES['win-setup']), 'utf8')).toBe('win-setup of bbbbbbb');

    const s3 = fakeBuild(paths, s2.state, 'ccccccc', new Date(2026, 9, 5, 12, 0));
    expect(listDir(paths.archive)).toEqual([s2.info.archiveDir, s3.info.archiveDir].sort());
    expect(s3.removed).toEqual([s1.info.archiveDir]);
    expect(s3.state.history.map((h) => h.dir)).toEqual([s3.info.archiveDir, s2.info.archiveDir]);
    expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of ccccccc');
    // the data of the removed build is gone, the previous build is intact
    expect(existsSync(join(paths.archive, s2.info.archiveDir, hashed.mac('bbbbbbb')))).toBe(true);
    expect(listDir(paths.dist)).toEqual(['.state', 'archive', 'latest']);
  });

  it('a rebuild of the same commit replaces its folder instead of piling up', () => {
    const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const s2 = fakeBuild(paths, s1.state, 'aaaaaaa', new Date(2026, 9, 5, 10, 30));
    expect(listDir(paths.archive)).toEqual([s2.info.archiveDir]);
    expect(s2.state.history).toHaveLength(1);
  });

  it('a failed platform is absent from latest/ and stated in BUILD-INFO.json; latest/ never mixes commits', () => {
    const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const s2 = fakeBuild(paths, s1.state, 'bbbbbbb', new Date(2026, 9, 5, 11, 0), ['mac']);
    expect(listDir(paths.latest)).toEqual(['BUILD-INFO.json', STABLE_NAMES.mac].sort()); // the Windows files of aaaaaaa are NOT carried over
    expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of bbbbbbb');
    const written = JSON.parse(readFileSync(join(paths.latest, 'BUILD-INFO.json'), 'utf8')) as BuildInfo;
    expect(written.status).toBe('partial');
    expect(written.ok).toBe(false);
    expect(written.stages.find((st) => st.name === 'win')).toMatchObject({ status: 'failed', error: 'wine exploded' });
    expect(written.files.map((f) => f.kind)).toEqual(['mac']);
    expect(s2.state.lastSuccess?.commit).toBe(commitOf('aaaaaaa')); // a partial build is not a success
    expect(statSync(join(paths.latest, STABLE_NAMES.mac)).ino).toBe(statSync(join(paths.archive, s2.info.archiveDir, hashed.mac('bbbbbbb'))).ino);
    // the previous complete build stays in archive/
    expect(existsSync(join(paths.archive, s1.info.archiveDir, hashed['win-setup']('aaaaaaa')))).toBe(true);
  });

  it('a build that failed completely leaves latest/ and the archive as they were and leaves no partial files', () => {
    const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const archiveBefore = listDir(paths.archive);
    const s2 = fakeBuild(paths, s1.state, 'bbbbbbb', new Date(2026, 9, 5, 11, 0), []);
    expect(s2.state).toEqual(s1.state);
    expect(listDir(paths.archive)).toEqual(archiveBefore); // the empty .partial folder is gone
    expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of aaaaaaa');
    expect((JSON.parse(readFileSync(paths.attempt, 'utf8')) as BuildInfo).status).toBe('failed');
  });

  it('sweeping removes unfinished build folders but never a folder that is not ours', () => {
    const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
    const stale = '2026-10-05_0900-deadbee.partial';
    mkdirSync(join(paths.archive, stale));
    mkdirSync(join(paths.archive, 'my-own-notes'));
    writeFileSync(join(paths.archive, 'readme.txt'), 'mine');
    expect(sweepArchive(paths, [s1.info.archiveDir])).toEqual([stale]);
    expect(listDir(paths.archive)).toEqual([s1.info.archiveDir, 'my-own-notes', 'readme.txt'].sort());
    expect(listArchive(paths)).toEqual([s1.info.archiveDir]);
  });

  describe('migration of the old flat layout', () => {
    const flatFile = (name: string, content: string, mtime: Date): void => {
      writeFileSync(join(paths.dist, name), content);
      utimesSync(join(paths.dist, name), mtime, mtime);
    };
    const mkFlatBuild = (hash: string, when: Date, kinds: ArtifactKind[] = KINDS): void => {
      for (const k of kinds) flatFile(hashed[k](hash), `${k} of ${hash}`, when);
    };

    it('moves the newest build into archive + latest, keeps one previous, removes older ones, never touches foreign files', () => {
      mkFlatBuild('1111111', new Date(2026, 9, 3, 9, 0));
      mkFlatBuild('2222222', new Date(2026, 9, 4, 9, 0));
      mkFlatBuild('3333333', new Date(2026, 9, 5, 9, 0));
      writeFileSync(join(paths.dist, 'BUILD-INFO.json'), JSON.stringify({ ...info(commitOf('3333333'), []), date: new Date(2026, 9, 5, 9, 0).toISOString() }));
      writeFileSync(join(paths.dist, '.build-state.json'), JSON.stringify({ lastSuccess: { commit: commitOf('3333333'), date: 'd' }, history: [] }));
      writeFileSync(join(paths.dist, '.build.lock'), JSON.stringify({ pid: 2 ** 30, startedAt: new Date().toISOString() })); // dead owner
      writeFileSync(join(paths.dist, 'build.log'), 'log line\n');
      writeFileSync(join(paths.dist, `${hashed.mac('4444444')}.partial`), 'half');
      // the user's own files, including look-alikes
      writeFileSync(join(paths.dist, 'my-notes.txt'), 'mine');
      writeFileSync(join(paths.dist, `${PRODUCT} 0.1.0-3333333.exe.blockmap`), 'mine too');
      writeFileSync(join(paths.dist, 'Alien Transporter copy.dmg'), 'a copy I made');
      mkdirSync(join(paths.dist, 'my-folder'));
      writeFileSync(join(paths.dist, 'my-folder', 'x.txt'), 'x');

      const r = migrateFlatLayout(paths);
      expect(r.skipped).toBe(false);
      expect(r.archived).toHaveLength(2);
      // the older of the three is deleted, the two newest are archived, the newest is also in latest/ (same inode)
      const dirs = listArchive(paths);
      expect(dirs).toHaveLength(2);
      expect(dirs[0]).toMatch(/-3333333$/);
      expect(dirs[1]).toMatch(/-2222222$/);
      expect(listDir(join(paths.archive, dirs[0] as string))).toEqual(['BUILD-INFO.json', ...KINDS.map((k) => hashed[k]('3333333'))].sort());
      expect(listDir(paths.latest)).toEqual(['BUILD-INFO.json', ...STABLE].sort());
      expect(statSync(join(paths.latest, STABLE_NAMES.mac)).ino).toBe(statSync(join(paths.archive, dirs[0] as string, hashed.mac('3333333'))).ino);
      expect(readFileSync(join(paths.latest, STABLE_NAMES['win-portable']), 'utf8')).toBe('win-portable of 3333333');
      // loose in dist/ now: the log, the new folders, hidden state, and ONLY the user's files
      expect(listDir(paths.dist)).toEqual(
        ['.state', 'Alien Transporter copy.dmg', `${PRODUCT} 0.1.0-3333333.exe.blockmap`, 'archive', 'build.log', 'latest', 'my-folder', 'my-notes.txt'].sort(),
      );
      expect(readFileSync(join(paths.dist, 'my-notes.txt'), 'utf8')).toBe('mine');
      expect(readFileSync(join(paths.dist, 'my-folder', 'x.txt'), 'utf8')).toBe('x');
      expect(readFileSync(join(paths.dist, 'build.log'), 'utf8')).toBe('log line\n');
      // the state carries the diff base over and describes the archive
      const st = JSON.parse(readFileSync(paths.state, 'utf8')) as BuildState;
      expect(st.lastSuccess?.commit).toBe(commitOf('3333333'));
      expect(st.history.map((h) => h.dir)).toEqual(dirs);
      expect(st.history[0]?.commit).toBe(commitOf('3333333')); // the full commit from the old BUILD-INFO
      expect(hasFlatLayout(paths.dist)).toBe(false);
      // a second run does nothing
      expect(migrateFlatLayout(paths)).toEqual({ archived: [], removed: [], skipped: false });
    });

    it('works without the old BUILD-INFO/state (dates from file times) and keeps a queued request', () => {
      mkFlatBuild('5555555', new Date(2026, 9, 1, 9, 0));
      mkFlatBuild('6666666', new Date(2026, 9, 2, 9, 0), ['mac', 'win-setup']); // an incomplete build
      writeFileSync(join(paths.dist, '.build.pending'), JSON.stringify(req('c'.repeat(40))));
      const r = migrateFlatLayout(paths);
      expect(r.archived).toHaveLength(2);
      const dirs = listArchive(paths);
      expect(dirs[0]).toMatch(/-6666666$/);
      expect(listDir(paths.latest)).toEqual(['BUILD-INFO.json', STABLE_NAMES.mac, STABLE_NAMES['win-setup']].sort()); // never mixed with 5555555
      const li = JSON.parse(readFileSync(paths.latestInfo, 'utf8')) as BuildInfo;
      expect(li.status).toBe('partial');
      expect(li.note).toContain('flat');
      expect(peekPending(paths.pending)?.commit).toBe('c'.repeat(40));
      expect(existsSync(join(paths.dist, '.build.pending'))).toBe(false);
    });

    it('does nothing while a build of the old layout is still running, and for a dist/ that has nothing to move', () => {
      mkFlatBuild('7777777', new Date(2026, 9, 1, 9, 0));
      writeFileSync(join(paths.dist, '.build.lock'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      expect(migrateFlatLayout(paths)).toEqual({ archived: [], removed: [], skipped: true });
      expect(existsSync(join(paths.dist, hashed.mac('7777777')))).toBe(true);
      expect(existsSync(paths.latest)).toBe(false);

      const empty = distPaths(mkdtempSync(join(dir, 'empty-')));
      mkdirSync(empty.dist);
      writeFileSync(join(empty.dist, 'my-notes.txt'), 'mine');
      expect(migrateFlatLayout(empty)).toEqual({ archived: [], removed: [], skipped: false });
      expect(listDir(empty.dist)).toEqual(['my-notes.txt']);
    });

    it('does not replace a latest/ that a build of the new layout already filled', () => {
      const s1 = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 9, 5, 10, 0));
      writeFileSync(paths.state, JSON.stringify(s1.state));
      mkFlatBuild('8888888', new Date(2026, 9, 1, 9, 0));
      migrateFlatLayout(paths);
      expect(readFileSync(join(paths.latest, STABLE_NAMES.mac), 'utf8')).toBe('mac of aaaaaaa');
      expect(listArchive(paths)).toHaveLength(2);
      expect(listArchive(paths)[0]).toBe(s1.info.archiveDir);
    });
  });

  it('build.log is trimmed to its last ~1 MB, from a line start, only when it grows too large', () => {
    const log = join(dir, 'build.log');
    const line = 'x'.repeat(99) + '\n';
    writeFileSync(log, line.repeat(1000));
    expect(rotateLog(log, 200_000, 50_000)).toBe(false);
    expect(statSync(log).size).toBe(100_000);
    writeFileSync(log, `HEAD\n${line.repeat(3000)}`);
    expect(rotateLog(log, 200_000, 50_000)).toBe(true);
    const kept = readFileSync(log, 'utf8');
    expect(kept.length).toBeLessThanOrEqual(50_000);
    expect(kept.length).toBeGreaterThan(40_000);
    expect(kept.startsWith('x'.repeat(99) + '\n')).toBe(true);
    expect(kept).not.toContain('HEAD');
    expect(rotateLog(join(dir, 'missing.log'))).toBe(false);
  });

  it('dist:open without a finished build only prints a message: nothing is created or opened', () => {
    const tsx = resolve(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');
    const script = resolve(__dirname, 'dist-open.ts');
    const r = spawnSync(tsx, [script], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('does not exist yet');
    expect(existsSync(join(dir, 'dist', 'latest'))).toBe(false);
  });
});

describe('post-merge hook', () => {
  const hook = resolve(__dirname, '..', '..', '.githooks', 'post-merge');

  function git(cwd: string, ...args: string[]): void {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  }

  /** A throw-away repo on `branch` with a fake tsx that records its arguments instead of building. */
  function fakeRepo(top: string, branch: string): string {
    mkdirSync(join(top, 'node_modules', '.bin'), { recursive: true });
    const tsx = join(top, 'node_modules', '.bin', 'tsx');
    writeFileSync(tsx, `#!/bin/sh\necho "$@" > "${join(top, 'tsx-args.txt')}"\n`);
    chmodSync(tsx, 0o755);
    git(top, 'init', '-q', '-b', branch);
    git(top, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    return top;
  }

  function runHook(top: string, env: NodeJS.ProcessEnv = {}): number {
    const t = Date.now();
    const r = spawnSync('sh', [hook], { cwd: top, env: { ...process.env, ...env }, encoding: 'utf8' });
    expect(r.status).toBe(0);
    return Date.now() - t;
  }

  async function argsFile(top: string): Promise<string | null> {
    const f = join(top, 'tsx-args.txt');
    for (let i = 0; i < 50; i++) {
      if (existsSync(f) && readFileSync(f, 'utf8').trim() !== '') return readFileSync(f, 'utf8').trim();
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  it('on main in the main checkout: starts the detached trigger with the merged commit, and returns fast', async () => {
    const top = fakeRepo(join(dir, 'main-copy'), 'main');
    const ms = runHook(top);
    expect(ms).toBeLessThan(1000);
    const args = await argsFile(top);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: top, encoding: 'utf8' }).stdout.trim();
    expect(args).toBe(`tools/build/dist-all.ts --trigger --commit ${head}`);
  });

  it('does nothing on other branches, in agent worktrees, or with AT_NO_AUTOBUILD', async () => {
    const feature = fakeRepo(join(dir, 'feature-copy'), 'feature');
    runHook(feature);
    const agent = fakeRepo(join(dir, '.claude', 'worktrees', 'agent-1'), 'main');
    runHook(agent);
    const muted = fakeRepo(join(dir, 'muted-copy'), 'main');
    runHook(muted, { AT_NO_AUTOBUILD: '1' });
    await new Promise((r) => setTimeout(r, 300));
    for (const t of [feature, agent, muted]) expect(existsSync(join(t, 'tsx-args.txt')), t).toBe(false);
  });

  it('without tsx it only leaves a note in the log and still exits 0', () => {
    const top = fakeRepo(join(dir, 'no-tsx'), 'main');
    rmSync(join(top, 'node_modules'), { recursive: true });
    runHook(top);
    expect(readFileSync(join(top, 'dist', 'build.log'), 'utf8')).toContain('tsx is missing');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// FIX-8: the generated assets/ (not in the repository) and tools/extract/** decide whether a build is needed
// ---------------------------------------------------------------------------------------------------------------

describe('generated assets watch (FIX-8)', () => {
  function writeAsset(root: string, rel: string, content: string): string {
    const p = join(root, 'assets', rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
    return p;
  }

  /** What `npm run extract` does on a re-run: the same bytes are written again (new mtime). */
  function rewriteSame(path: string): void {
    const content = readFileSync(path);
    writeFileSync(path, content);
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);
  }

  /** Runs `git <args>` in `root` with a fixed identity; returns trimmed stdout. */
  function vcs(root: string, ...args: string[]): string {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  }

  function repoWithAssets(): { root: string; paths: DistPaths; c1: string } {
    const root = join(dir, 'repo');
    mkdirSync(root, { recursive: true });
    vcs(root, 'init', '-q', '-b', 'main');
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'docs'));
    mkdirSync(join(root, 'tools', 'extract'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export {};\n');
    writeFileSync(join(root, 'docs', 'a.md'), 'a\n');
    writeFileSync(join(root, 'tools', 'extract', 'x.ts'), 'export {};\n');
    writeAsset(root, 'manifest.json', '{"v":1}');
    writeAsset(root, 'gfx/2x/atlas.png', 'PNG-1');
    vcs(root, 'add', '-A');
    vcs(root, 'commit', '-q', '-m', 'one');
    return { root, paths: distPaths(root), c1: vcs(root, 'rev-parse', 'HEAD') };
  }

  function commitFile(root: string, rel: string, content: string): string {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
    vcs(root, 'add', '-A');
    vcs(root, 'commit', '-q', '-m', `edit ${rel}`);
    return vcs(root, 'rev-parse', 'HEAD');
  }

  it('the path filter: tools/extract/** (not its tests) and what packs the assets trigger a build; other tools and docs do not', () => {
    for (const f of [
      'tools/extract/atlas.ts',
      'tools/extract/groups.json',
      'tools/extract/java/Foo.java',
      'tools/build/prepack.ts',
      'tools/build/make-icon.ts',
      'tools/build/adhocSign.cjs',
    ]) {
      expect(needsBuild(['docs/x.md', f]), f).toBe(true);
    }
    for (const f of [
      'tools/extract/atlas.test.ts',
      'tools/extract/sounds.test.ts',
      'tools/build/dist-lib.ts',
      'tools/build/dist.test.ts',
      'tools/viewer/x.ts',
      'tools/extract-notes.md',
      'docs/02-extraction-pipeline.md',
    ]) {
      expect(needsBuild([f]), f).toBe(false);
    }
  });

  it('fingerprint: depends on the content only; an idempotent re-extract (same bytes, new mtimes) does not change it', () => {
    const root = join(dir, 'fp');
    const a = writeAsset(root, 'gfx/1x/a.png', 'AAAA');
    writeAsset(root, 'data/levels.json', '{"x":1}');
    const cache = join(dir, 'cache.json');
    const f1 = assetsFingerprint(root, cache);
    expect(f1?.files).toBe(2);
    expect(f1?.hashed).toBe(2);
    expect(assetsFingerprint(root, cache)?.fingerprint).toBe(f1?.fingerprint);
    expect(assetsFingerprint(root, cache)?.hashed).toBe(0); // unchanged files are only stat'ed
    rewriteSame(a);
    const again = assetsFingerprint(root, cache);
    expect(again?.fingerprint).toBe(f1?.fingerprint);
    expect(again?.hashed).toBe(1); // re-read because of the new mtime, same hash
    expect((again?.newestMtimeMs ?? 0) > (f1?.newestMtimeMs ?? 0)).toBe(true);
    // without a cache the result is the same
    expect(assetsFingerprint(root)?.fingerprint).toBe(f1?.fingerprint);
  });

  it('fingerprint: changes with any content change, an added, removed or renamed file; null without assets/', () => {
    const root = join(dir, 'fp2');
    const a = writeAsset(root, 'gfx/a.png', 'AAAA');
    const base = assetsFingerprint(root)?.fingerprint;
    writeFileSync(a, 'AAAB'); // same size, different content
    const edited = assetsFingerprint(root)?.fingerprint;
    expect(edited).not.toBe(base);
    const b = writeAsset(root, 'gfx/b.png', 'B');
    const added = assetsFingerprint(root)?.fingerprint;
    expect(added).not.toBe(edited);
    rmSync(b);
    expect(assetsFingerprint(root)?.fingerprint).toBe(edited);
    renameSync(a, join(root, 'assets', 'gfx', 'c.png'));
    expect(assetsFingerprint(root)?.fingerprint).not.toBe(edited);
    expect(assetsFingerprint(join(dir, 'nothing-here'))).toBeNull();
  });

  const fp = { fingerprint: 'new', newestMtimeMs: Date.parse('2026-01-01T00:00:00Z') };
  const last = (assets?: string): { commit: string; date: string; assets?: string } => ({
    commit: 'a'.repeat(40),
    date: '2026-01-02T00:00:00Z',
    ...(assets !== undefined ? { assets } : {}),
  });

  it('decision: sources, tools/extract and the unknown base build; docs-only does not; changed assets build even on the same commit', () => {
    expect(decideBuild({ lastSuccess: null, changed: [], assets: fp }).build).toBe(true);
    expect(decideBuild({ lastSuccess: last('new'), changed: null, assets: fp }).build).toBe(true);
    expect(decideBuild({ lastSuccess: last('new'), changed: ['src/a.ts'], assets: fp }).build).toBe(true);
    expect(decideBuild({ lastSuccess: last('new'), changed: ['tools/extract/groups.json'], assets: fp }).build).toBe(true);
    // docs/tests only, assets the same: no build
    const docs = decideBuild({ lastSuccess: last('new'), changed: ['docs/05.md', 'tools/extract/a.test.ts'], assets: fp });
    expect(docs.build).toBe(false);
    expect(docs.adoptAssets).toBeUndefined();
    // docs only, but the assets were regenerated: build
    const regen = decideBuild({ lastSuccess: last('old'), changed: ['docs/05.md'], assets: fp });
    expect(regen.build).toBe(true);
    expect(regen.reason).toContain('assets');
    // the same commit (no changed files) with regenerated assets: build; with the same assets: no
    expect(decideBuild({ lastSuccess: last('old'), changed: [], assets: fp }).build).toBe(true);
    expect(decideBuild({ lastSuccess: last('new'), changed: [], assets: fp }).build).toBe(false);
    // no assets/ at all: nothing to compare
    expect(decideBuild({ lastSuccess: last('new'), changed: [], assets: null }).build).toBe(false);
  });

  it('migration: a state without a fingerprint is adopted when assets/ is older than the build, rebuilt when it is newer', () => {
    const older = { fingerprint: 'cur', newestMtimeMs: Date.parse('2026-01-01T00:00:00Z') };
    const newer = { fingerprint: 'cur', newestMtimeMs: Date.parse('2026-01-03T00:00:00Z') };
    expect(compareAssets(last(), older)).toBe('unrecorded');
    expect(compareAssets(last(), newer)).toBe('unrecorded-newer');
    expect(compareAssets(last('cur'), newer)).toBe('same');
    expect(compareAssets(last('x'), newer)).toBe('changed');
    expect(compareAssets(last(), null)).toBe('none');

    const adopt = decideBuild({ lastSuccess: last(), changed: [], assets: older });
    expect(adopt).toMatchObject({ build: false, adoptAssets: 'cur' });
    const rebuild = decideBuild({ lastSuccess: last(), changed: ['docs/a.md'], assets: newer });
    expect(rebuild.build).toBe(true);
    expect(rebuild.adoptAssets).toBeUndefined();

    // adoption writes the fingerprint into the stored state and nothing else
    const paths = distPaths(join(dir, 'adopt'));
    const state: BuildState = { lastSuccess: last(), history: [{ commit: 'a'.repeat(40), date: 'd', dir: 'x' }] };
    const next = adoptAssetsFingerprint(paths, state, adopt);
    expect(next?.lastSuccess).toEqual({ ...last(), assets: 'cur' });
    expect(next?.history).toEqual(state.history);
    expect((JSON.parse(readFileSync(paths.state, 'utf8')) as BuildState).lastSuccess?.assets).toBe('cur');
    expect(adoptAssetsFingerprint(paths, state, rebuild)).toBeNull();
  });

  it('state: the fingerprint is stored on success only; a failed or partial build keeps the old one', () => {
    const withAssets = (c: string, assets: string, ok = true): BuildInfo => ({
      ...info(c.repeat(40), ['x.dmg'], ok, `d-${c}`),
      assets,
    });
    let s = recordBuild(EMPTY_STATE, withAssets('a', 'fp-a'));
    expect(s.lastSuccess).toMatchObject({ commit: 'a'.repeat(40), assets: 'fp-a' });
    s = recordBuild(s, withAssets('b', 'fp-b', false));
    expect(s.lastSuccess).toMatchObject({ commit: 'a'.repeat(40), assets: 'fp-a' });
    s = recordBuild(s, withAssets('c', 'fp-c'));
    expect(s.lastSuccess).toMatchObject({ commit: 'c'.repeat(40), assets: 'fp-c' });
    // a build record without a fingerprint (assets/ missing) stores none
    expect(successOf(null, info('d'.repeat(40), ['x.dmg']))).not.toHaveProperty('assets');
  });

  it('state: finalizeBuild (what dist:all uses) stores the fingerprint, a partial build leaves it alone', () => {
    const paths = distPaths(join(dir, 'fin'));
    const ok = fakeBuild(paths, EMPTY_STATE, 'aaaaaaa', new Date(2026, 0, 1, 10, 0), KINDS, { assets: 'fp-1' });
    expect(ok.state.lastSuccess).toMatchObject({ commit: commitOf('aaaaaaa'), assets: 'fp-1' });
    const stored = JSON.parse(readFileSync(join(paths.latest, 'BUILD-INFO.json'), 'utf8')) as BuildInfo;
    expect(stored.assets).toBe('fp-1');
    const partial = fakeBuild(paths, ok.state, 'bbbbbbb', new Date(2026, 0, 1, 11, 0), ['mac'], { assets: 'fp-2' });
    expect(partial.state.lastSuccess).toMatchObject({ commit: commitOf('aaaaaaa'), assets: 'fp-1' });
    // the fingerprint of the partial build is in its own BUILD-INFO, but never becomes the comparison base
    expect(partial.info.assets).toBe('fp-2');
  });

  it('end to end in a repository: docs-only and an idempotent re-extract do not build; regenerated assets and tools/extract do', () => {
    const { root, paths, c1 } = repoWithAssets();
    const fp1 = assetsFingerprint(root, paths.assetsCache);
    expect(fp1).not.toBeNull();
    const state: BuildState = {
      lastSuccess: { commit: c1, date: new Date(Date.now() - 60000).toISOString(), assets: fp1?.fingerprint ?? '' },
      history: [],
    };

    // same commit, nothing touched
    expect(evaluateBuild(paths, state, c1).decision.build).toBe(false);

    // docs-only merge
    const c2 = commitFile(root, 'docs/a.md', 'changed\n');
    expect(evaluateBuild(paths, state, c2).decision.build).toBe(false);

    // `npm run extract` re-run with no change: every file is rewritten with identical content
    rewriteSame(join(root, 'assets', 'manifest.json'));
    rewriteSame(join(root, 'assets', 'gfx', '2x', 'atlas.png'));
    const idem = evaluateBuild(paths, state, c2);
    expect(idem.decision.build).toBe(false);
    expect(idem.assets?.fingerprint).toBe(fp1?.fingerprint);

    // the look changed through regenerated assets only (the T5.6 case): docs-only commit, assets differ
    writeAsset(root, 'gfx/2x/atlas.png', 'PNG-2');
    const regen = evaluateBuild(paths, state, c2);
    expect(regen.decision.build).toBe(true);
    expect(regen.decision.reason).toContain('assets');
    // ... and the same commit as the build is not "up to date" either
    expect(evaluateBuild(paths, state, c1).decision.build).toBe(true);
    // once that build is recorded, the same assets are up to date again
    const rebuilt: BuildState = {
      lastSuccess: {
        commit: c2,
        date: new Date().toISOString(),
        assets: assetsFingerprint(root, paths.assetsCache)?.fingerprint ?? '',
      },
      history: [],
    };
    expect(evaluateBuild(paths, rebuilt, c2).decision.build).toBe(false);

    // a change under tools/extract/ builds even though assets/ is as recorded
    const c3 = commitFile(root, 'tools/extract/x.ts', 'export const y = 1;\n');
    expect(evaluateBuild(paths, rebuilt, c3).decision.build).toBe(true);
    // its test file does not
    const c4 = commitFile(root, 'tools/extract/x.test.ts', 'export {};\n');
    const atC3: BuildState = { ...rebuilt, lastSuccess: { ...(rebuilt.lastSuccess ?? last()), commit: c3 } };
    expect(evaluateBuild(paths, atC3, c4).decision.build).toBe(false);
  });

  it('status text: assets same / changed / not yet recorded', () => {
    const base: StatusInput = {
      running: null,
      pending: null,
      state: recordBuild(EMPTY_STATE, info('a'.repeat(40), ['a.dmg'])),
      headCommit: 'b'.repeat(40),
      changedSinceBuild: ['docs/a.md'],
      distDir: '/d',
      latest: info('a'.repeat(40), ['a.dmg']),
      attempt: info('a'.repeat(40), ['a.dmg']),
      archive: [],
      flatLayout: false,
    };
    const docsOnly = formatStatus({ ...base, assets: 'same' });
    expect(docsOnly).toContain('no build needed');
    expect(docsOnly).toContain('assets/: same content');
    const regen = formatStatus({ ...base, assets: 'changed' });
    expect(regen).toContain('generated assets changed since the build: a build is needed');
    expect(regen).not.toContain('no build needed');
    expect(regen).toContain('assets/: CHANGED');
    // same commit, regenerated assets
    expect(formatStatus({ ...base, headCommit: 'a'.repeat(40), changedSinceBuild: [], assets: 'changed' })).toContain(
      'same commit as the build, but the generated assets changed',
    );
    // a build made before the fingerprint existed and assets/ older than it: counts as up to date
    const migrated = formatStatus({ ...base, headCommit: 'a'.repeat(40), changedSinceBuild: [], assets: 'unrecorded' });
    expect(migrated).toContain('up to date');
    expect(migrated).toContain('fingerprint is recorded at the next build check');
    expect(formatStatus({ ...base, assets: 'unrecorded-newer' })).toContain('a build is needed');
    expect(formatStatus({ ...base, headCommit: 'a'.repeat(40), changedSinceBuild: [] })).toContain('up to date');
  });
});
