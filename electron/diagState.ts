// Not a port (T5.2). The pure parts of the diagnostics of the main process: what a renderer may report (a whitelist, checked:
// it comes from a process that may be broken), the memory-per-process fields of the 30 s state line, the recovery decision.
// Node only; imports nothing.

import type { CrashRole, Fields } from './crashLog';

/** Numeric fields of the 5 s statistics of the renderer (`window.at.diag.stats`); the others are dropped. */
const STAT_NUMBERS = [
  'tick',
  'fps',
  'jitterPending',
  'jitterDropped',
  'jitterUnderruns',
  'jitterResets',
  'atlasPages',
  'vramMB',
  'audioGraphs',
  'jsHeapMB',
  'frames',
] as const;
const STAT_STRINGS = ['netState', 'visibility', 'levelGroup'] as const;
const MAX_STRING = 24;

/** Keeps the known fields of the statistics of the renderer (a number that is not finite is dropped, a string is cut). */
export function sanitizeRendererStats(aRaw: unknown): Fields | null {
  if (typeof aRaw !== 'object' || aRaw === null) {
    return null;
  }

  const raw = aRaw as Record<string, unknown>;
  const out: Fields = {};
  for (const key of STAT_NUMBERS) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v;
    }
  }

  for (const key of STAT_STRINGS) {
    const v = raw[key];
    if (typeof v === 'string') {
      out[key] = v.replace(/[^\w.:-]/g, '_').slice(0, MAX_STRING);
    }
  }

  return out;
}

/** An event of the renderer: a short name of letters, digits and `_`; the fields are primitives, the strings are cut. */
export function sanitizeRendererEvent(aName: unknown, aFields: unknown): { name: string; fields: Fields } | null {
  if (typeof aName !== 'string' || !/^[A-Z][A-Z0-9_]{1,31}$/.test(aName)) {
    return null;
  }

  const fields: Fields = {};
  if (typeof aFields === 'object' && aFields !== null) {
    for (const [key, value] of Object.entries(aFields).slice(0, 12)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(key)) {
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        fields[key] = value;
      } else if (typeof value === 'string') {
        fields[key] = value.slice(0, 500);
      }
    }
  }

  return { name: aName, fields };
}

/** The part of `Electron.ProcessMetric` that the state line needs. */
export interface ProcessMetric {
  type: string;
  pid: number;
  /** KB. */
  workingSetKB: number;
  privateKB: number;
  cpuPercent: number;
}

const TYPE_NAMES: Record<string, string> = {
  Browser: 'main',
  Tab: 'renderer',
  GPU: 'gpu',
  Utility: 'utility',
};

/** `ram_main=120 ram_renderer=400 ram_gpu=300 ram_total=900 cpu_renderer=12 ...` (MB; the processes of a type are summed). */
export function metricsFields(aMetrics: readonly ProcessMetric[]): Fields {
  const ram: Record<string, number> = {};
  const cpu: Record<string, number> = {};
  let total = 0;
  for (const m of aMetrics) {
    const name = TYPE_NAMES[m.type] ?? 'other';
    ram[name] = (ram[name] ?? 0) + m.workingSetKB / 1024;
    cpu[name] = (cpu[name] ?? 0) + m.cpuPercent;
    total += m.workingSetKB / 1024;
  }

  const out: Fields = {};
  for (const name of ['main', 'renderer', 'gpu', 'utility', 'other']) {
    if (ram[name] !== undefined) {
      out['ram_' + name] = Math.round(ram[name] as number);
    }
  }

  out['ram_total'] = Math.round(total);
  for (const name of ['main', 'renderer', 'gpu']) {
    if (cpu[name] !== undefined) {
      out['cpu_' + name] = Math.round(cpu[name] as number);
    }
  }

  return out;
}

/** Where a recovered window goes (the hash of the renderer URL, see src/app/joinTarget.ts): never back into the session. */
export function recoveryHash(aRole: CrashRole): string {
  // The client sees "Connection lost" on the Join screen; the others the menu with a message about the crash.
  return aRole === 'client' ? 'local:lost' : 'local:crashed';
}

/** The role from the URL of the window (`#join=...` is a client) and the state of the host. */
export function roleOf(aHosting: boolean, aUrl: string, aFlagJoin: boolean): CrashRole {
  if (aHosting) {
    return 'host';
  }

  const hash = aUrl.includes('#') ? aUrl.slice(aUrl.indexOf('#')) : '';
  if (hash.startsWith('#join=')) {
    return 'client';
  }

  return aFlagJoin && !hash.startsWith('#local') ? 'client' : 'local';
}

/**
 * Loop guard for the recovery: more than `aMax` recoveries within `aWindowMs` means that the new window crashes as well;
 * the app then leaves it (the log has the reason) instead of reloading for ever.
 */
export class RecoveryBudget {
  private readonly _times: number[] = [];
  private readonly _max: number;
  private readonly _windowMs: number;

  constructor(aMax = 3, aWindowMs = 60_000) {
    this._max = aMax;
    this._windowMs = aWindowMs;
  }

  /** true: recover now (and count it). */
  take(aNowMs: number): boolean {
    while (this._times.length > 0 && aNowMs - (this._times[0] as number) > this._windowMs) {
      this._times.shift();
    }

    if (this._times.length >= this._max) {
      return false;
    }

    this._times.push(aNowMs);
    return true;
  }
}
