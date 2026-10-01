import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { PNG } from 'pngjs';

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

// Without a menu yet (T2.6) a level is what there is to draw: every launch starts Level01 (the dev flag).
async function launch(extraArgs: string[] = []): Promise<{ app: ElectronApplication; page: Page; urls: string[] }> {
  const app = await electron.launch({ args: ['.', '--start-level=Level01', ...extraArgs], env: cleanEnv() });
  const page = await app.firstWindow();
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.waitForSelector('canvas');
  return { app, page, urls };
}

const readSprites = (page: Page): Promise<number> =>
  page.evaluate(() => Number(document.documentElement.dataset['sprites'] ?? '0'));

/** Screenshot of the page as an RGBA image. */
async function shot(page: Page): Promise<PNG> {
  return PNG.sync.read(await page.screenshot());
}

function lit(png: PNG, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      if ((png.data[i] ?? 0) + (png.data[i + 1] ?? 0) + (png.data[i + 2] ?? 0) > 30) n++;
    }
  }
  return n;
}

test('sprites are drawn from atlases loaded over app://, not file://', async () => {
  const { app, page, urls } = await launch();
  try {
    await expect.poll(() => readSprites(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    expect(urls.some((u) => u.startsWith('app://assets/manifest.json'))).toBe(true);
    expect(urls.some((u) => /^app:\/\/assets\/gfx\/[123]x\/.+\.png/.test(u))).toBe(true);
    expect(urls.filter((u) => u.startsWith('file://') && /assets\/(gfx|manifest)/.test(u))).toEqual([]);
    const tier = await page.evaluate(() => document.documentElement.dataset['tier']);
    expect(['2x', '3x']).toContain(tier);
  } finally {
    await app.close();
  }
});

test('--tier and --classic flags reach the renderer', async () => {
  const { app, page } = await launch(['--tier=1x', '--classic']);
  try {
    await expect.poll(() => readSprites(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    expect(await page.evaluate(() => document.documentElement.dataset['tier'])).toBe('1x');
    expect(await page.evaluate(() => document.documentElement.dataset['classic'])).toBe('true');
    expect(await page.evaluate(() => window.at.app.flags)).toEqual({ startLevel: 'Level01', tier: '1x', classic: true });
  } finally {
    await app.close();
  }
});

test('the picture keeps 4:3 with black bars when the window is stretched', async () => {
  const { app, page } = await launch();
  try {
    await expect.poll(() => readSprites(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    // a very wide window: 1500x600 content -> the stage is 800x600 centred, 350 px bars on both sides
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      w.setContentSize(1500, 600);
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth), { timeout: 10_000 }).toBe(1500);
    await page.waitForTimeout(500);
    const png = await shot(page);
    const sx = png.width / 1500;
    const sy = png.height / 600;
    const px = (v: number): number => Math.round(v * sx);
    const py = (v: number): number => Math.round(v * sy);
    expect(lit(png, 0, 0, px(340), py(600))).toBe(0); // left bar
    expect(lit(png, px(1160), 0, png.width, py(600))).toBe(0); // right bar
    expect(lit(png, px(360), 0, px(1140), py(600))).toBeGreaterThan(1000); // the stage
  } finally {
    await app.close();
  }
});

test('F11 toggles fullscreen', async () => {
  const { app, page } = await launch();
  try {
    await expect.poll(() => readSprites(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    const isFull = (): Promise<boolean> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
    expect(await isFull()).toBe(false);
    await page.keyboard.press('F11');
    await expect.poll(isFull, { timeout: 10_000 }).toBe(true);
    await page.keyboard.press('F11');
    await expect.poll(isFull, { timeout: 10_000 }).toBe(false);
  } finally {
    await app.close();
  }
});

test('window: 4:3-ish default size, minimum 800x600, --profile uses its own userData', async () => {
  const { app, page } = await launch(['--profile=e2e']);
  try {
    const info = await app.evaluate(({ app: a, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]!;
      return { min: w.getMinimumSize(), bounds: w.getBounds(), userData: a.getPath('userData') };
    });
    expect(info.min).toEqual([800, 600]);
    expect(info.bounds.width).toBeGreaterThanOrEqual(800);
    expect(info.bounds.height).toBeGreaterThanOrEqual(600);
    expect(info.userData.endsWith('-profilee2e')).toBe(true);
    // window.at is exposed with the stub storage
    expect(await page.evaluate(() => typeof window.at.save.write)).toBe('function');
    await page.evaluate(() => window.at.save.write('t17', { ok: 1 }));
    expect(await page.evaluate(() => window.at.save.load('t17'))).toEqual({ ok: 1 });
  } finally {
    await app.close();
  }
});
