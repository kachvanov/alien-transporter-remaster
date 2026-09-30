// Command line of the app: --profile=N, --start-level=LevelNN, --tier=1x|2x|3x, --classic.
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
  return {
    startLevel: level !== null && level.length > 0 ? level : null,
    tier: tier === '1x' || tier === '2x' || tier === '3x' ? (tier as TierName) : null,
    classic: argv.includes('--classic'),
  };
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
      return {
        startLevel: typeof o.startLevel === 'string' ? o.startLevel : null,
        tier: o.tier === '1x' || o.tier === '2x' || o.tier === '3x' ? o.tier : null,
        classic: o.classic === true,
      };
    } catch {
      // fall through to the defaults
    }
  }
  return { startLevel: null, tier: null, classic: false };
}
