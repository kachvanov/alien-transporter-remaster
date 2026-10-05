// Helper of the e2e tests that start the app with `--profile=<id>`: checks that the profile is really applied (userData
// ends with `-profile<id>`; the app also refuses to start on an invalid id, see electron/main.ts) and removes the
// directories of the profiles after the test. Not a test file.
import { rmSync } from 'node:fs';
import { basename } from 'node:path';
import { _electron as electron, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

const launchedDirs: string[] = [];

/** `electron.launch` for a `--profile=` run: throws (and closes the app) when the profile is not the userData of the app. */
export async function launchApp(opts: { args: string[]; env: Record<string, string> }): Promise<ElectronApplication> {
  const arg = opts.args.find((a) => a.startsWith('--profile='));
  if (arg === undefined) throw new Error('launchApp: no --profile= in the arguments (the run would use the userData of the player)');
  const profile = arg.slice('--profile='.length);
  // Muted: the e2e runs must not play the game's sound on the machine of the developer (AT_E2E_AUDIO=1 lets it out).
  const mute = process.env['AT_E2E_AUDIO'] === '1' || opts.args.includes('--mute-audio') ? [] : ['--mute-audio'];
  const app = await electron.launch({ ...opts, args: [...opts.args, ...mute] });
  const userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  if (!userData.endsWith(`-profile${profile}`)) {
    await app.close();
    throw new Error(`profile "${profile}" was not applied; userData = ${userData}`);
  }
  launchedDirs.push(userData);
  return app;
}

/** Removes the userData directories of the profiles launched through `launchApp` (call after the apps are closed). */
export function removeLaunchedProfiles(): void {
  for (const dir of launchedDirs.splice(0)) {
    if (basename(dir).includes('-profile')) rmSync(dir, { recursive: true, force: true });
  }
}

/** `afterEach` of the spec file: the apps are closed in the `finally` of the tests, then their profiles go. */
export function removeProfilesAfterEach(): void {
  test.afterEach(() => {
    removeLaunchedProfiles();
  });
}
