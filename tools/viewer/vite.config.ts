// Dev Asset Viewer (T0.8): `npm run viewer`. Dev-only; never part of the production build.
// Root is tools/viewer; the repo's assets/ folder is served as static files under /assets/.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const assetsDir = resolve(repoRoot, 'assets');

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.bin': 'application/octet-stream',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
};

/** Serves `assets/` under `/assets/` (assets/ is git-ignored and may be a symlink, so not `publicDir`). */
function serveAssets(): Plugin {
  return {
    name: 'viewer-serve-assets',
    configureServer(server) {
      server.middlewares.use('/assets', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const file = normalize(join(assetsDir, rel));
        if (!file.startsWith(assetsDir) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: here,
  publicDir: false,
  plugins: [serveAssets()],
  server: {
    port: 5174,
    open: !process.env.VIEWER_NO_OPEN,
    fs: { allow: [repoRoot] },
    watch: {
      ignored: [
        '**/.claude/**',
        '**/reference/**',
        '**/build/**',
        '**/assets/**',
        '**/vendor/**',
        '**/out/**',
        '**/node_modules/**',
      ],
    },
  },
});
