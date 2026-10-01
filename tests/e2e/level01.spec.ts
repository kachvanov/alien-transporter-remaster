import { _electron as electron, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

test('--start-level=Level01: the level runs 10 s of scripted input, 35 Frames/s, no errors in the console', async () => {
  const app = await electron.launch({ args: ['.', '--start-level=Level01', '--profile=e2e-level01'], env: cleanEnv() });
  try {
    const page = await app.firstWindow();
    const problems: string[] = [];
    const infos: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push('console.error: ' + m.text());
      if (m.type() === 'info') infos.push(m.text());
    });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.waitForSelector('canvas');

    const readTicks = (): Promise<number> =>
      page.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0'));
    const readSprites = (): Promise<number> =>
      page.evaluate(() => Number(document.documentElement.dataset['sprites'] ?? '0'));

    // The level, the HUD (hull, lives, coins, the passenger bar, glyphs of the labels), the title: dozens of sprites.
    await expect.poll(readSprites, { timeout: 30_000 }).toBeGreaterThan(30);
    await expect.poll(() => infos.some((m) => m.includes('level Level01 started')), { timeout: 10_000 }).toBe(true);

    // The Frames come at 35/s: the tick counter of the worker over the whole script.
    const t0 = await readTicks();
    const started = Date.now();

    // 10 s of input: gas, then left, right, left+gas, right+gas, nothing.
    const script: { keys: string[]; ms: number }[] = [
      { keys: ['ArrowUp'], ms: 1500 },
      { keys: ['ArrowUp', 'ArrowLeft'], ms: 1500 },
      { keys: ['ArrowUp', 'ArrowRight'], ms: 2000 },
      { keys: ['ArrowLeft'], ms: 1000 },
      { keys: ['ArrowRight'], ms: 1000 },
      { keys: ['ArrowUp'], ms: 1500 },
      { keys: [], ms: 1500 },
    ];
    for (const step of script) {
      for (const k of step.keys) await page.keyboard.down(k);
      await page.waitForTimeout(step.ms);
      for (const k of step.keys) await page.keyboard.up(k);
    }

    const seconds = (Date.now() - started) / 1000;
    const rate = ((await readTicks()) - t0) / seconds;
    expect(seconds).toBeGreaterThan(9.5);
    expect(rate).toBeGreaterThan(32);
    expect(rate).toBeLessThan(38);

    // The picture is the level (not black): lit pixels.
    const png = PNG.sync.read(await page.screenshot());
    let lit = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if ((png.data[i] ?? 0) + (png.data[i + 1] ?? 0) + (png.data[i + 2] ?? 0) > 60) lit++;
    }
    expect(lit).toBeGreaterThan(png.width * png.height * 0.3);
    expect(problems).toEqual([]);
  } finally {
    await app.close();
  }
});
