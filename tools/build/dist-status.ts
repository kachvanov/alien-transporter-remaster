// `npm run dist:status`: is a build running, which commit was built last, is main behind it, where are the files (T5.3).
import { resolve } from 'node:path';
import { changedFiles, distPaths, git } from './dist-env';
import {
  type BuildInfo,
  type BuildState,
  EMPTY_STATE,
  formatStatus,
  lockIsActive,
  peekPending,
  readJson,
  readLock,
} from './dist-lib';

function main(): void {
  const root = process.cwd();
  const paths = distPaths(root);
  const state = readJson<BuildState>(paths.state, EMPTY_STATE);
  const head = git(root, ['rev-parse', 'main']) ?? git(root, ['rev-parse', 'HEAD']);
  const base = state.lastSuccess?.commit;
  const changed = head !== null && base !== undefined ? changedFiles(root, base, head) : null;
  const running = lockIsActive(paths.lock) ? readLock(paths.lock) : null;
  console.log(
    formatStatus({
      running,
      pending: peekPending(paths.pending),
      state,
      headCommit: head,
      changedSinceBuild: changed,
      distDir: paths.dist,
      info: readJson<BuildInfo | null>(paths.info, null),
    }),
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('dist-status.ts')) main();
