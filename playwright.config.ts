import { defineConfig } from '@playwright/test';

// Playwright matches testIgnore against ABSOLUTE paths, and in an agent worktree the
// project root itself lives under `.claude/worktrees/`. So the patterns are anchored
// to the project root instead of using `**/.claude/**`.
const root = process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignoredDirs = ['.claude', 'reference', 'build', 'assets', 'vendor', 'out', 'dist'];

export default defineConfig({
  testDir: 'tests/e2e',
  // .claude/worktrees holds copies of the project for other agents: never test them.
  testIgnore: [new RegExp(`^${root}/(${ignoredDirs.join('|')})/`), /[\\/]node_modules[\\/]/],
  // Builds out/ once so the smoke test runs against the production bundle (worker included).
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
});
