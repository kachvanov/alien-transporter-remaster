// `electron-builder` with BUILD_ID set: electron-builder.yml puts ${env.BUILD_ID} (the short commit hash) into the file
// names, and electron-builder refuses to run when the variable is missing. `npm run build:mac|build:win` go through this.
// Usage: `tsx tools/build/builder.ts <electron-builder args>`.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resolveBuildId } from './dist-lib';
import { git } from './dist-env';

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('builder.ts')) {
  const root = process.cwd();
  const buildId = resolveBuildId(process.env.BUILD_ID, git(root, ['rev-parse', 'HEAD']));
  console.log(`[builder] BUILD_ID=${buildId}`);
  const bin = resolve(root, 'node_modules', '.bin', 'electron-builder');
  const args = process.argv.slice(2);
  // Never publish anything (electron-builder publishes implicitly when it detects a CI environment).
  if (!args.includes('--publish') && !args.some((a) => a.startsWith('--publish='))) args.push('--publish', 'never');
  const r = spawnSync(bin, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BUILD_ID: buildId },
  });
  process.exit(r.status ?? 1);
}
