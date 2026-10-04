import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import WebSocket from 'ws';
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

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}

const buildHash = (): string =>
  (JSON.parse(readFileSync(join(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as { buildHash: string }).buildHash;

/** A client of the protocol (docs/03 §3, §4): hello, then the Input bits and the node count of the Frames it gets. */
class Client {
  readonly ws = new WebSocket('ws://127.0.0.1:' + PORT);
  texts: string[] = [];
  nodeCount = -1;
  frames = 0;
  closeCode: number | null = null;
  private _seq = 0;
  private _bits = 0;
  private _timer: NodeJS.Timeout | null = null;

  constructor() {
    this.ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        this.frames++;
        if (data[0] === 0x01) this.nodeCount = data.readUInt16LE(18);
      } else {
        this.texts.push(data.toString());
      }
    });
    this.ws.on('close', (c: number) => {
      this.closeCode = c;
    });
    this.ws.on('error', () => undefined);
  }

  hello(aShip: { shuttleKind: number; shuttleColor: number; engineKind: number; engineColor: number }): void {
    this.ws.send(JSON.stringify({ t: 'hello', proto: 1, buildHash: buildHash(), name: 'e2e-p2', ship: aShip }));
    this._timer = setInterval(() => this.sendBits(this._bits), 1000 / 35); // (the heartbeat of docs/03 §4)
  }

  setBits(aBits: number): void {
    this._bits = aBits;
    this.sendBits(aBits);
  }

  private sendBits(aBits: number): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const b = Buffer.alloc(6);
    b.writeUInt8(0x02, 0);
    b.writeUInt32LE(++this._seq, 1);
    b.writeUInt8(aBits, 5);
    this.ws.send(b);
  }

  close(): void {
    if (this._timer !== null) clearInterval(this._timer);
    this.ws.close();
  }
}

// T3.6: the host plays Level01; a client joins in the middle of the level, flies with its gas, leaves and comes back.
// The Frames that the client gets show the shuttle of P2 (the number of the nodes grows with it: the ship, its panel).
test('host (Level01): the client enters with its gas, leaves, comes back', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  const app: ElectronApplication = await launchApp({
    args: ['.', '--host-start', '--start-level=1', `--profile=e2e-p2-${Date.now() % 1e9}`],
    env: cleanEnv(),
  });
  const problems: string[] = [];
  const clients: Client[] = [];
  try {
    const page = await app.firstWindow();
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push('console.error: ' + m.text());
    });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    await page.waitForSelector('canvas');
    const ticks = (): Promise<number> => page.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0'));
    await expect.poll(ticks, { timeout: 30_000 }).toBeGreaterThan(40);

    const join = async (): Promise<Client> => {
      const c = new Client();
      clients.push(c);
      await expect.poll(() => c.ws.readyState, { timeout: 20_000 }).toBe(WebSocket.OPEN);
      c.hello({ shuttleKind: 2, shuttleColor: 4, engineKind: 3, engineColor: 5 });
      await expect.poll(() => c.texts.length, { timeout: 5000 }).toBeGreaterThan(0);
      expect((JSON.parse(c.texts[0] ?? 'null') as { t: string }).t).toBe('welcome');
      await expect.poll(() => c.frames, { timeout: 5000 }).toBeGreaterThan(5);
      return c;
    };
    /** The node count while nothing changes on the screen of the level (the median of a second of Frames). */
    const settled = async (c: Client): Promise<number> => {
      await page.waitForTimeout(1200);
      return c.nodeCount;
    };

    // 1. A client joins in the middle of the level: it only watches, P2 has not entered
    const c1 = await join();
    const watching = await settled(c1);
    expect(watching).toBeGreaterThan(20);

    // 2. Its gas: P2 enters (the ship and its panel are new nodes)
    c1.setBits(1);
    await expect.poll(() => c1.nodeCount, { timeout: 5000 }).toBeGreaterThan(watching + 3);
    c1.setBits(0);

    // 3. The client leaves: P2 is taken off the level, the host goes on (and shows the notice)
    c1.ws.send(JSON.stringify({ t: 'bye' }));
    await expect.poll(() => c1.closeCode, { timeout: 5000 }).not.toBeNull();
    await page.waitForTimeout(500);
    const t0 = await ticks();
    await page.waitForTimeout(1000);
    expect(await ticks()).toBeGreaterThan(t0 + 20);

    // 4. A client comes back and enters again
    const c2 = await join();
    const waiting = await settled(c2);
    c2.setBits(1);
    await expect.poll(() => c2.nodeCount, { timeout: 5000 }).toBeGreaterThan(waiting + 3);
    expect(problems).toEqual([]);
  } finally {
    for (const c of clients) c.close();
    await app.close();
  }
});

// The real client of the app (`--join`) against the real host: the key of the client (Up) is the gas of P2 on the host,
// and the client sees its own ship appear on its screen (the sprites grow with the ship and its panel).
test('host (Level01) + the real client: its gas key makes P2 enter', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  const host = await launchApp({
    args: ['.', '--host-start', '--start-level=1', `--profile=e2e-p2h-${Date.now() % 1e9}`],
    env: cleanEnv(),
  });
  let client: ElectronApplication | null = null;
  try {
    const hostPage = await host.firstWindow();
    await hostPage.waitForSelector('canvas');
    const hostTicks = (): Promise<number> => hostPage.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0'));
    await expect.poll(hostTicks, { timeout: 30_000 }).toBeGreaterThan(40);
    await hostPage.waitForTimeout(1500);
    client = await launchApp({ args: ['.', '--join=127.0.0.1', `--profile=e2e-p2c-${Date.now() % 1e9}`], env: cleanEnv() });
    const page = await client.firstWindow();
    await page.waitForSelector('canvas');
    const read = (k: string): Promise<string> => page.evaluate((key) => document.documentElement.dataset[key] ?? '', k);
    await expect.poll(() => read('netState'), { timeout: 20_000 }).toBe('playing');
    await page.waitForTimeout(1500);
    const before = Number(await read('sprites'));
    await page.keyboard.down('ArrowUp'); // (the gas)
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowUp');
    await expect.poll(async () => Number(await read('sprites')), { timeout: 8000 }).toBeGreaterThan(before + 2);
  } finally {
    await client?.close();
    await host.close();
  }
});
