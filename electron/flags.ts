// Command line of the app: --profile=N, --start-level=LevelNN, --tier=1x|2x|3x, --classic, --join=ip[:port], --host-start,
// --perf-log=perf.json (T4.3).
// Pure (no Electron import): unit-tested in tests/unit/electron.test.ts.

import type { DevFlags, TierName } from '../src/app/at';

/** main -> preload: `additionalArguments` entry that carries the flags as JSON. */
export const FLAGS_ARG_PREFIX = '--at-flags=';

function valueOf(argv: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  for (const a of argv) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return null;
}

/** `--profile=N`: a short alphanumeric id of a separate userData directory; null when absent or invalid. */
export function parseProfile(argv: readonly string[]): string | null {
  const v = valueOf(argv, 'profile');
  return v !== null && /^[A-Za-z0-9_-]{1,16}$/.test(v) ? v : null;
}

export function parseDevFlags(argv: readonly string[]): DevFlags {
  const tier = valueOf(argv, 'tier');
  const level = valueOf(argv, 'start-level');
  const join = valueOf(argv, 'join');
  const flags: DevFlags = {
    startLevel: level !== null && level.length > 0 ? level : null,
    tier: tier === '1x' || tier === '2x' || tier === '3x' ? (tier as TierName) : null,
    classic: argv.includes('--classic'),
  };
  // (`join` is only there when it is given: the flags of the other cards stay as they were)
  if (join !== null && join.length > 0) flags.join = join;
  if (argv.includes('--host-start')) flags.hostStart = true;
  const perfLog = valueOf(argv, 'perf-log');
  if (perfLog !== null && perfLog.length > 0) flags.perfLog = perfLog;
  return flags;
}

export function encodeFlagsArg(flags: DevFlags): string {
  return FLAGS_ARG_PREFIX + JSON.stringify(flags);
}

/** Reads the flags from the process arguments of the preload (see `encodeFlagsArg`). */
export function decodeFlagsArg(argv: readonly string[]): DevFlags {
  const raw = valueOf(argv, 'at-flags');
  if (raw !== null) {
    try {
      const o = JSON.parse(raw) as Partial<DevFlags>;
      const flags: DevFlags = {
        startLevel: typeof o.startLevel === 'string' ? o.startLevel : null,
        tier: o.tier === '1x' || o.tier === '2x' || o.tier === '3x' ? o.tier : null,
        classic: o.classic === true,
      };
      if (typeof o.join === 'string' && o.join.length > 0) flags.join = o.join;
      if (o.hostStart === true) flags.hostStart = true;
      if (typeof o.perfLog === 'string' && o.perfLog.length > 0) flags.perfLog = o.perfLog;
      return flags;
    } catch {
      // fall through to the defaults
    }
  }
  return { startLevel: null, tier: null, classic: false };
}

/** main -> preload: `additionalArguments` entry with the tiers that the build has on disk (T4.4), e.g. `--at-tiers=1x,2x`. */
export const TIERS_ARG_PREFIX = '--at-tiers=';

export function encodeTiersArg(tiers: readonly TierName[]): string {
  return TIERS_ARG_PREFIX + tiers.join(',');
}

/** The tiers from the process arguments of the preload; null when the argument is absent (then the manifest is trusted). */
export function decodeTiersArg(argv: readonly string[]): TierName[] | null {
  const raw = valueOf(argv, 'at-tiers');
  if (raw === null) return null;
  return raw.split(',').filter((t): t is TierName => t === '1x' || t === '2x' || t === '3x');
}
