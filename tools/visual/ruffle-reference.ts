// References from Ruffle (T4.2, docs/05-verification.md §6). macOS only.
//
//   npm run ruffle:ref -- --launch                  start Ruffle with the original SWF, window 800x600 logical, no menu bar
//   npm run ruffle:ref -- --scene=main-menu         capture the Ruffle window as tests/visual/reference/main-menu.png
//   npm run ruffle:ref -- --scene=main-menu,credits capture the same picture under several names (rarely useful)
//
// The capture is `screencapture -l <window id>` (the window is captured even when other windows cover it), the title
// bar is cut off (the stage is 4:3, everything above it is the bar), and the picture is scaled to 800x600 with sharp
// (kernel lanczos3) -- exactly as `npm run shot` makes ours. The first run needs the permission "Screen & System Audio
// Recording" for the app that runs the command (Terminal, Claude, ...): System Settings > Privacy & Security.
//
// Scenes are the names of tools/visual/shot.ts (main-menu, credits, select-level, garage, pause, level-complete,
// level01..level20). Ruffle slows down when it lags: wait until the scene is settled, then capture.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const RUFFLE = '/Applications/Ruffle.app/Contents/MacOS/ruffle';
const DEFAULT_SWF = '/Applications/Flash Games/alien-transporter.swf';

/** The crop box of a captured window: the 4:3 stage is at the bottom, the title bar above it. Pure (unit-tested). */
export function stageBox(width: number, height: number): { left: number; top: number; width: number; height: number } {
  const stageH = Math.round((width * 3) / 4);
  return { left: 0, top: Math.max(0, height - stageH), width, height: Math.min(stageH, height) };
}

/** PNG of a window capture -> 800x600 PNG of the stage. */
export async function toReference(windowPng: Buffer): Promise<Buffer> {
  const meta = await sharp(windowPng).metadata();
  const box = stageBox(meta.width ?? 0, meta.height ?? 0);
  return sharp(windowPng).extract(box).resize(800, 600, { kernel: 'lanczos3' }).png().toBuffer();
}

function windowId(): string {
  try {
    return execFileSync('swift', [resolve('tools/visual/ruffle-window.swift')], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('no Ruffle window on screen: run `npm run ruffle:ref -- --launch` first');
  }
}

function arg(argv: readonly string[], name: string): string | null {
  const p = `--${name}=`;
  const a = argv.find((x) => x.startsWith(p));
  return a !== undefined ? a.slice(p.length) : null;
}

async function main(argv: readonly string[]): Promise<void> {
  if (argv.includes('--launch')) {
    // ORIGINAL_SWF, then the names the file is known under (the real one on this Mac is alien-transporter.swf).
    const swf = [process.env['ORIGINAL_SWF'], DEFAULT_SWF, '/Applications/Flash Games/AlienTransporter.swf'].find(
      (p): p is string => p !== undefined && existsSync(p),
    );
    if (swf === undefined) throw new Error('the SWF is not found: set ORIGINAL_SWF');
    // --width/--height are physical pixels: 1600x1200 is 800x600 logical on a Retina display.
    const child = spawn(RUFFLE, ['--no-gui', '--width', '1600', '--height', '1200', '--storage', 'memory', '--letterbox', 'on', swf], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('Ruffle started: ' + swf);
    return;
  }
  const scenes = (arg(argv, 'scene') ?? '').split(',').filter((s) => s.length > 0);
  if (scenes.length === 0) throw new Error('give --launch or --scene=<name>');
  const id = windowId();
  const tmp = join(tmpdir(), `ruffle-window-${process.pid}.png`);
  execFileSync('screencapture', ['-x', '-o', '-l', id, tmp]);
  const { readFile, rm } = await import('node:fs/promises');
  const png = await toReference(await readFile(tmp));
  await rm(tmp);
  for (const scene of scenes) {
    const file = resolve('tests/visual/reference', scene + '.png');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, png);
    console.log('reference ' + scene + ' -> ' + file);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
