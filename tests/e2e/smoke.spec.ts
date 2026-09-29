import { _electron as electron, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('window opens, canvas shows text, worker ticks grow', async () => {
  // ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('canvas');

    // Tick counter (fed by the sim worker) must grow at ~35/s.
    const readTicks = (): Promise<number> =>
      page.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0'));
    await expect.poll(readTicks, { timeout: 15_000 }).toBeGreaterThan(0);
    const t0 = await readTicks();
    await page.waitForTimeout(1000);
    const t1 = await readTicks();
    expect(t1 - t0).toBeGreaterThan(20);
    expect(t1 - t0).toBeLessThan(50);

    // The canvas must contain non-black pixels (caption + counter text).
    const png = PNG.sync.read(await page.screenshot());
    let lit = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if ((png.data[i] ?? 0) + (png.data[i + 1] ?? 0) + (png.data[i + 2] ?? 0) > 60) lit++;
    }
    expect(lit).toBeGreaterThan(100);
  } finally {
    await app.close();
  }
});
