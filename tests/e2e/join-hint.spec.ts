import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

// FIX-10: the Join screen (opened with `--start-screen`) shows the hint about the manual address only after the search has
// found nothing for a few seconds, and takes it away when a host is found. The text is drawn by the bitmap font into the
// canvas, so the test looks at the pixels of the empty rows of the list (x 150..650, y 350..415) and does not need the
// words (the words themselves are checked by tests/unit/online-screens.test.ts).
// JOIN_SHOTS=<dir>: a screenshot of every step; JOIN_TIER=1x|2x|3x: the tier of the graphics.
test('Join screen: the hint about the manual address comes after the empty search and goes when a host is found', async () => {
  const stamp = Date.now() % 1e9;
  const app = await electron.launch({
    args: ['.', `--profile=jv${stamp}`, '--start-screen=JoinScreen', `--tier=${process.env['JOIN_TIER'] ?? '1x'}`, '--mute-audio'],
    env: cleanEnv(),
  });
  let userData = '';
  try {
    const page = await app.firstWindow();
    const problems: string[] = [];
    const screens: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push('console.error: ' + m.text());
      if (m.type() === 'info' && m.text().includes('screen ')) screens.push(m.text().replace(/^.*screen /, ''));
    });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.waitForSelector('canvas');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(800, 600);
    });
    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), { timeout: 10_000 }).toEqual([800, 600]);
    await expect.poll(() => screens[screens.length - 1], { timeout: 30_000 }).toBe('JoinScreen');
    const joinedAt = Date.now();
    const clip = { x: 150, y: 350, width: 500, height: 65 };
    const shot = async (name: string): Promise<Buffer> => {
      const dir = process.env['JOIN_SHOTS'];
      if (dir !== undefined) await page.screenshot({ path: join(dir, name + '.png') });
      return page.screenshot({ clip });
    };
    await page.waitForTimeout(2500);
    const early = await shot('join-1-searching');
    await page.waitForTimeout(Math.max(0, 7500 - (Date.now() - joinedAt)));
    const late = await shot('join-2-hint');
    expect(late.equals(early), 'the hint is on the screen after the delay').toBe(false);

    // a host appears (the beacon of this very process): the hint goes
    await page.evaluate(async () => {
      const real = ((await (await fetch('app://assets/manifest.json')).json()) as { buildHash: string }).buildHash;
      await window.at.discovery.startBeacon({ buildHash: real, hostName: 'MacBook-Pro', port: 47020, status: 'waiting' });
    });
    await page.waitForTimeout(3000);
    const found = await shot('join-3-found');
    expect(found.equals(late), 'the list of hosts has replaced the hint').toBe(false);
    await page.evaluate(() => window.at.discovery.stopBeacon());
    expect(problems).toEqual([]);
    userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  } finally {
    await app.close();
    if (userData.includes('-profilejv')) rmSync(userData, { recursive: true, force: true });
  }
});
