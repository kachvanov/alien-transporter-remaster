// Screenshots of our game for the visual comparison with Ruffle (T4.2, docs/05-verification.md §6).
//
// Usage: npm run shot -- [--scene=main-menu,credits,level01 | --scene=all] [--out=tests/visual/actual] [--no-build] [--settle=1500]
//
// Every scene is a separate Electron launch (a new profile, tier 1x, content size 800x600): the menu screens are reached
// by mouse clicks the same way tests/e2e/menu-flow.spec.ts does it, a level by `--start-level=NN`. The picture is
// `webContents.capturePage()` of the 800x600 area (on Retina 1600x1200), scaled to 800x600 with sharp (lanczos3),
// exactly as the Ruffle references are (`tools/visual/ruffle-reference.ts`).
//
// Scenes: main-menu, credits, select-level, garage, pause, level-complete, level01..level20.
// level-complete is made by the dev flag `--start-screen=LevelComplete` (the screen at once, with the values of a fresh save: no
// play-through; the reference of Ruffle was taken with zero values as well, so only the layout is compared).

import { rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import sharp from 'sharp';

export const STATIC_SCENES = ['main-menu', 'credits', 'select-level', 'garage', 'pause', 'level-complete'] as const;
export const LEVEL_SCENES: readonly string[] = Array.from({ length: 20 }, (_, i) => 'level' + String(i + 1).padStart(2, '0'));
export const ALL_SCENES: readonly string[] = [...STATIC_SCENES, ...LEVEL_SCENES];

/** `--scene=` value -> the list of scenes ("all", or names, or "levels"/"static"). Throws on an unknown name. */
export function parseScenes(value: string | null): string[] {
  if (value === null || value === 'all') return [...ALL_SCENES];
  const out: string[] = [];
  for (const part of value.split(',').filter((s) => s.length > 0)) {
    if (part === 'levels') out.push(...LEVEL_SCENES);
    else if (part === 'static') out.push(...STATIC_SCENES);
    else if (ALL_SCENES.includes(part)) out.push(part);
    else throw new Error(`unknown scene "${part}"; known: ${ALL_SCENES.join(', ')}`);
  }
  return out;
}

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE'),
  );
}

interface Session {
  app: ElectronApplication;
  page: Page;
  screens: string[];
  problems: string[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function poll<T>(fn: () => Promise<T> | T, ok: (v: T) => boolean, timeoutMs: number, what: string): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for ' + what);
    await sleep(100);
  }
}

async function launch(extraArgs: string[], profile: string): Promise<Session> {
  const app = await electron.launch({
    args: ['.', '--mute-audio', `--profile=${profile}`, '--tier=1x', ...extraArgs],
    env: cleanEnv(),
  });
  const page = await app.firstWindow();
  const screens: string[] = [];
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console.error: ' + m.text());
    if (m.type() === 'info' && m.text().includes('screen ')) screens.push(m.text().replace(/^.*screen /, ''));
  });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.waitForSelector('canvas');
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(800, 600);
  });
  await poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), (s) => s[0] === 800 && s[1] === 600, 10_000, 'window 800x600');
  return { app, page, screens, problems };
}

const sprites = (s: Session): Promise<number> => s.page.evaluate(() => Number(document.documentElement.dataset['sprites'] ?? '0'));
const lastScreen = (s: Session): string | undefined => s.screens[s.screens.length - 1];

async function clickAt(s: Session, x: number, y: number): Promise<void> {
  await s.page.mouse.move(x, y);
  await sleep(150);
  await s.page.mouse.down();
  await sleep(100);
  await s.page.mouse.up();
}

/** A click that changes the screen; repeated while the button was not there yet. */
async function clickTo(s: Session, x: number, y: number, screen: string): Promise<void> {
  for (let i = 0; i < 4 && lastScreen(s) !== screen; i++) {
    await clickAt(s, x, y);
    await poll(() => lastScreen(s), (v) => v === screen, 6000, 'screen ' + screen).catch(() => undefined);
  }
  await poll(() => lastScreen(s), (v) => v === screen, 15_000, 'screen ' + screen);
}

async function waitMainMenu(s: Session, settleMs: number): Promise<void> {
  await poll(() => lastScreen(s), (v) => v === 'MainScreen', 30_000, 'MainScreen');
  await poll(() => sprites(s), (n) => n >= 4, 30_000, 'menu buttons');
  await sleep(Math.max(settleMs, 2500)); // the buttons of the menu appear one after another
}

/** 800x600 PNG of the page: capturePage of the content area, scaled when the display is Retina. */
export async function capture800(app: ElectronApplication): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }) => {
    const img = await BrowserWindow.getAllWindows()[0]!.webContents.capturePage({ x: 0, y: 0, width: 800, height: 600 });
    return img.toPNG().toString('base64');
  });
  const raw = Buffer.from(b64, 'base64');
  const meta = await sharp(raw).metadata();
  if (meta.width === 800 && meta.height === 600) return raw;
  return sharp(raw).resize(800, 600, { kernel: 'lanczos3' }).png().toBuffer();
}

async function openSelect(s: Session, settleMs: number): Promise<void> {
  await waitMainMenu(s, settleMs);
  await clickTo(s, 400, 385, 'SelectScreen'); // Play
  await sleep(Math.max(settleMs, 3000));
}

/** Brings a fresh session to the scene. Resolves when the picture can be taken. */
async function reach(scene: string, s: Session, settleMs: number): Promise<void> {
  switch (scene) {
    case 'main-menu':
      return waitMainMenu(s, settleMs);
    case 'credits':
      await waitMainMenu(s, settleMs);
      await clickTo(s, 400 - 112, 385, 'CreditsScreen');
      await sleep(Math.max(settleMs, 2500));
      return;
    case 'select-level':
      return openSelect(s, settleMs);
    case 'level-complete':
      // the screen builds itself with tasks and pauses (stars, columns, missions, buttons)
      await poll(() => lastScreen(s), (v) => v === 'LevelComplete', 30_000, 'screen LevelComplete').catch(() => undefined);
      await poll(() => sprites(s), (n) => n >= 4, 30_000, 'level complete sprites');
      await sleep(Math.max(settleMs, 6000));
      return;
    case 'garage':
      await openSelect(s, settleMs);
      await clickTo(s, 70, 400, 'GarageScreen');
      await sleep(Math.max(settleMs, 2000));
      return;
    case 'pause':
      await openSelect(s, settleMs);
      await clickTo(s, 160, 209, 'GameScreen'); // Level 01
      await poll(() => sprites(s), (n) => n > 30, 30_000, 'level sprites');
      await sleep(2000);
      await s.page.keyboard.down('Escape');
      await sleep(150); // a key shorter than a tick of the simulation can be missed
      await s.page.keyboard.up('Escape');
      await sleep(Math.max(settleMs, 1500));
      return;
    default: {
      // levelNN: the dev entry, the level without the menu. "The first frame after it appears": the sprites are there
      // (the level and the HUD), plus a short settle so that the fade has gone.
      await poll(() => sprites(s), (n) => n > 30, 30_000, 'level sprites');
      await sleep(settleMs);
    }
  }
}

export interface ShotOptions {
  scenes: string[];
  outDir: string;
  settleMs: number;
  build: boolean;
}

export async function takeShots(opts: ShotOptions): Promise<{ scene: string; file: string; problems: string[] }[]> {
  if (opts.build) execSync('npx electron-vite build', { stdio: 'inherit' });
  await mkdir(opts.outDir, { recursive: true });
  const results: { scene: string; file: string; problems: string[] }[] = [];
  for (const scene of opts.scenes) {
    const profile = `shot${Date.now() % 1e9}`;
    const level = /^level(\d+)$/.exec(scene);
    const extra = level !== null ? [`--start-level=${level[1]}`] : scene === 'level-complete' ? ['--start-screen=LevelComplete'] : [];
    const s = await launch(extra, profile);
    let userData = '';
    try {
      userData = await s.app.evaluate(({ app }) => app.getPath('userData'));
      await reach(scene, s, opts.settleMs);
      const png = await capture800(s.app);
      const file = join(opts.outDir, scene + '.png');
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, png);
      results.push({ scene, file, problems: s.problems });
      console.log(`shot ${scene} -> ${file}${s.problems.length > 0 ? '  PROBLEMS: ' + s.problems.join(' | ') : ''}`);
    } finally {
      await s.app.close();
      if (userData.includes('-profileshot')) rmSync(userData, { recursive: true, force: true });
    }
  }
  return results;
}

function arg(argv: readonly string[], name: string): string | null {
  const p = `--${name}=`;
  const a = argv.find((x) => x.startsWith(p));
  return a !== undefined ? a.slice(p.length) : null;
}

async function main(argv: readonly string[]): Promise<void> {
  const settle = arg(argv, 'settle');
  await takeShots({
    scenes: parseScenes(arg(argv, 'scene')),
    outDir: resolve(arg(argv, 'out') ?? 'tests/visual/actual'),
    settleMs: settle !== null ? Number(settle) : 1500,
    build: !argv.includes('--no-build'),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
