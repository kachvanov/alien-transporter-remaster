import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

// Three entries: electron/main.ts, electron/preload.ts, index.html -> src/app/main.ts.
// Output goes to out/ (package.json "main": out/main/main.js).
const watchIgnored = [
  '**/.claude/**',
  '**/reference/**',
  '**/build/**',
  '**/assets/**',
  '**/vendor/**',
  '**/out/**',
  '**/dist/**',
  '**/node_modules/**',
];

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: resolve(__dirname, 'electron/main.ts'), formats: ['cjs'] },
      rollupOptions: { output: { entryFileNames: 'main.js' } },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: resolve(__dirname, 'electron/preload.ts'), formats: ['cjs'] },
      rollupOptions: { output: { entryFileNames: 'preload.js' } },
    },
  },
  renderer: {
    root: '.',
    server: { watch: { ignored: watchIgnored } },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
    worker: { format: 'es' },
  },
});
