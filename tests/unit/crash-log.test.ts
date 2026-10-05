import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CrashLog, EventLimiter, formatLine, formatValue, MAX_VALUE_LENGTH, scrubText } from '../../electron/crashLog';
import {
  metricsFields,
  RecoveryBudget,
  recoveryHash,
  roleOf,
  sanitizeRendererEvent,
  sanitizeRendererStats,
} from '../../electron/diagState';
import { installErrorReporting, watchCanvas, watchVisibility } from '../../src/app/diagnostics';
import { failureFromHash, noticeFromHash } from '../../src/app/joinTarget';

const META = { version: '0.1.0', platform: 'darwin', arch: 'arm64' };
const T0 = new Date('2026-10-05T12:00:00.000Z');

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'at-crashlog-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('crash.log lines', () => {
  it('ISO time, role, version, platform, event, key=value', () => {
    const line = formatLine(T0, 'host', META, 'RENDER_GONE', { reason: 'oom', exitCode: -1, flag: true, none: undefined });
    expect(line).toBe('2026-10-05T12:00:00.000Z host v0.1.0 darwin/arm64 RENDER_GONE reason=oom exitCode=-1 flag=true none=-\n');
  });

  it('a line never breaks: a value with spaces or a line break is quoted, numbers are rounded, NaN is a dash', () => {
    expect(formatValue('two words')).toBe('"two words"');
    expect(formatValue('a\nb')).toBe('"a\\nb"');
    expect(formatValue(1.23456)).toBe('1.23');
    expect(formatValue(Number.NaN)).toBe('-');
    const line = formatLine(T0, 'client', META, 'PAGE_ERROR', { message: 'x\ny\r\nz' });
    expect(line.split('\n')).toHaveLength(2); // the text and the empty rest after the final line break
  });

  it('a long value is cut', () => {
    expect(formatValue('x'.repeat(5000)).length).toBeLessThan(MAX_VALUE_LENGTH + 10);
  });

  it('no user name: home directories are scrubbed in every kind of path', () => {
    expect(scrubText('at /Users/anna/Games/x.js:1')).toBe('at /Users/~/Games/x.js:1');
    expect(scrubText('C:\\Users\\Boris Petrov\\AppData\\x.js')).toContain('C:\\Users\\~');
    expect(scrubText('C:\\Users\\Boris\\AppData\\x.js')).not.toContain('Boris');
    expect(scrubText('/home/carl/.config/x')).toBe('/home/~/.config/x');
    expect(scrubText('open /opt/home-x/file and /custom/home/dir/f', ['/custom/home/dir'])).toBe('open /opt/home-x/file and ~/f');
    const line = formatLine(T0, 'local', META, 'MAIN_UNCAUGHT', { stack: 'Error at /Users/anna/app/main.js:3' }, []);
    expect(line).not.toContain('anna');
  });
});

describe('CrashLog file', () => {
  it('appends asynchronously: write() returns at once, flush() has the lines on disk in order', async () => {
    const log = new CrashLog(join(dir, 'crash.log'), META, { now: () => T0 });
    log.write('START');
    log.write('STATE', { ram_total: 700 });
    log.setRole('client');
    log.write('NET_STATE', { state: 'closed' });
    await log.flush();
    const lines = (await readFile(join(dir, 'crash.log'), 'utf8')).trimEnd().split('\n');
    expect(lines).toEqual([
      '2026-10-05T12:00:00.000Z local v0.1.0 darwin/arm64 START',
      '2026-10-05T12:00:00.000Z local v0.1.0 darwin/arm64 STATE ram_total=700',
      '2026-10-05T12:00:00.000Z client v0.1.0 darwin/arm64 NET_STATE state=closed',
    ]);
  });

  it('the role is asked for at every line when there is a provider', async () => {
    const log = new CrashLog(join(dir, 'crash.log'), META, { now: () => T0 });
    let role: 'host' | 'client' = 'host';
    log.setRoleProvider(() => role);
    log.write('A');
    role = 'client';
    log.write('B');
    await log.flush();
    const text = await readFile(join(dir, 'crash.log'), 'utf8');
    expect(text).toMatch(/ host v0\.1\.0 .* A\n/);
    expect(text).toMatch(/ client v0\.1\.0 .* B\n/);
  });

  it('rotation: over the size limit the log moves to crash.log.1 (the older copy is replaced), the new file starts clean', async () => {
    const log = new CrashLog(join(dir, 'crash.log'), META, { now: () => T0, maxBytes: 1000 });
    for (let i = 0; i < 40; i++) {
      log.write('LINE', { n: i });
      await log.flush(); // (one append per line, so the size check runs for every line)
    }
    const files = (await readdir(dir)).sort();
    expect(files).toEqual(['crash.log', 'crash.log.1']);
    for (const f of files) expect((await stat(join(dir, f))).size).toBeLessThanOrEqual(1000);
    const last = (await readFile(join(dir, 'crash.log'), 'utf8')).trimEnd().split('\n').pop();
    expect(last).toContain('n=39');
    const kept = (await readFile(join(dir, 'crash.log.1'), 'utf8')).trimEnd().split('\n');
    expect(kept.length).toBeGreaterThan(3);
    expect(kept.every((l) => l.includes(' LINE n='))).toBe(true);
  });

  it('an existing file of the previous run is appended to (and counts for the rotation)', async () => {
    const path = join(dir, 'crash.log');
    const a = new CrashLog(path, META, { now: () => T0 });
    a.write('FIRST_RUN');
    await a.flush();
    const b = new CrashLog(path, META, { now: () => T0 });
    b.write('SECOND_RUN');
    await b.flush();
    const text = await readFile(path, 'utf8');
    expect(text.indexOf('FIRST_RUN')).toBeLessThan(text.indexOf('SECOND_RUN'));
  });

  it('flushSync writes the rest at once (the process is going away)', async () => {
    const log = new CrashLog(join(dir, 'crash.log'), META, { now: () => T0 });
    log.write('RENDER_GONE', { reason: 'crashed' });
    log.flushSync();
    expect(await readFile(join(dir, 'crash.log'), 'utf8')).toContain('RENDER_GONE reason=crashed');
    await log.flush();
    expect((await readFile(join(dir, 'crash.log'), 'utf8')).match(/RENDER_GONE/g)).toHaveLength(1); // (not twice)
  });

  it('a disk that fails does not throw into the game: the error goes to onError', async () => {
    const errors: unknown[] = [];
    // a directory in place of the file: every append fails
    const log = new CrashLog(dir, META, { now: () => T0, onError: (e) => errors.push(e) });
    log.write('X');
    await log.flush();
    expect(errors.length).toBeGreaterThan(0);
  });

  it('the pending text is bounded when the disk stalls', () => {
    const log = new CrashLog(join(dir, 'never', 'crash.log'), META, { now: () => T0 });
    for (let i = 0; i < 5000; i++) log.write('SPAM', { text: 'x'.repeat(300) }); // synchronous: the drain cannot run in between
    expect(log.lines).toBe(5000); // (counted; the memory is cut inside)
  });
});

describe('what the renderer may report', () => {
  it('an event: a short CAPITAL name, primitive fields with valid keys', () => {
    expect(sanitizeRendererEvent('PAGE_ERROR', { message: 'x', line: 3, ok: true, 'bad key': 1, nested: { a: 1 } })).toEqual({
      name: 'PAGE_ERROR',
      fields: { message: 'x', line: 3, ok: true },
    });
    expect(sanitizeRendererEvent('page_error', {})).toBeNull();
    expect(sanitizeRendererEvent('A'.repeat(40), {})).toBeNull();
    expect(sanitizeRendererEvent(5, {})).toBeNull();
    expect(sanitizeRendererEvent('XY', null)).toEqual({ name: 'XY', fields: {} });
  });

  it('statistics: known fields only', () => {
    expect(
      sanitizeRendererStats({ tick: 100, fps: 59.9, jitterPending: 3, netState: 'playing now!', evil: 1, atlasPages: Number.NaN }),
    ).toEqual({ tick: 100, fps: 59.9, jitterPending: 3, netState: 'playing_now_' });
    expect(sanitizeRendererStats('x')).toBeNull();
  });

  it('a flood of events is limited per minute and the dropped ones are counted', () => {
    const lim = new EventLimiter(3);
    expect([0, 1, 2, 3, 4].map((t) => lim.allow(t))).toEqual([true, true, true, false, false]);
    expect(lim.takeDropped()).toBe(2);
    expect(lim.takeDropped()).toBe(0);
    expect(lim.allow(60_001)).toBe(true); // the next minute
  });
});

describe('state line and the safety net (pure parts)', () => {
  it('RAM per process type, summed, MB', () => {
    const f = metricsFields([
      { type: 'Browser', pid: 1, workingSetKB: 100 * 1024, privateKB: 0, cpuPercent: 1 },
      { type: 'Tab', pid: 2, workingSetKB: 400 * 1024, privateKB: 0, cpuPercent: 30 },
      { type: 'GPU', pid: 3, workingSetKB: 200 * 1024, privateKB: 0, cpuPercent: 10 },
      { type: 'Utility', pid: 4, workingSetKB: 50 * 1024, privateKB: 0, cpuPercent: 0 },
      { type: 'Utility', pid: 5, workingSetKB: 10 * 1024, privateKB: 0, cpuPercent: 0 },
    ]);
    expect(f).toMatchObject({ ram_main: 100, ram_renderer: 400, ram_gpu: 200, ram_utility: 60, ram_total: 760, cpu_renderer: 30 });
  });

  it('the role: host while hosting, client for #join= or --join without #local, otherwise local', () => {
    expect(roleOf(true, 'file:///x/index.html', false)).toBe('host');
    expect(roleOf(false, 'file:///x/index.html#join=1.2.3.4:47020', false)).toBe('client');
    expect(roleOf(false, 'file:///x/index.html', true)).toBe('client');
    expect(roleOf(false, 'file:///x/index.html#local:lost', true)).toBe('local');
    expect(roleOf(false, 'file:///x/index.html', false)).toBe('local');
  });

  it('the way back: a client lands on the Join screen "Connection lost", the others on the menu with the crash notice', () => {
    expect(failureFromHash('#' + recoveryHash('client'))).toBe('lost');
    expect(noticeFromHash('#' + recoveryHash('client'))).toBeNull();
    expect(noticeFromHash('#' + recoveryHash('host'))).toBe('crashed');
    expect(noticeFromHash('#' + recoveryHash('local'))).toBe('crashed');
    expect(failureFromHash('#' + recoveryHash('local'))).toBeNull(); // (the notice is not a join failure)
    expect(noticeFromHash('')).toBeNull();
  });

  it('loop guard: at most 3 recoveries a minute', () => {
    const b = new RecoveryBudget(3, 60_000);
    expect([0, 1000, 2000, 3000].map((t) => b.take(t))).toEqual([true, true, true, false]);
    expect(b.take(61_000)).toBe(true); // the first one is out of the window
  });
});

describe('the renderer reports errors, context loss and visibility', () => {
  type Ev = [string, Record<string, unknown> | undefined];
  const collect = (): { events: Ev[]; report: (n: string, f?: Record<string, string | number | boolean>) => void } => {
    const events: Ev[] = [];
    return { events, report: (n, f) => void events.push([n, f]) };
  };

  it('window.onerror and unhandledrejection; a repeat within 10 s is counted, not repeated', () => {
    const target = new EventTarget();
    const { events, report } = collect();
    let now = 0;
    installErrorReporting(target, report, () => now);
    const err = (): Event =>
      Object.assign(new Event('error'), { message: 'boom', filename: 'file:///Users/anna/app/main.js', lineno: 3, colno: 4 });
    target.dispatchEvent(err());
    target.dispatchEvent(err());
    target.dispatchEvent(err());
    expect(events).toHaveLength(1);
    expect(events[0]?.[0]).toBe('PAGE_ERROR');
    expect(events[0]?.[1]).toMatchObject({ message: 'boom', file: 'main.js', line: 3, col: 4 });
    expect(JSON.stringify(events[0])).not.toContain('anna'); // (the file is only the last segment)
    now = 20_000;
    target.dispatchEvent(err());
    expect(events).toHaveLength(2);
    expect(events[1]?.[1]).toMatchObject({ repeatsBefore: 2 });
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('nope') }));
    expect(events[2]?.[0]).toBe('PAGE_REJECTION');
  });

  it('WebGL context lost / restored and visibilitychange', () => {
    const canvas = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const { events, report } = collect();
    watchCanvas(canvas, report);
    watchVisibility(doc, report);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(events).toEqual([
      ['WEBGL_CONTEXT_LOST', { count: 1 }],
      ['WEBGL_CONTEXT_RESTORED', { count: 1 }],
      ['VISIBILITY', { state: 'hidden' }],
    ]);
  });
});
