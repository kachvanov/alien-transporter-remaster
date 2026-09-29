import { execSync } from 'node:child_process';

export default function globalSetup(): void {
  execSync('npx electron-vite build', { stdio: 'inherit' });
}
