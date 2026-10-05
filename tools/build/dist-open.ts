// `npm run dist:open`: opens dist/latest/ in Finder (T5.5). Without a finished build it only says so: nothing is created,
// opened or deleted, the exit code stays 0.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { distPaths } from './dist-env';

function main(): void {
  const paths = distPaths(process.cwd());
  if (!existsSync(paths.latest)) {
    console.log(`${paths.latest} does not exist yet: there is no finished build (run npm run dist:all, see ${paths.log})`);
    return;
  }
  if (process.platform !== 'darwin') {
    console.log(paths.latest);
    return;
  }
  const r = spawnSync('open', [paths.latest], { stdio: 'inherit' });
  if (r.status !== 0) console.log(`could not open ${paths.latest}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('dist-open.ts')) main();
