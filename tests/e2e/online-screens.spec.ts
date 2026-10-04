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

// T3.4: the screens of the LAN game with the mouse and the keys: main menu -> Online -> Host (the beacon is on the air)
// -> Stop -> Join -> an address is typed -> Enter -> (no client session yet: STUB(T3.3)) the worker is restarted and
// JoinScreen shows "CONNECTION FAILED" with the address that was typed.
test('menu -> Online -> Host -> Stop -> Join -> address -> Enter -> Join with the message', async () => {
  const app = await electron.launch({ args: ['.', `--profile=on${Date.now() % 1e9}`], env: cleanEnv() });
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

    // T34_SHOTS=<dir>: a screenshot of every step (to look at them next to the screens of the original)
    const snap = async (name: string): Promise<void> => {
      const dir = process.env['T34_SHOTS'];
      if (dir !== undefined) await page.screenshot({ path: join(dir, name + '.png') });
    };
    const lastScreen = (): string | undefined => screens[screens.length - 1];
    const clickAt = async (x: number, y: number): Promise<void> => {
      await page.mouse.move(x, y);
      await page.waitForTimeout(150);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
    };
    const clickTo = async (x: number, y: number, screen: string): Promise<void> => {
      for (let i = 0; i < 3 && lastScreen() !== screen; i++) {
        await clickAt(x, y);
        await expect.poll(lastScreen, { timeout: 6000 }).toBe(screen).catch(() => undefined);
      }

      await expect.poll(lastScreen, { timeout: 15_000 }).toBe(screen);
    };
    const key = async (code: string): Promise<void> => {
      await page.keyboard.down(code);
      await page.waitForTimeout(90); // (a key shorter than a tick of the simulation, 29 ms, can be missed)
      await page.keyboard.up(code);
      await page.waitForTimeout(60);
    };

    await expect.poll(lastScreen, { timeout: 30_000 }).toBe('MainScreen');
    await page.waitForTimeout(2500);
    await snap('1-main-menu-online');
    await clickTo(512, 385, 'OnlineScreen'); // Online
    await page.waitForTimeout(2500);
    await snap('2-online');

    // Host: the beacon is on the air (a scan of this very process hears it)
    await clickTo(300, 385, 'HostScreen');
    await page.waitForTimeout(2500);
    await snap('3-host-waiting');
    const heard = await page.evaluate(async () => {
      const at = window.at;
      const hash = document.documentElement.dataset['buildHash'] ?? 'x';
      const result = new Promise<number>((resolve) => {
        const off = at.discovery.onUpdate((games) => {
          if (games.length > 0) {
            off();
            resolve(games[0]!.port);
          }
        });
        setTimeout(() => resolve(-1), 5000);
      });
      await at.discovery.startScan(hash);
      const port = await result;
      await at.discovery.stopScan();
      return port;
    });
    expect(heard).toBe(47020);
    await clickTo(100, 505, 'OnlineScreen'); // Stop
    await page.waitForTimeout(1500);

    // Join: the address is typed with the keys
    await clickTo(500, 385, 'JoinScreen');
    await page.waitForTimeout(2500);
    await snap('4-join');
    // a game in the LAN: the beacon of this process (the real build hash, then another one: "different version")
    const beacon = (hash: string | null): Promise<void> =>
      page.evaluate(async (h) => {
        if (h === null) return window.at.discovery.stopBeacon();
        const real = ((await (await fetch('app://assets/manifest.json')).json()) as { buildHash: string }).buildHash;
        return window.at.discovery.startBeacon({
          buildHash: h === 'real' ? real : h,
          hostName: 'MacBook-Pro',
          port: 47020,
          status: 'waiting',
        });
      }, hash);
    await beacon('real');
    await page.waitForTimeout(2500);
    await snap('4b-join-list');
    await beacon('other-build');
    await page.waitForTimeout(2500);
    await snap('4c-join-list-version');
    await beacon(null);
    for (const code of ['Digit1', 'Digit2', 'Digit7', 'Period', 'Digit0', 'Period', 'Digit0', 'Period', 'Digit1', 'Backspace', 'Digit2']) {
      await key(code);
    }

    await snap('5-join-typed');
    await key('Enter');
    // no client session yet (STUB(T3.3)): the worker is restarted and JoinScreen is back with the message (the new worker
    // opens it before its first tick, so it never logs the main menu)
    await expect.poll(() => screens.slice(-3), { timeout: 20_000 }).toEqual(['OnlineScreen', 'JoinScreen', 'JoinScreen']);
    await page.waitForTimeout(2500);
    await snap('6-join-failed');
    expect(problems).toEqual([]);
    userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  } finally {
    await app.close();
    if (userData.includes('-profileon')) rmSync(userData, { recursive: true, force: true });
  }
});
