import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp, removeProfilesAfterEach } from './profile';

// T5.2: the safety net and crash.log. The renderer is crashed on purpose (`webContents.forcefullyCrashRenderer()`), the GPU process is
// killed: the app must come back to the menu, say so, and write the events into <userData>/crash.log.

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...process.env, AT_DIAG_STATE_MS: '1500' }).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

removeProfilesAfterEach();

const PORT = 47020;

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}

const read = (page: Page, key: string): Promise<string> =>
  page.evaluate((k) => document.documentElement.dataset[k] ?? '', key);

/**
 * A `data-` attribute of <html> of the window, read in the main process: after a crash Playwright keeps the Page object of the
 * dead renderer ("Target crashed"), so the fresh page is asked through `webContents.executeJavaScript`.
 */
async function readMain(app: ElectronApplication, key: string): Promise<string> {
  try {
    // (a page that is being replaced never answers: every ask has a time limit)
    return await app.evaluate(
      ({ BrowserWindow }, k) =>
        Promise.race([
          BrowserWindow.getAllWindows()[0]!.webContents.executeJavaScript(`document.documentElement.dataset[${JSON.stringify(k)}] ?? ''`) as Promise<string>,
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500)),
        ]),
      key,
    );
  } catch {
    return '';
  }
}

async function pressEnter(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  });
}

async function crashLogText(app: ElectronApplication): Promise<string> {
  const dir = await app.evaluate(({ app: a }) => a.getPath('userData'));
  return readFile(join(dir, 'crash.log'), 'utf8').catch(() => '');
}

test('solo: the renderer crashes -> the window comes back at the menu with a message, crash.log has the events', async () => {
  const app = await launchApp({ args: ['.', `--profile=e2e-t52a-${Date.now() % 1e9}`], env: cleanEnv() });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('canvas');
    await expect.poll(() => read(page, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);
    expect(await read(page, 'crashNotice')).toBe(''); // (no notice on a normal start)

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer();
    });

    // the fresh page: the menu is running again and the message is open
    await expect.poll(() => readMain(app, 'crashNotice'), { timeout: 30_000 }).toBe('open');
    await expect.poll(() => readMain(app, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(10);
    await new Promise((r) => setTimeout(r, 1500)); // (the font is loaded, the message is drawn)
    const png = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'),
    );
    await writeFile(test.info().outputPath('crash-notice.png'), Buffer.from(png, 'base64'));
    await pressEnter(app);
    await expect.poll(() => readMain(app, 'crashNotice'), { timeout: 5000 }).toBe('closed');

    // crash.log: the start, a state line, the crash and the recovery, in this order; one line per event; no user name
    await expect.poll(async () => (await crashLogText(app)).includes(' STATE '), { timeout: 10_000 }).toBe(true);
    const text = await crashLogText(app);
    const lines = text.trimEnd().split('\n');
    const at = (name: string): number => lines.findIndex((l) => l.includes(` ${name} `) || l.endsWith(` ${name}`));
    expect(at('START')).toBe(0);
    expect(at('RENDER_GONE')).toBeGreaterThan(0);
    expect(at('RECOVER')).toBeGreaterThan(at('RENDER_GONE'));
    expect(lines[at('RENDER_GONE')]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z local v\S+ \w+\/\w+ RENDER_GONE reason=(crashed|killed)/);
    expect(lines[at('RECOVER')]).toContain('cause=render_gone');
    expect(lines[at('RECOVER')]).toContain('to=local:crashed');
    expect(text).not.toContain(process.env['USER'] ?? '\u0000no-user');
    const state = lines.find((l) => l.includes(' STATE ')) ?? '';
    expect(state).toMatch(/ram_total=\d+/);
    expect(state).toMatch(/ram_renderer=\d+/);
  } finally {
    await app.close().catch(() => undefined);
  }
});

test('the GPU process is killed -> crash.log has it, the game is not left on a dead screen', async () => {
  const app = await launchApp({ args: ['.', `--profile=e2e-t52g-${Date.now() % 1e9}`], env: cleanEnv() });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('canvas');
    await expect.poll(() => read(page, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);
    const pid = await app.evaluate(({ app: a }) => a.getAppMetrics().find((m) => m.type === 'GPU')?.pid ?? 0);
    test.skip(pid === 0, 'no separate GPU process in this environment');
    await app.evaluate((_e, p) => process.kill(p, 'SIGKILL'), pid);

    await expect.poll(async () => (await crashLogText(app)).includes(' CHILD_GONE type=GPU'), { timeout: 15_000 }).toBe(true);
    // Either the WebGL context came back by itself, or after 6 s the window was replaced (menu + message): both are alive.
    await expect
      .poll(
        async () => {
          const text = await crashLogText(app);
          return text.includes(' WEBGL_CONTEXT_RESTORED ') || text.includes(' RECOVER ');
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const before = Number(await readMain(app, 'ticks'));
    await expect.poll(() => readMain(app, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(before + 20);
    // a frame is on the screen (not white or black): the sprites are counted by the renderer
    expect(Number(await readMain(app, 'sprites'))).toBeGreaterThan(0);
  } finally {
    await app.close().catch(() => undefined);
  }
});

test('host and client: the client crashes -> JoinScreen "lost"; the host crashes -> its port is free again (the slot is closed)', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  const stamp = Date.now() % 1e9;
  const apps: ElectronApplication[] = [];
  try {
    const host = await launchApp({ args: ['.', '--host-start', '--start-level=1', `--profile=e2e-t52h-${stamp}`], env: cleanEnv() });
    apps.push(host);
    const hostPage = await host.firstWindow();
    await hostPage.waitForSelector('canvas');
    await expect.poll(() => read(hostPage, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);

    const client = await launchApp({ args: ['.', `--join=127.0.0.1:${PORT}`, `--profile=e2e-t52c-${stamp}`], env: cleanEnv() });
    apps.push(client);
    const clientPage = await client.firstWindow();
    await clientPage.waitForSelector('canvas');
    await expect.poll(() => read(clientPage, 'netState'), { timeout: 20_000 }).toBe('playing');
    await expect.poll(() => read(clientPage, 'jitterPending').then(Number), { timeout: 5000 }).toBeLessThanOrEqual(8);
    // the client log has its role from the first line of the session
    await expect.poll(async () => (await crashLogText(client)).includes(' client '), { timeout: 5000 }).toBe(true);

    // 1. the client's renderer dies: it comes back as a local game on the Join screen with the failure; the host goes on
    await client.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer();
    });
    await expect
      .poll(async () => (await crashLogText(client)).includes(' RECOVER '), { timeout: 30_000 })
      .toBe(true);
    const clientText = await crashLogText(client);
    expect(clientText).toMatch(/ client v\S+ \S+ RENDER_GONE /);
    expect(clientText).toMatch(/ RECOVER cause=render_gone detail=\S+ role=client to=local:lost/);
    await expect.poll(() => readMain(client, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(5);
    expect(await readMain(client, 'crashNotice')).toBe(''); // (the client sees JoinScreen, not the menu notice)
    // the host: the client left, the host plays on
    const hostTicks = Number(await read(hostPage, 'ticks'));
    await expect.poll(() => read(hostPage, 'ticks').then(Number), { timeout: 10_000 }).toBeGreaterThan(hostTicks + 20);

    // 2. a client joins again and the host's renderer dies: the host server goes with it, the port is free, the client is told
    const client2 = await launchApp({ args: ['.', `--join=127.0.0.1:${PORT}`, `--profile=e2e-t52d-${stamp}`], env: cleanEnv() });
    apps.push(client2);
    const c2 = await client2.firstWindow();
    await c2.waitForSelector('canvas');
    await expect.poll(() => read(c2, 'netState'), { timeout: 20_000 }).toBe('playing');
    await host.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer();
    });
    await expect.poll(() => read(c2, 'netState'), { timeout: 20_000 }).toBe('closed');
    expect(await read(c2, 'netReason')).toBe('host_quit');
    await expect.poll(async () => (await crashLogText(host)).includes(' RECOVER '), { timeout: 30_000 }).toBe(true);
    const hostText = await crashLogText(host);
    expect(hostText).toMatch(/ host v\S+ \S+ RENDER_GONE /);
    expect(hostText).toMatch(/ RECOVER cause=render_gone detail=\S+ role=host to=local:crashed/);
    await expect.poll(() => portIsFree(PORT), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => readMain(host, 'crashNotice'), { timeout: 30_000 }).toBe('open');
  } finally {
    for (const a of apps.reverse()) await a.close().catch(() => undefined);
  }
});
