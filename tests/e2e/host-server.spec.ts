import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import WebSocket from 'ws';

// ELECTRON_RUN_AS_NODE (set by some hosts/CI) would make Electron start as plain Node.
function cleanEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

const PORT = 47020; // (the default port of the settings)

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}

const buildHash = (): string =>
  (JSON.parse(readFileSync(join(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as { buildHash: string }).buildHash;

interface Peer {
  ws: WebSocket;
  texts: string[];
  binaries: Buffer[];
  closeCode: () => number | null;
}

function peer(): Peer {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT);
  const p: Peer = { ws, texts: [], binaries: [], closeCode: () => code };
  let code: number | null = null;
  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) p.binaries.push(Buffer.from(data));
    else p.texts.push(data.toString());
  });
  ws.on('close', (c: number) => {
    code = c;
  });
  ws.on('error', () => undefined);
  return p;
}

async function launchHost(profile: string): Promise<{ app: ElectronApplication; page: Page; problems: string[] }> {
  const app = await electron.launch({ args: ['.', '--host-start', `--profile=${profile}`], env: cleanEnv() });
  const page = await app.firstWindow();
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console.error: ' + m.text());
  });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.waitForSelector('canvas');
  return { app, page, problems };
}

// T3.2: `--host-start` hosts at once. A plain ws client (what `websocat` would be) says hello and gets the binary Frames
// at ~35/s straight from the main process; the other cases of the handshake; the game of the host goes on.
test('host: hello -> welcome, Frames ~35/s, reject version/full, the host goes on when the client leaves', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  const { app, page, problems } = await launchHost(`e2e-host${Date.now() % 1e9}`);
  try {
    const ticks = (): Promise<number> => page.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0'));
    await expect.poll(ticks, { timeout: 30_000 }).toBeGreaterThan(5);

    // the server is up as soon as the Host request is carried out: retry the connection for a few seconds
    let bad: Peer | null = null;
    await expect
      .poll(
        async () => {
          bad = peer();
          await new Promise((r) => setTimeout(r, 300));
          return bad.ws.readyState === WebSocket.OPEN;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    const wrong = bad as unknown as Peer;
    wrong.ws.send(JSON.stringify({ t: 'hello', proto: 1, buildHash: 'x', name: 'Old', ship: { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 } }));
    await expect.poll(wrong.closeCode, { timeout: 5000 }).toBe(4001);
    expect(JSON.parse(wrong.texts[0] ?? 'null')).toEqual({ t: 'reject', reason: 'version' });

    const good = peer();
    await expect.poll(() => good.ws.readyState, { timeout: 5000 }).toBe(WebSocket.OPEN);
    good.ws.send(JSON.stringify({ t: 'hello', proto: 1, buildHash: buildHash(), name: 'websocat', ship: { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 } }));
    await expect.poll(() => good.texts.length, { timeout: 5000 }).toBeGreaterThan(0);
    const welcome = JSON.parse(good.texts[0] ?? 'null') as { t: string; tickRate: number; hostName: string };
    expect(welcome.t).toBe('welcome');
    expect(welcome.tickRate).toBe(35);
    expect(welcome.hostName.length).toBeGreaterThan(0);

    // a second client: the slot is taken
    const second = peer();
    await expect.poll(() => second.closeCode(), { timeout: 5000 }).toBe(4000);
    expect(JSON.parse(second.texts[0] ?? 'null')).toEqual({ t: 'reject', reason: 'full' });

    // the Frames: ~35 a second, each a valid header (type 0x01, nodeCount*... at least 26 bytes)
    const n0 = good.binaries.length;
    await page.waitForTimeout(3000);
    const rate = (good.binaries.length - n0) / 3;
    expect(rate).toBeGreaterThan(30);
    expect(rate).toBeLessThan(40);
    for (const b of good.binaries.slice(-20)) {
      expect(b[0]).toBe(0x01);
      expect(b.length).toBeGreaterThanOrEqual(26);
    }

    // the client leaves; the game of the host goes on
    good.ws.send(JSON.stringify({ t: 'bye' }));
    await expect.poll(good.closeCode, { timeout: 5000 }).not.toBeNull();
    const t0 = await ticks();
    await page.waitForTimeout(1000);
    expect(await ticks()).toBeGreaterThan(t0 + 20);
    expect(problems).toEqual([]);
  } finally {
    await app.close();
  }
});

// T3.2 + T3.3: the real client of the app (`--join=127.0.0.1`) against the real host, two Electron instances.
test('host + the real client (--join): the client plays the frames of the host', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  const host = await launchHost(`e2e-host${Date.now() % 1e9}`);
  let client: ElectronApplication | null = null;
  try {
    await expect.poll(() => host.page.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0')), { timeout: 30_000 }).toBeGreaterThan(5);
    await host.page.waitForTimeout(1500); // (the server is up)
    client = await electron.launch({ args: ['.', '--join=127.0.0.1', `--profile=e2e-client${Date.now() % 1e9}`], env: cleanEnv() });
    const page = await client.firstWindow();
    const clientProblems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') clientProblems.push('console.error: ' + m.text());
    });
    page.on('pageerror', (e) => clientProblems.push('pageerror: ' + e.message));
    await page.waitForSelector('canvas');
    const read = (k: string): Promise<string> => page.evaluate((key) => document.documentElement.dataset[key] ?? '', k);
    await expect.poll(() => read('netState'), { timeout: 20_000 }).toBe('playing');
    await expect.poll(async () => Number(await read('ticks')), { timeout: 15_000 }).toBeGreaterThan(20);
    await expect.poll(async () => Number(await read('sprites')), { timeout: 15_000 }).toBeGreaterThan(10);
    const t0 = Number(await read('ticks'));
    await page.waitForTimeout(2000);
    expect(Number(await read('ticks')) - t0).toBeGreaterThan(50); // (35 ticks a second)
    expect(await read('netState')).toBe('playing');
    expect(clientProblems).toEqual([]);
    expect(host.problems).toEqual([]);
  } finally {
    await client?.close();
    await host.app.close();
  }
});
