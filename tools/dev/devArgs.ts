// Splits the `npm run dev` command line into electron-vite options and the app's own flags.
// electron-vite (cac) rejects unknown options, and forwards to Electron only what follows `--`,
// so the documented `npm run dev -- --start-level=Level01` needs this split. Pure: unit-tested in tests/unit/dev-args.test.ts.

/** App flags that take a value: `--name=value` or `--name value`. */
const VALUE_FLAGS: readonly string[] = ['start-level', 'profile', 'tier', 'join'];
/** App flags without a value. */
const BOOLEAN_FLAGS: readonly string[] = ['classic'];

export interface SplitDevArgs {
  /** Arguments for `electron-vite dev` itself (before the `--`). */
  viteArgs: string[];
  /** Arguments for the Electron app (after the `--`), in the form electron/flags.ts reads. */
  appArgs: string[];
}

export function splitDevArgs(argv: readonly string[]): SplitDevArgs {
  const viteArgs: string[] = [];
  const appArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      // Explicit separator (`npm run dev -- -- --foo`): the rest goes to Electron as is.
      appArgs.push(...argv.slice(i + 1));
      break;
    }
    const m = /^--([A-Za-z-]+)(?:=(.*))?$/.exec(a);
    const name = m ? m[1]! : '';
    if (m && VALUE_FLAGS.includes(name)) {
      if (m[2] !== undefined) {
        appArgs.push(`--${name}=${m[2]}`);
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('-')) {
        appArgs.push(`--${name}=${argv[++i]!}`);
      } else {
        appArgs.push(`--${name}=`);
      }
    } else if (m && BOOLEAN_FLAGS.includes(name) && m[2] === undefined) {
      appArgs.push(`--${name}`);
    } else {
      viteArgs.push(a);
    }
  }
  return { viteArgs, appArgs };
}

/** The argument list for `electron-vite dev`: its own options, then our flags after `--`. */
export function buildViteDevArgs(argv: readonly string[]): string[] {
  const { viteArgs, appArgs } = splitDevArgs(argv);
  return ['dev', ...viteArgs, ...(appArgs.length > 0 ? ['--', ...appArgs] : [])];
}
