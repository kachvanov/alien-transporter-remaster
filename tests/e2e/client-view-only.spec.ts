import { createServer } from 'node:net';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp, removeProfilesAfterEach } from './profile';

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

removeProfilesAfterEach();

const PORT = 47020;
const NO_LEVEL = '65535';

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}

const read = (page: Page, key: string): Promise<string> =>
  page.evaluate((k) => document.documentElement.dataset[k] ?? '', key);

async function setSize(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setContentSize(800, 600);
  });
}

// T5.1 (DEVIATION: online): the client only watches while the host is on a menu: the buttons of the host's frames are muted
// (data-view-only on <html>, the renderer draws the muted faces and the hint), and a click of the client does nothing.
test('client: the host in the main menu -> view only (a click does nothing); the host in a level -> normal view', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  const stamp = Date.now() % 1e9;
  const apps: ElectronApplication[] = [];
  try {
    // --- the host is in the main menu ---
    const host = await launchApp({ args: ['.', '--host-start', `--profile=e2e-v51h-${stamp}`], env: cleanEnv() });
    apps.push(host);
    const hostPage = await host.firstWindow();
    const hostScreens: string[] = [];
    hostPage.on('console', (m) => {
      if (m.type() === 'info' && m.text().includes('screen ')) hostScreens.push(m.text().replace(/^.*screen /, ''));
    });
    await hostPage.waitForSelector('canvas');
    await setSize(host);
    await expect.poll(() => read(hostPage, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);

    const client = await launchApp({
      args: ['.', `--join=127.0.0.1:${PORT}`, `--profile=e2e-v51c-${stamp}`],
      env: cleanEnv(),
    });
    apps.push(client);
    const page = await client.firstWindow();
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.waitForSelector('canvas');
    await setSize(client);
    await expect.poll(() => read(page, 'netState'), { timeout: 20_000 }).toBe('playing');

    await expect.poll(() => read(page, 'viewOnly'), { timeout: 10_000 }).toBe('true');
    expect(await read(page, 'levelGroup')).toBe(NO_LEVEL);
    await page.waitForTimeout(1500); // (the atlas of the menu is loaded: the buttons are on the screen)
    await page.screenshot({ path: test.info().outputPath('client-menu-view-only.png') });

    // A click on "Play" of the client: the host does not leave its main menu, the client keeps the muted look.
    const screensBefore = hostScreens.length;
    await page.mouse.move(400, 385);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    expect(hostScreens.length).toBe(screensBefore);
    expect(await read(hostPage, 'levelGroup')).toBe(NO_LEVEL);
    expect(await read(page, 'levelGroup')).toBe(NO_LEVEL);
    expect(await read(page, 'viewOnly')).toBe('true');
    expect(problems).toEqual([]);

    await client.close();
    apps.pop();
    await host.close();
    apps.pop();
    await new Promise((r) => setTimeout(r, 1500));

    // --- the host is in a level ---
    test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken`);
    const host2 = await launchApp({
      args: ['.', '--host-start', '--start-level=1', `--profile=e2e-v51h2-${stamp}`],
      env: cleanEnv(),
    });
    apps.push(host2);
    const host2Page = await host2.firstWindow();
    await host2Page.waitForSelector('canvas');
    await expect.poll(() => read(host2Page, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);
    const client2 = await launchApp({
      args: ['.', `--join=127.0.0.1:${PORT}`, `--profile=e2e-v51c2-${stamp}`],
      env: cleanEnv(),
    });
    apps.push(client2);
    const page2 = await client2.firstWindow();
    await page2.waitForSelector('canvas');
    await expect.poll(() => read(page2, 'netState'), { timeout: 20_000 }).toBe('playing');
    await expect.poll(() => read(page2, 'levelGroup'), { timeout: 10_000 }).toBe('1');
    await page2.waitForTimeout(2500);
    expect(await read(page2, 'viewOnly')).toBe('false');
    await page2.screenshot({ path: test.info().outputPath('client-level-normal.png') });
  } finally {
    for (const a of apps.reverse()) await a.close().catch(() => undefined);
  }
});
