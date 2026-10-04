import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

interface Run {
  app: ElectronApplication;
  page: Page;
  screens: string[];
  problems: string[];
  userData: string;
}

async function launch(profile: string, resize = true): Promise<Run> {
  const app = await electron.launch({ args: ['.', `--profile=${profile}`], env: cleanEnv() });
  const page = await app.firstWindow();
  const run: Run = { app, page, screens: [], problems: [], userData: '' };
  page.on('console', (m) => {
    if (m.type() === 'error') run.problems.push('console.error: ' + m.text());
    if (m.type() === 'info' && m.text().includes('screen ')) run.screens.push(m.text().replace(/^.*screen /, ''));
  });
  page.on('pageerror', (e) => run.problems.push('pageerror: ' + e.message));
  await page.waitForSelector('canvas');
  if (resize) {
    // The stage is 800x600 at the origin of the page: the mouse coordinates are the coordinates of the game.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(800, 600);
    });
    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), { timeout: 10_000 }).toEqual([800, 600]);
  }
  run.userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  return run;
}

const last = (run: Run): string | undefined => run.screens[run.screens.length - 1];

async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
}

/** A click that changes the screen: repeated when the button was not there yet (the first launch is slow). */
async function clickTo(run: Run, x: number, y: number, screen: string): Promise<void> {
  for (let i = 0; i < 3 && last(run) !== screen; i++) {
    await clickAt(run.page, x, y);
    await expect.poll(() => last(run), { timeout: 6000 }).toBe(screen).catch(() => undefined);
  }
  await expect.poll(() => last(run), { timeout: 15_000 }).toBe(screen);
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

type SavedGame = { muteMusic: boolean; players?: { engineColor: number }[]; levels: { unlocked: boolean; stars: number }[] };

// T2.8: the progress and the settings survive a restart; a kill -9 does not break the files.
test('the save and the settings survive kill -9 and a restart: Level02 is unlocked, Classic 35 fps and the tier are kept', async () => {
  const profile = `persist${Date.now() % 1e9}`;
  let userData = '';
  try {
    // --- first start: a colour in the Garage (GameData.saveData), settings through window.at.settings ---
    const a = await launch(profile);
    userData = a.userData;
    await expect.poll(() => last(a), { timeout: 30_000 }).toBe('MainScreen');
    await a.page.waitForTimeout(2500);
    await clickTo(a, 400, 385, 'SelectScreen'); // Play
    await a.page.waitForTimeout(3000);
    await clickTo(a, 70, 400, 'GarageScreen');
    await a.page.waitForTimeout(2000);
    await clickAt(a.page, 151, 185 + 23); // the red colour of the engine of Player1
    await a.page.waitForTimeout(500);
    await clickTo(a, 694, 505, 'SelectScreen'); // Back: the choice is saved

    await a.page.evaluate(() => window.at.settings.set({ classic35: true, tier: '1x', netPort: 50123, lastJoinAddress: '10.1.2.3' }));
    const savePath = join(userData, 'save.json');
    const settingsPath = join(userData, 'settings.json');
    await expect
      .poll(() => (readJson(savePath)?.['alientransporter'] as SavedGame | undefined)?.players?.[0]?.engineColor, { timeout: 10_000 })
      .toBe(2);
    // (the window key is written by the main process, the rest by the renderer; both after the 500 ms of the debounce)
    await expect
      .poll(() => JSON.stringify(readJson(settingsPath)?.['netPort']) + JSON.stringify(readJson(settingsPath)?.['window'] !== undefined), { timeout: 10_000 })
      .toBe('50123true');
    expect(a.problems).toEqual([]);

    // kill -9: the process is gone at once, nothing is flushed
    a.app.process().kill('SIGKILL');
    await a.app.close().catch(() => undefined);

    // the files are whole objects after the kill
    const afterKill = readJson(savePath)?.['alientransporter'] as SavedGame | undefined;
    expect(afterKill?.players?.[0]?.engineColor).toBe(2);
    expect(afterKill?.levels).toHaveLength(20);
    expect(readJson(settingsPath)).toMatchObject({ classic35: true, tier: '1x', netPort: 50123, lastJoinAddress: '10.1.2.3' });

    // Level01 finished with three stars, Level02 open: what the save has after a level (headless: tests/unit/save-restart.test.ts)
    const full = readJson(savePath) as Record<string, SavedGame>;
    const game = full['alientransporter'] as SavedGame;
    (game.levels[0] as { stars: number }).stars = 3;
    (game.levels[1] as { unlocked: boolean }).unlocked = true;
    writeFileSync(savePath, JSON.stringify(full, null, 2), 'utf8');

    // --- second start: the same profile ---
    const b = await launch(profile);
    await expect.poll(() => last(b), { timeout: 30_000 }).toBe('MainScreen');
    await expect(b.page.evaluate(() => window.at.settings.get())).resolves.toMatchObject({ classic35: true, tier: '1x', netPort: 50123 });
    expect(await b.page.evaluate(() => [document.documentElement.dataset['classic'], document.documentElement.dataset['tier']])).toEqual(['true', '1x']);
    await b.page.waitForTimeout(2500);
    await clickTo(b, 400, 385, 'SelectScreen'); // Play
    await b.page.waitForTimeout(3500);
    await clickAt(b.page, 220, 149); // the button of Level02 exists only when it is unlocked: the ship goes to it
    await b.page.waitForTimeout(2000);
    await clickTo(b, 694, 505, 'GameScreen'); // Play
    await expect
      .poll(() => b.page.evaluate(() => document.documentElement.dataset['levelGroup']), { timeout: 30_000 })
      .toBe('2');
    expect(b.problems).toEqual([]);
    await b.app.close();
  } finally {
    if (userData.includes('-profilepersist')) rmSync(userData, { recursive: true, force: true });
  }
});

test('F2: the remaster settings panel; the keys do not reach the game; the changes are saved to settings.json', async () => {
  const profile = `remaster${Date.now() % 1e9}`;
  const run = await launch(profile);
  try {
    const open = (): Promise<string | undefined> => run.page.evaluate(() => document.documentElement.dataset['settingsOpen']);
    await expect.poll(() => last(run), { timeout: 30_000 }).toBe('MainScreen');
    await run.page.waitForTimeout(2500);

    await run.page.keyboard.press('F2');
    await expect.poll(open, { timeout: 5000 }).toBe('true');
    await run.page.waitForTimeout(500);
    if (process.env['T28_SHOTS'] !== undefined) await run.page.screenshot({ path: join(process.env['T28_SHOTS'], 'settings-overlay.png') });

    // while the panel is open the game does not see the keys and the mouse: Esc would open the pause, a click would press a button
    await run.page.keyboard.press('ArrowRight'); // Smooth motion -> Off (Classic 35 fps)
    await clickAt(run.page, 400, 385); // (the Play button of the menu under the panel; for the panel it is the row Network port)
    await run.page.waitForTimeout(500);
    expect(last(run)).toBe('MainScreen');

    await run.page.keyboard.press('ArrowUp');
    await run.page.keyboard.press('ArrowUp');
    await run.page.keyboard.press('ArrowRight'); // Graphics -> 1x
    await run.page.keyboard.press('ArrowDown');
    await run.page.keyboard.press('ArrowDown');
    for (const d of '51234') await run.page.keyboard.press('Digit' + d);
    await run.page.keyboard.press('Enter'); // Network port 51234
    await run.page.waitForTimeout(300);
    if (process.env['T28_SHOTS'] !== undefined) await run.page.screenshot({ path: join(process.env['T28_SHOTS'], 'settings-overlay-changed.png') });
    await run.page.keyboard.press('Escape');
    await expect.poll(open, { timeout: 5000 }).toBe('false');
    expect(await run.page.evaluate(() => document.documentElement.dataset['classic'])).toBe('true');

    const settingsPath = join(run.userData, 'settings.json');
    await expect.poll(() => readJson(settingsPath), { timeout: 10_000 }).toMatchObject({ classic35: true, tier: '1x', netPort: 51234 });

    // after the panel the game gets the mouse again
    await clickTo(run, 400, 385, 'SelectScreen');
    expect(run.problems).toEqual([]);
  } finally {
    await run.app.close();
    if (run.userData.includes('-profileremaster')) rmSync(run.userData, { recursive: true, force: true });
  }
});

test('the window: size, position and fullscreen are kept in settings.json and restored', async () => {
  const profile = `window${Date.now() % 1e9}`;
  let userData = '';
  try {
    const a = await launch(profile, false);
    userData = a.userData;
    const settingsPath = join(userData, 'settings.json');
    type Win = { x: number; y: number; width: number; height: number; fullscreen: boolean };
    const win = (): Win | undefined => readJson(settingsPath)?.['window'] as Win | undefined;

    await a.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setBounds({ x: 120, y: 90, width: 1010, height: 770 });
    });
    await expect.poll(() => win()?.width, { timeout: 10_000 }).toBe(1010);
    expect(win()).toMatchObject({ x: 120, y: 90, width: 1010, height: 770, fullscreen: false });
    await a.app.close(); // a graceful quit: the pending settings are flushed before the process exits

    const b = await launch(profile, false);
    const bounds = await b.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds());
    expect(bounds).toMatchObject({ x: 120, y: 90, width: 1010, height: 770 });

    // fullscreen at the moment of closing is restored
    await b.page.keyboard.press('F11');
    await expect.poll(() => win()?.fullscreen, { timeout: 15_000 }).toBe(true);
    await b.app.close();
    expect(win()).toMatchObject({ width: 1010, height: 770, fullscreen: true });

    const c = await launch(profile, false);
    await expect
      .poll(() => c.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen()), { timeout: 15_000 })
      .toBe(true);
    await c.app.close();
  } finally {
    if (userData.includes('-profilewindow')) rmSync(userData, { recursive: true, force: true });
  }
});
