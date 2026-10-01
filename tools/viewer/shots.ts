// Dev Asset Viewer (T0.8): headless screenshots of the acceptance checks -> build/viewer-shots/.
// Usage: npx tsx tools/viewer/shots.ts   (starts the viewer's Vite server on a free port itself)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

process.env.VIEWER_NO_OPEN = '1';
const here = __dirname;
const outDir = resolve(here, '../../build/viewer-shots');
mkdirSync(outDir, { recursive: true });

async function run(): Promise<void> {
  const server = await createServer({
    configFile: resolve(here, 'vite.config.ts'),
    server: { port: 5199, strictPort: false },
    logLevel: 'warn',
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/';

  // CHROMIUM_PATH: use another installed Chromium when the one Playwright expects is not downloaded.
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  async function shot(name: string, query: string): Promise<void> {
    await page.goto(`${base}?${query}`);
    await page.waitForSelector('body:not([data-busy])', { timeout: 30000 });
    await page.waitForTimeout(500);
    if ((await page.locator('body[data-error]').count()) > 0) throw new Error(`viewer error on ?${query}`);
    const file = resolve(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }

  // Coin_mc: origin cross in the middle of the coin, all tiers.
  for (const t of ['1x', '2x', '3x']) await shot(`coin-${t}`, `tab=symbols&symbol=Coin_mc&tier=${t}&scale=4&frame=0&play=0`);
  // Shuttle body (5 frames) and passenger walk: paused on several frames; the origin must stay put.
  for (const f of [0, 2, 4]) await shot(`shuttle-body-f${f}`, `tab=symbols&symbol=Shuttle01Body_mc&tier=3x&scale=4&frame=${f}&play=0`);
  for (const f of [0, 7, 14]) await shot(`passenger-walk-f${f}`, `tab=symbols&symbol=PassengerBlue01Walk_mc&tier=3x&scale=4&frame=${f}&play=0`);
  await shot('contact-sheet-game-common', 'tab=sheet&group=game-common&tier=1x');
  await shot('level01', 'tab=level&level=1&tier=2x&zoom=fit');
  await shot('level01-layers-only', 'tab=level&level=1&tier=2x&zoom=fit&hide=overlay');
  await shot('level01-overlay-only', 'tab=level&level=1&tier=2x&zoom=fit&hide=Back,BG,FG');

  await browser.close();
  await server.close();
  if (errors.length > 0) {
    console.error('page errors:\n' + errors.join('\n'));
    process.exit(1);
  }
}

run().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
