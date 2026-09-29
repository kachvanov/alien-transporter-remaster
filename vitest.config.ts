import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts', 'src/**/*.test.ts'],
    // .claude/worktrees holds copies of the project for other agents: never test them.
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      'reference/**',
      'build/**',
      'assets/**',
      'vendor/**',
      'out/**',
      'dist/**',
      'tests/e2e/**',
    ],
    environment: 'node',
  },
});
