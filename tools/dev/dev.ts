// `npm run dev [-- --start-level=Level01 --profile=2 --tier=2x --classic]`: runs `electron-vite dev`,
// passing the app's flags to Electron after `--` (see devArgs.ts for why).

import { spawn } from 'node:child_process';
import { buildViteDevArgs } from './devArgs';

const args = buildViteDevArgs(process.argv.slice(2));
const win = process.platform === 'win32';
const child = spawn(win ? 'electron-vite.cmd' : 'electron-vite', args, { stdio: 'inherit', shell: win });

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => child.kill(sig));
}
child.on('error', (e) => {
  console.error(`dev: cannot start electron-vite: ${e.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
