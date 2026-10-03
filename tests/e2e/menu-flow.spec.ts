import { readFileSync, rmSync } from 'node:fs';
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

// T2.6: the flow of the original with the mouse: main menu -> Credits -> Play -> Level01 -> Esc -> Main menu (of the pause popup)
// -> Garage -> another colour -> Back. The log of the simulation says `screen <name>` when the screen changes.
test('menu -> Credits -> Play -> Level01 -> Esc -> Main menu -> Garage -> colour -> Back', async () => {
  // A profile of its own, new on every run: a saved game of an earlier run would change the start of the flow.
  const app = await electron.launch({ args: ['.', `--profile=mf${Date.now() % 1e9}`], env: cleanEnv() });
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

    // The stage is 800x600 at the origin of the page: the mouse coordinates are the coordinates of the game.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(800, 600);
    });
    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), { timeout: 10_000 }).toEqual([800, 600]);

    const readSprites = (): Promise<number> =>
      page.evaluate(() => Number(document.documentElement.dataset['sprites'] ?? '0'));
    // T26_SHOTS=<dir>: a screenshot of every step (to look at them next to the original)
    const snap = async (name: string): Promise<void> => {
      const dir = process.env['T26_SHOTS'];
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

    // A click that changes the screen: repeated when the button was not there yet (the first launch is slow).
    const clickTo = async (x: number, y: number, screen: string): Promise<void> => {
      for (let i = 0; i < 3 && lastScreen() !== screen; i++) {
        await clickAt(x, y);
        await expect.poll(lastScreen, { timeout: 6000 }).toBe(screen).catch(() => undefined);
      }

      await expect.poll(lastScreen, { timeout: 15_000 }).toBe(screen);
    };

    // 1. The main menu comes first; its buttons appear one after another (0.15 s pauses).
    await expect.poll(lastScreen, { timeout: 30_000 }).toBe('MainScreen');
    await expect.poll(readSprites, { timeout: 30_000 }).toBeGreaterThanOrEqual(4);
    await page.waitForTimeout(2500);
    await snap('1-main-menu');
    await clickTo(400 - 112, 385, 'CreditsScreen'); // Credits
    await page.waitForTimeout(2500);
    await snap('2-credits');
    await clickTo(400, 505, 'MainScreen'); // Back (BtnApply_mc)
    await page.waitForTimeout(2500);
    await clickTo(400, 385, 'SelectScreen'); // Play

    // 2. The level selection: the ship stands on Level01, a click on its button starts the level.
    await page.waitForTimeout(3000);
    await snap('3-select-level');
    await clickTo(160, 209, 'GameScreen'); // Level 01

    // 3. The level: the HUD and the buttons of the screen (dozens of sprites).
    await expect.poll(readSprites, { timeout: 30_000 }).toBeGreaterThan(30);
    await page.waitForTimeout(2000);
    await snap('4-level01');

    // 4. Esc: the pause popup, its Main menu button (-113, +73 from the popup at (400, 330)) leads to the selection.
    await page.keyboard.down('Escape');
    await page.waitForTimeout(150); // (a key shorter than a tick of the simulation, 29 ms, can be missed)
    await page.keyboard.up('Escape');
    await page.waitForTimeout(1500);
    await snap('pause');
    await clickTo(400 - 113, 330 + 73, 'SelectScreen');
    await page.waitForTimeout(3000);

    // 5. The garage.
    await clickTo(70, 400, 'GarageScreen');
    await page.waitForTimeout(2000);
    await snap('6-garage');
    await clickAt(151, 185 + 23); // the red colour of the engine of Player1 (the second button of the first bar)
    await page.waitForTimeout(500);
    await snap('7-garage-red');
    await clickTo(694, 505, 'SelectScreen'); // Back (BtnApply_mc): the choice is saved

    userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
    await expect
      .poll(
        () => {
          try {
            const save = JSON.parse(readFileSync(join(userData, 'save.json'), 'utf8')) as Record<
              string,
              { muteMusic: boolean; muteSounds: boolean; players?: { engineColor: number }[] }
            >;
            const data = Object.values(save)[0];
            return data?.muteMusic === false && data.muteSounds === false ? data.players?.[0]?.engineColor : undefined;
          } catch {
            return undefined;
          }
        },
        { timeout: 10_000 },
      )
      .toBe(2);

    expect(screens).toEqual(['MainScreen', 'CreditsScreen', 'MainScreen', 'SelectScreen', 'GameScreen', 'SelectScreen', 'GarageScreen', 'SelectScreen']);
    expect(problems).toEqual([]);
  } finally {
    await app.close();
    if (userData.includes('-profilemf')) rmSync(userData, { recursive: true, force: true });
  }
});
