// Not a port (T5.2). `<userData>/crash.log`: the always-on diagnostics of the app. One line per event: the crash and hang
// events of Electron (render-process-gone, unresponsive, child-process-gone), the errors of the renderer, WebGL context loss,
// and a state line every 30 s (memory per process, queue sizes, the net state), so a "white screen" can be told from a hang, a
// renderer crash, a lost GPU process or a lost WebGL context.
//
//   2026-10-05T12:00:00.000Z host v0.1.0 darwin/arm64 RENDER_GONE reason=oom exitCode=-536870904
//
// The log must not slow the game down: `write()` only appends to an in-memory buffer; one asynchronous append at a time
// drains it (never a write per frame: the callers send events and a state line every 30 s). `flushSync()` is for the moment
// the process is going away. The file is rotated at ~1 MB (`crash.log` -> `crash.log.1`, the older copy is replaced).
// No personal data: the home directory part of every path is scrubbed, strings are cut.
//
// Node only (electron main process and tests); imports nothing but Node built-ins.

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export const CRASH_LOG_FILE = 'crash.log';
/** The log is rotated when it would grow over this size. */
export const CRASH_LOG_MAX_BYTES = 1024 * 1024;
/** A string value in a line is cut to this many characters. */
export const MAX_VALUE_LENGTH = 600;
/** What waits in memory for the disk; older lines are dropped when the disk does not keep up (never blocks the game). */
const MAX_PENDING_CHARS = 256 * 1024;

export type CrashRole = 'host' | 'client' | 'local';

/** Who writes: the same on every line, so lines of two machines pasted together stay readable. */
export interface CrashLogMeta {
  version: string;
  platform: string;
  arch: string;
}

export type FieldValue = string | number | boolean | null | undefined;
export type Fields = Record<string, FieldValue>;

/** Replaces the user name inside a path: `/Users/anna/x`, `C:\Users\anna\x`, `/home/anna/x`, and the given home directories. */
export function scrubText(aText: string, aHomeDirs: readonly string[] = []): string {
  let text = aText;
  for (const home of aHomeDirs) {
    if (home.length > 3) {
      text = text.split(home).join('~');
    }
  }

  return text
    .replace(/\/Users\/[^/\s"')]+/g, '/Users/~')
    .replace(/\/home\/[^/\s"')]+/g, '/home/~')
    .replace(/([A-Za-z]:)[\\/]+Users[\\/]+[^\\/\s"')]+/gi, '$1\\Users\\~');
}

/** A value of a line: numbers and words as they are, everything else in JSON quotes (so a line never breaks). */
export function formatValue(aValue: FieldValue, aHomeDirs: readonly string[] = []): string {
  if (aValue === null || aValue === undefined) {
    return '-';
  }

  if (typeof aValue === 'number') {
    return Number.isFinite(aValue) ? String(Math.round(aValue * 100) / 100) : '-';
  }

  if (typeof aValue === 'boolean') {
    return aValue ? 'true' : 'false';
  }

  let text = scrubText(aValue, aHomeDirs);
  if (text.length > MAX_VALUE_LENGTH) {
    text = text.slice(0, MAX_VALUE_LENGTH) + '...';
  }

  return /^[\w.:/+-]+$/.test(text) ? text : JSON.stringify(text);
}

/** `ISO-time role version platform/arch EVENT key=value ...` (one line, no line break inside). */
export function formatLine(
  aTime: Date,
  aRole: CrashRole,
  aMeta: CrashLogMeta,
  aEvent: string,
  aFields: Fields = {},
  aHomeDirs: readonly string[] = [],
): string {
  const parts = [aTime.toISOString(), aRole, 'v' + aMeta.version, aMeta.platform + '/' + aMeta.arch, aEvent];
  for (const [key, value] of Object.entries(aFields)) {
    parts.push(key + '=' + formatValue(value, aHomeDirs));
  }

  return parts.join(' ') + '\n';
}

/** Does an event from the renderer pass: at most `aPerMinute` lines a minute, a burst of the same event is cut. */
export class EventLimiter {
  private readonly _perMinute: number;
  private _windowStart = 0;
  private _count = 0;
  private _dropped = 0;

  constructor(aPerMinute = 60) {
    this._perMinute = aPerMinute;
  }

  /** How many were refused since the last call that was allowed (the caller logs it once). */
  takeDropped(): number {
    const n = this._dropped;
    this._dropped = 0;
    return n;
  }

  allow(aNowMs: number): boolean {
    if (aNowMs - this._windowStart >= 60_000) {
      this._windowStart = aNowMs;
      this._count = 0;
    }

    if (this._count >= this._perMinute) {
      this._dropped++;
      return false;
    }

    this._count++;
    return true;
  }
}

export interface CrashLogOptions {
  maxBytes?: number;
  /** Clock (tests). Default: now. */
  now?: () => Date;
  /** Home directories to hide in the text (the user name). */
  homeDirs?: readonly string[];
  /** A write failed (the log is best effort: the game goes on). */
  onError?: (aError: unknown) => void;
}

export class CrashLog {
  private readonly _path: string;
  private readonly _meta: CrashLogMeta;
  private readonly _maxBytes: number;
  private readonly _now: () => Date;
  private readonly _homeDirs: readonly string[];
  private readonly _onError: (aError: unknown) => void;
  private _role: CrashRole = 'local';
  private _roleOf: (() => CrashRole) | null = null;
  private _pending = '';
  private _size = -1;
  private _draining: Promise<void> | null = null;
  private _scheduled = false;
  private _lines = 0;

  constructor(aPath: string, aMeta: CrashLogMeta, aOptions: CrashLogOptions = {}) {
    this._path = aPath;
    this._meta = aMeta;
    this._maxBytes = aOptions.maxBytes ?? CRASH_LOG_MAX_BYTES;
    this._now = aOptions.now ?? (() => new Date());
    this._homeDirs = aOptions.homeDirs ?? [];
    this._onError = aOptions.onError ?? (() => undefined);
  }

  get path(): string {
    return this._path;
  }

  get role(): CrashRole {
    return this._role;
  }

  /** Lines written since the start (tests, the state line). */
  get lines(): number {
    return this._lines;
  }

  setRole(aRole: CrashRole): void {
    this._role = aRole;
  }

  /** The role is asked for at every line (it changes: a game is hosted, the client joins, the session ends). */
  setRoleProvider(aProvider: () => CrashRole): void {
    this._roleOf = aProvider;
  }

  /** Adds a line. Returns at once; the disk is written later. */
  write(aEvent: string, aFields: Fields = {}): void {
    let role = this._role;
    if (this._roleOf !== null) {
      try {
        role = this._roleOf();
      } catch {
        // (a role that cannot be told stays the last known one)
      }
    }

    this._pending += formatLine(this._now(), role, this._meta, aEvent, aFields, this._homeDirs);
    this._lines++;
    if (this._pending.length > MAX_PENDING_CHARS) {
      // (a stalled disk: keep the newest half, never let the memory grow)
      this._pending = this._pending.slice(this._pending.length - MAX_PENDING_CHARS / 2);
      const cut = this._pending.indexOf('\n');
      this._pending = cut >= 0 ? this._pending.slice(cut + 1) : this._pending;
    }

    if (this._draining === null && !this._scheduled) {
      // (the next turn of the event loop: the lines written in a burst go out in one append, and `flushSync()` still finds
      // them in memory when the process ends right after the write)
      this._scheduled = true;
      setImmediate(() => {
        this._scheduled = false;
        this.startDrain();
      });
    }
  }

  /** Resolves when everything written so far is on the disk. */
  async flush(): Promise<void> {
    while (this._draining !== null || this._pending !== '') {
      this.startDrain();
      await this._draining;
    }
  }

  /** For the moment the process goes away (a fatal error, quit): the rest is written synchronously. */
  flushSync(): void {
    const text = this._pending;
    if (text === '') {
      return;
    }

    this._pending = '';
    try {
      mkdirSync(dirname(this._path), { recursive: true });
      if (this._size < 0) {
        this._size = sizeOfSync(this._path);
      }

      if (this._size > 0 && this._size + text.length > this._maxBytes) {
        renameSync(this._path, this._path + '.1');
        this._size = 0;
      }

      appendFileSync(this._path, text, 'utf8');
      this._size += Buffer.byteLength(text);
    } catch (e) {
      this._onError(e);
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private startDrain(): void {
    if (this._draining === null && this._pending !== '') {
      this._draining = this.drain().finally(() => {
        this._draining = null;
        if (this._pending !== '' && !this._scheduled) {
          this.startDrain(); // (lines that came while the last append was running)
        }
      });
    }
  }

  /** One append after another until the buffer is empty. */
  private async drain(): Promise<void> {
    while (this._pending !== '') {
      const text = this._pending;
      this._pending = '';
      try {
        await mkdir(dirname(this._path), { recursive: true });
        if (this._size < 0) {
          this._size = await sizeOf(this._path);
        }

        if (this._size > 0 && this._size + text.length > this._maxBytes) {
          await rename(this._path, this._path + '.1'); // (replaces the older copy)
          this._size = 0;
        }

        await appendFile(this._path, text, 'utf8');
        this._size += Buffer.byteLength(text);
      } catch (e) {
        this._onError(e);
        return;
      }
    }
  }
}

async function sizeOf(aPath: string): Promise<number> {
  try {
    return (await stat(aPath)).size;
  } catch {
    return 0;
  }
}

function sizeOfSync(aPath: string): number {
  try {
    return statSync(aPath).size;
  } catch {
    return 0;
  }
}
