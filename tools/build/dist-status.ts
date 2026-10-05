// `npm run dist:status`: is a build running, which commit is in dist/latest, is main behind it, where are the files (T5.3, T5.5).
import { resolve } from 'node:path';
import { assetsFingerprint } from './dist-assets';
import { changedFiles, distPaths, git } from './dist-env';
import { hasFlatLayout, listArchive } from './dist-layout';
import {
  type BuildInfo,
  type BuildState,
  EMPTY_STATE,
  compareAssets,
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
  // FIX-8: the content of the generated assets/ (not in git) against the fingerprint of the last successful build.
  const fp = assetsFingerprint(root, paths.assetsCache);
  const assets = state.lastSuccess !== null ? compareAssets(state.lastSuccess, fp) : undefined;
  const running = lockIsActive(paths.lock) ? readLock(paths.lock) : null;
  console.log(
    formatStatus({
      running,
      pending: peekPending(paths.pending),
      state,
      headCommit: head,
      changedSinceBuild: changed,
      ...(assets !== undefined ? { assets } : {}),
      distDir: paths.dist,
      latest: readJson<BuildInfo | null>(paths.latestInfo, null),
      attempt: readJson<BuildInfo | null>(paths.attempt, null),
      archive: listArchive(paths),
      flatLayout: hasFlatLayout(paths.dist),
    }),
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('dist-status.ts')) main();
