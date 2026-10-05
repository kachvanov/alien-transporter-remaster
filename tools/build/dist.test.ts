// Unit tests of the local auto builds (T5.3): pure logic only, electron-builder is never started.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type BuildInfo,
  type BuildRequest,
  EMPTY_STATE,
  acquireLock,
  classifyArtifact,
  enqueue,
  formatStatus,
  lockIsActive,
  makeBuildInfo,
  needsBuild,
  notificationFor,
  type QueueDeps,
  peekPending,
  processQueue,
  readLock,
  recordBuild,
  releaseLock,
  resolveBuildId,
  rotateBuilds,
  shortHash,
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

function info(commit: string, files: string[], ok = true): BuildInfo {
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
    let s = recordBuild(EMPTY_STATE, info('a'.repeat(40), ['a.dmg']));
    expect(s.lastSuccess?.commit).toBe('a'.repeat(40));
    s = recordBuild(s, info('b'.repeat(40), ['b.dmg'], false));
    expect(s.lastSuccess?.commit).toBe('a'.repeat(40));
    expect(s.history.map((h) => h.commit)).toEqual(['b'.repeat(40), 'a'.repeat(40)]);
    s = recordBuild(s, info('a'.repeat(40), ['a2.dmg']));
    expect(s.history.map((h) => h.files)).toEqual([['a2.dmg'], ['b.dmg']]);
  });

  it('rotation keeps the 2 newest builds and lists the files to delete', () => {
    const h = ['c', 'b', 'a', 'z'].map((c, i) => ({ commit: c, date: String(i), files: [`${c}.dmg`, `${c}.exe`] }));
    const r = rotateBuilds(h);
    expect(r.history.map((e) => e.commit)).toEqual(['c', 'b']);
    expect(r.remove).toEqual(['a.dmg', 'a.exe', 'z.dmg', 'z.exe']);
    expect(rotateBuilds(h.slice(0, 2)).remove).toEqual([]);
  });

  it('rotation skips builds without files and never deletes a file a kept build still owns', () => {
    const h = [
      { commit: 'c', date: '3', files: ['same.dmg'] },
      { commit: 'b', date: '2', files: [] },
      { commit: 'a', date: '1', files: ['a.dmg'] },
      { commit: 'o', date: '0', files: ['same.dmg', 'o.exe'] },
    ];
    const r = rotateBuilds(h);
    expect(r.history.map((e) => e.commit)).toEqual(['c', 'a']);
    expect(r.remove).toEqual(['o.exe']);
  });

  it('notification texts', () => {
    expect(notificationFor(info('a'.repeat(40), ['a.dmg']))).toBe('Build aaaaaaa is ready: dmg + exe');
    expect(notificationFor(info('a'.repeat(40), ['a.dmg'], false))).toContain('partly failed (mac)');
    const failed = makeBuildInfo({ commit: 'a'.repeat(40), date: 'd', version: '1', stages: [{ name: 'prepare', status: 'failed', ms: 1 }], files: [], durationMs: 1 });
    expect(notificationFor(failed)).toBe('Build failed: see dist/build.log');
  });

  it('status text: running, behind, up to date', () => {
    const base = {
      running: null,
      pending: null,
      state: recordBuild(EMPTY_STATE, info('a'.repeat(40), ['a.dmg'])),
      headCommit: 'b'.repeat(40),
      changedSinceBuild: ['src/a.ts'],
      distDir: '/d',
      info: info('a'.repeat(40), ['a.dmg']),
    };
    expect(formatStatus(base)).toContain('BEHIND');
    expect(formatStatus({ ...base, changedSinceBuild: ['docs/a.md'] })).toContain('no build needed');
    expect(formatStatus({ ...base, headCommit: 'a'.repeat(40) })).toContain('up to date');
    const running = formatStatus({ ...base, running: { pid: 42, startedAt: 'now' }, pending: req('c'.repeat(40)) });
    expect(running).toContain('RUNNING (pid 42');
    expect(running).toContain('queued: ccccccc');
    expect(running).toContain('/d/a.dmg');
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
