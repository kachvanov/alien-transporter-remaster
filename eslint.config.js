// Flat ESLint config. Layer boundaries: CLAUDE.md rule 5, docs/01-architecture.md §2.
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

const PURE_LAYERS = [
  'src/engine/**/*.ts',
  'src/physics/**/*.ts',
  'src/game/**/*.ts',
  'src/frame/**/*.ts',
  'src/sim/**/*.ts',
  'src/net/protocol.ts',
];

const RENDERER_LAYERS = ['src/render/**/*.ts', 'src/audio/**/*.ts', 'src/app/**/*.ts'];

const restrictedProperties = [
  {
    object: 'Math',
    property: 'random',
    message: 'Use AntMath.random*() (seeded PRNG). Math.random breaks determinism.',
  },
  {
    object: 'Date',
    property: 'now',
    message: 'Wall-clock time is forbidden in the simulation (determinism).',
  },
  {
    object: 'performance',
    property: 'now',
    message: 'performance.now is allowed only in src/sim/GameLoop.ts and src/sim/worker.ts.',
  },
];

module.exports = tseslint.config(
  {
    ignores: [
      '.claude/**',
      'reference/**',
      'build/**',
      'assets/**',
      'vendor/**',
      'out/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    files: ['tools/viewer/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Pure layers: no Pixi/Electron/DOM, no wall-clock or unseeded randomness.
  {
    files: PURE_LAYERS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pixi.js', message: 'Pure layers must not import Pixi.' },
            { name: 'electron', message: 'Pure layers must not import Electron.' },
          ],
          patterns: [
            { group: ['pixi.js/*'], message: 'Pure layers must not import Pixi.' },
            {
              group: ['**/render', '**/render/*', '**/render/**'],
              message: 'Pure layers must not import src/render.',
            },
            {
              group: ['**/audio', '**/audio/*', '**/audio/**'],
              message: 'Pure layers must not import src/audio.',
            },
            {
              group: ['**/app', '**/app/*', '**/app/**'],
              message: 'Pure layers must not import src/app.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'AudioContext', 'requestAnimationFrame', 'localStorage'].map(
          (name) => ({ name, message: `${name} is a DOM API; not allowed in pure layers.` }),
        ),
      ],
      'no-restricted-properties': ['error', ...restrictedProperties],
    },
  },
  // The game loop and the worker entry may read performance.now.
  {
    files: ['src/sim/GameLoop.ts', 'src/sim/worker.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...restrictedProperties.filter((p) => p.object !== 'performance'),
      ],
    },
  },

  // Renderer-side layers: no direct Electron access (only via window.at from preload).
  {
    files: RENDERER_LAYERS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Renderer code must use window.at (preload), not electron.',
            },
          ],
        },
      ],
    },
  },

  // electron/ (main/preload) must not reach into renderer-only code.
  {
    files: ['electron/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/src/render', '**/src/render/**', '**/src/audio', '**/src/audio/**'],
              message: 'electron/ must not import src/render or src/audio.',
            },
          ],
        },
      ],
    },
  },
);
