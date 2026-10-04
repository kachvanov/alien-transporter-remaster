import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import WebSocket from 'ws';
import { getDiscovery } from '../../electron/net/discovery';
import { startProxy } from '../../tools/net/proxy';
import { launchApp, removeProfilesAfterEach } from './profile';

// T3.7: the manual checklist of docs/05-verification.md §8 on one machine, with real Electron instances: the host plays
// Level11 (docs/05 §9), the real client (`--join`) joins it directly or through the latency proxy (30 +- 15 ms each way).
// Measured: the delay of the input of the client (key -> the picture of the client changes, in the page of the client),
// the delay of the jitter buffer, the traffic host -> client (the log of the host), the discovery, "client closed",
// "host closed". T37_RUNS=<n> (default 1) repeats the latency measurement with a new client; T37_REPORT=1 prints the numbers.

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
const PROXY_PORT = 47030;
const RUNS = Math.max(1, Number(process.env['T37_RUNS'] ?? '1'));

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
}

const buildHash = (): string =>
  (JSON.parse(readFileSync(join(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as { buildHash: string }).buildHash;

const report = (line: string): void => {
  if (process.env['T37_REPORT'] !== undefined) console.log('[T3.7] ' + line);
};

/** (an error, e.g. the page is being reloaded, reads as an empty value) */
const read = (page: Page, key: string): Promise<string> =>
  page.evaluate((k) => document.documentElement.dataset[k] ?? '', key).catch(() => '');

interface Scenario {
  name: string;
  /** Port the client joins. */
  joinPort: number;
  /** Largest delay of the input that is accepted, ms. */
  maxInputMs: number;
}

/** key (ArrowUp = the gas) -> the sprites of the client grow with the ship of P2: ms from the keydown to the picture. */
async function measureInput(page: Page): Promise<number> {
  await page.evaluate(() => {
    const root = document.documentElement;
    const before = Number(root.dataset['sprites'] ?? '0');
    (window as unknown as { __lat: Promise<number> }).__lat = new Promise<number>((resolve) => {
      let t0 = 0;
      window.addEventListener(
        'keydown',
        (e) => {
          if (t0 === 0 && e.code === 'ArrowUp') t0 = performance.now();
        },
        true,
      );
      const obs = new MutationObserver(() => {
        if (t0 !== 0 && Number(root.dataset['sprites'] ?? '0') > before + 2) {
          obs.disconnect();
          resolve(performance.now() - t0);
        }
      });
      obs.observe(root, { attributes: true, attributeFilter: ['data-sprites'] });
      setTimeout(() => resolve(-1), 8000);
    });
  });
  await page.keyboard.down('ArrowUp');
  const ms = await page.evaluate(() => (window as unknown as { __lat: Promise<number> }).__lat);
  return ms;
}

async function runScenario(aScenario: Scenario): Promise<void> {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  test.skip(!(await portIsFree(PROXY_PORT)), `port ${PROXY_PORT} is taken`);
  const hostLog: string[] = [];
  const host: ElectronApplication = await launchApp({
    args: ['.', '--host-start', '--start-level=11', `--profile=e2e-n37h-${Date.now() % 1e9}`],
    env: cleanEnv(),
  });
  host.process().stdout?.on('data', (d: Buffer) => hostLog.push(d.toString()));
  const proxy = await startProxy({
    listenPort: PROXY_PORT,
    listenHost: '127.0.0.1',
    targetHost: '127.0.0.1',
    targetPort: PORT,
    delayMs: 30,
    jitterMs: 15,
  });
  const clients: ElectronApplication[] = [];
  const launchClient = async (): Promise<{ app: ElectronApplication; page: Page }> => {
    const app = await launchApp({
      args: ['.', `--join=127.0.0.1:${aScenario.joinPort}`, `--profile=e2e-n37c-${Date.now() % 1e9}`],
      env: cleanEnv(),
    });
    clients.push(app);
    const page = await app.firstWindow();
    await page.waitForSelector('canvas');
    await expect.poll(() => read(page, 'netState'), { timeout: 20_000 }).toBe('playing');
    return { app, page };
  };
  try {
    const hostPage = await host.firstWindow();
    await hostPage.waitForSelector('canvas');
    const hostTicks = (): Promise<number> => hostPage.evaluate(() => Number(document.documentElement.dataset['ticks'] ?? '0'));
    await expect.poll(hostTicks, { timeout: 30_000 }).toBeGreaterThan(40);
    await hostPage.waitForTimeout(1500);

    // The latency of the input and the delay of the jitter buffer (a new client for each run: P2 enters only once).
    const inputMs: number[] = [];
    const bufferMs: number[] = [];
    let last = await launchClient();
    for (let i = 0; i < RUNS; i++) {
      if (i > 0) {
        await last.app.close();
        clients.splice(clients.indexOf(last.app), 1);
        await expect.poll(() => hostLog.join('').split('client left').length, { timeout: 10_000 }).toBeGreaterThan(i);
        last = await launchClient();
      }

      await last.page.waitForTimeout(6000); // (the jitter buffer settles: its clock is slewed, a change of the delay takes seconds)
      bufferMs.push((Number(await read(last.page, 'jitterDelay')) * 1000) / 35);
      const ms = await measureInput(last.page);
      expect(ms, 'the picture of the client did not change after the key').toBeGreaterThan(0);
      inputMs.push(ms);
      await last.page.keyboard.up('ArrowUp');
    }

    const before = { u: Number(await read(last.page, 'jitterUnderruns')), d: Number(await read(last.page, 'jitterDropped')) };
    // Traffic: P2 flies for 20 s (the gas and a turn), the host tells what it sent when the client leaves.
    await last.page.keyboard.down('ArrowUp');
    await last.page.keyboard.down('ArrowLeft');
    await last.page.waitForTimeout(10_000);
    await last.page.keyboard.up('ArrowLeft');
    await last.page.keyboard.down('ArrowRight');
    await last.page.waitForTimeout(10_000);
    await last.page.keyboard.up('ArrowRight');
    await last.page.keyboard.up('ArrowUp');
    expect(await read(last.page, 'netState')).toBe('playing');
    const smooth = {
      underruns: Number(await read(last.page, 'jitterUnderruns')) - before.u,
      dropped: Number(await read(last.page, 'jitterDropped')) - before.d,
      delayTicks: await read(last.page, 'jitterDelay'),
    };
    report(`${aScenario.name}: over 20 s of play the client had ${smooth.underruns} underruns, ${smooth.dropped} dropped frames; jitter delay ${smooth.delayTicks} ticks`);
    const spritesWithP2 = Number(await read(hostPage, 'sprites'));

    // Checklist 3: the client is closed in the middle of the level: the host goes on, P2 is taken off the level.
    const t0 = await hostTicks();
    await last.app.close();
    clients.splice(clients.indexOf(last.app), 1);
    await expect.poll(() => hostLog.join('').includes('client left'), { timeout: 10_000 }).toBe(true);
    await hostPage.waitForTimeout(500);
    if (process.env['T37_SHOTS'] !== undefined) {
      await hostPage.screenshot({ path: join(process.env['T37_SHOTS'], `host-p2-disconnected-${aScenario.joinPort}.png`) }); // ("PLAYER 2 DISCONNECTED")
    }
    await hostPage.waitForTimeout(1000);
    expect(await hostTicks()).toBeGreaterThan(t0 + 35);
    const log = hostLog.join('');
    const m = /client left \((\w+)\); sent to it: avg ([\d.]+) KB\/s, peak ([\d.]+) KB\/s/.exec(log);
    expect(m, 'the host did not log the traffic:\n' + log).not.toBeNull();
    const [, reason, avg, peak] = m as unknown as [string, string, string, string];
    expect(reason).toBe('closed');
    report(`${aScenario.name}: input delay ms [${inputMs.map((x) => x.toFixed(0)).join(', ')}], jitter buffer ms [${bufferMs.map((x) => x.toFixed(0)).join(', ')}]`);
    report(`${aScenario.name}: host -> client avg ${avg} KB/s, peak ${peak} KB/s; host sprites with P2 ${spritesWithP2}, after ${await read(hostPage, 'sprites')}`);
    expect(Number(peak)).toBeLessThanOrEqual(500);
    expect(Number(avg)).toBeLessThanOrEqual(500);
    const sorted = [...inputMs].sort((a, b) => a - b);
    expect(sorted[sorted.length >> 1] as number, 'the median of the input delays, ms').toBeLessThanOrEqual(aScenario.maxInputMs);

    // Checklist 4: the host is closed: the client says "Connection lost" and goes back to the menu.
    const again = await launchClient();
    await again.page.waitForTimeout(1000);
    await host.close();
    await expect.poll(() => read(again.page, 'netState'), { timeout: 15_000 }).toBe('closed');
    expect(await read(again.page, 'netReason')).not.toBe('left');
    await again.page.waitForTimeout(500);
    await again.page.keyboard.press('Enter'); // OK of the message
    await expect.poll(() => read(again.page, 'mode'), { timeout: 15_000 }).toBe('local');
  } finally {
    for (const c of clients) await c.close().catch(() => undefined);
    await proxy.close();
    await host.close().catch(() => undefined);
  }
}

test('checklist 3, 4 and the numbers: the client joins directly', async () => {
  test.setTimeout(240_000);
  await runScenario({ name: 'direct', joinPort: PORT, maxInputMs: 100 });
});

test('checklist 5: the same through the latency proxy (30 +- 15 ms each way)', async () => {
  test.setTimeout(240_000);
  await runScenario({ name: 'proxy 30+-15', joinPort: PROXY_PORT, maxInputMs: 400 });
});

// Checklist 2: the beacon of the host is seen within 2 s of the start of the scan.
test('checklist 2: the discovery shows the host within 2 s', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  test.setTimeout(90_000);
  const host = await launchApp({
    args: ['.', '--host-start', `--profile=e2e-n37d-${Date.now() % 1e9}`],
    env: cleanEnv(),
  });
  const discovery = getDiscovery();
  try {
    const page = await host.firstWindow();
    await page.waitForSelector('canvas');
    await expect.poll(() => read(page, 'ticks'), { timeout: 30_000 }).not.toBe('');
    await page.waitForTimeout(1500); // (the beacon is on the air)
    const t0 = Date.now();
    await discovery.startScan(buildHash());
    let found = false;
    const stop = discovery.onUpdate((games) => {
      found = games.some((g) => g.port === PORT && g.buildHashMatches);
    });
    await expect.poll(() => found, { timeout: 3000, intervals: [50] }).toBe(true);
    const ms = Date.now() - t0;
    stop();
    report(`discovery: the host is seen ${ms} ms after the start of the scan`);
    expect(ms).toBeLessThanOrEqual(2000);
  } finally {
    discovery.stopScan();
    discovery.dispose();
    await host.close();
  }
});

// The host's half of the input path, without the client app: a ws client sends the gas bit and waits for the first Frame in
// which P2 has entered (the node count grows with the ship and its panel). Sending -> Frame on the socket: the wait for the
// next tick of the host (0..29 ms), the tick, the frame to the socket. The client adds its own input sampling, the jitter
// buffer (docs/03 §6) and the draw (see the numbers of the real client above).
test('the host half of the input path: gas bit -> the Frame with P2 (ws client, 5 runs)', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  test.setTimeout(120_000);
  const host = await launchApp({
    args: ['.', '--host-start', '--start-level=11', `--profile=e2e-n37p-${Date.now() % 1e9}`],
    env: cleanEnv(),
  });
  const samples: number[] = [];
  try {
    const page = await host.firstWindow();
    await page.waitForSelector('canvas');
    await expect.poll(() => read(page, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);
    await page.waitForTimeout(1500);
    for (let run = 0; run < 5; run++) {
      const ws = new WebSocket('ws://127.0.0.1:' + PORT);
      let nodeCount = -1;
      let seq = 0;
      let bits = 0;
      let frames = 0;
      let arrivedAt = 0; // performance.now() of the last Frame
      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary && data[0] === 0x01) {
          nodeCount = data.readUInt16LE(18);
          frames++;
          arrivedAt = performance.now();
        }
      });
      ws.on('error', () => undefined);
      const send = (): void => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const b = Buffer.alloc(6);
        b.writeUInt8(0x02, 0);
        b.writeUInt32LE(++seq, 1);
        b.writeUInt8(bits, 5);
        ws.send(b);
      };
      await expect.poll(() => ws.readyState, { timeout: 10_000 }).toBe(WebSocket.OPEN);
      ws.send(JSON.stringify({ t: 'hello', proto: 1, buildHash: buildHash(), name: 'e2e-lat', ship: { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 } }));
      const heartbeat = setInterval(send, 1000 / 35);
      try {
        await expect.poll(() => frames, { timeout: 5000 }).toBeGreaterThan(10);
        await new Promise((r) => setTimeout(r, 1200));
        const settled = nodeCount;
        const t0 = performance.now();
        bits = 1;
        send();
        while (nodeCount <= settled + 3 && performance.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 1));
        samples.push(arrivedAt - t0);
      } finally {
        clearInterval(heartbeat);
        ws.send(JSON.stringify({ t: 'bye' }));
        ws.close();
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  } finally {
    await host.close();
  }
  samples.sort((a, b) => a - b);
  report(`host half of the input path, ms: [${samples.map((x) => x.toFixed(0)).join(', ')}], median ${samples[2]?.toFixed(0)}`);
  expect(samples[0]).toBeGreaterThan(0);
  expect(samples[2]).toBeLessThanOrEqual(80);
});

// The Host screen: the addresses and the port, the TEST button (T3.7). The screen is driven with the mouse; the canvas has no
// text, so the result is read from the same call that the button makes (`window.at.net.selfTest`) and the screen is shot
// to T37_SHOTS=<dir> to be looked at.
test('Host screen: TEST connects to the own addresses (every one answers), a closed port fails', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  test.setTimeout(90_000);
  const app = await launchApp({ args: ['.', `--profile=e2e-n37s-${Date.now() % 1e9}`], env: cleanEnv() });
  try {
    const page = await app.firstWindow();
    const screens: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'info' && m.text().includes('screen ')) screens.push(m.text().replace(/^.*screen /, ''));
    });
    await page.waitForSelector('canvas');
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(800, 600);
    });
    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), { timeout: 10_000 }).toEqual([800, 600]);
    const lastScreen = (): string | undefined => screens[screens.length - 1];
    const click = async (x: number, y: number): Promise<void> => {
      await page.mouse.move(x, y);
      await page.waitForTimeout(150);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
    };
    const clickTo = async (x: number, y: number, screen: string): Promise<void> => {
      for (let i = 0; i < 4 && lastScreen() !== screen; i++) {
        await click(x, y);
        await expect.poll(lastScreen, { timeout: 6000 }).toBe(screen).catch(() => undefined);
      }
      await expect.poll(lastScreen, { timeout: 15_000 }).toBe(screen);
    };
    await expect.poll(lastScreen, { timeout: 30_000 }).toBe('MainScreen');
    await page.waitForTimeout(2500);
    await clickTo(512, 385, 'OnlineScreen');
    await page.waitForTimeout(2500);
    await clickTo(300, 385, 'HostScreen');
    await page.waitForTimeout(3000);
    const shot = async (name: string): Promise<void> => {
      const dir = process.env['T37_SHOTS'];
      if (dir !== undefined) await page.screenshot({ path: join(dir, name + '.png') });
    };
    await shot('host-before-test');
    await click(330, 505); // the TEST button
    await page.waitForTimeout(1500);
    await shot('host-after-test');

    const result = await page.evaluate(async () => {
      const addresses = await window.at.app.getLocalIPv4();
      return { addresses, ok: await window.at.net.selfTest(addresses, 47020), closed: await window.at.net.selfTest(['127.0.0.1'], 47999) };
    });
    report(`TEST: addresses ${result.addresses.join(', ') || '(none)'} -> ${JSON.stringify(result.ok.results)}`);
    if (result.addresses.length > 0) {
      expect(result.ok.ok).toBe(true);
    }
    expect(result.closed).toMatchObject({ ok: false, results: [{ address: '127.0.0.1', ok: false, error: 'ECONNREFUSED' }] });
  } finally {
    await app.close();
  }
});

// The pause bit of the client (docs/03 §4): the client holds `pauseReq` for 90 ms (3 heartbeats) after one press of P; the host
// must see ONE press of P: the pause is toggled once (the `paused` flag of the Frames), and a second press resumes.
test('pauseReq of the client = one press of P on the host (Frame flag `paused`)', async () => {
  test.skip(!(await portIsFree(PORT)), `port ${PORT} is taken (a game is running?)`);
  test.setTimeout(90_000);
  const host = await launchApp({
    args: ['.', '--host-start', '--start-level=1', `--profile=e2e-n37q-${Date.now() % 1e9}`],
    env: cleanEnv(),
  });
  let ws: WebSocket | null = null;
  let paused = false;
  let ticks = 0;
  let seq = 0;
  let bits = 0;
  const send = (): void => {
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    const b = Buffer.alloc(6);
    b.writeUInt8(0x02, 0);
    b.writeUInt32LE(++seq, 1);
    b.writeUInt8(bits, 5);
    ws.send(b);
  };
  let heartbeat: NodeJS.Timeout | null = null;
  try {
    const page = await host.firstWindow();
    await page.waitForSelector('canvas');
    await expect.poll(() => read(page, 'ticks').then(Number), { timeout: 30_000 }).toBeGreaterThan(40);
    await page.waitForTimeout(1500);
    const socket = new WebSocket('ws://127.0.0.1:' + PORT);
    ws = socket;
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary && data[0] === 0x01) {
        paused = ((data[5] as number) & 1) === 1;
        ticks++;
      }
    });
    socket.on('error', () => undefined);
    await expect.poll(() => socket.readyState, { timeout: 10_000 }).toBe(WebSocket.OPEN);
    socket.send(JSON.stringify({ t: 'hello', proto: 1, buildHash: buildHash(), name: 'e2e-pause', ship: { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 } }));
    heartbeat = setInterval(send, 1000 / 35);
    await expect.poll(() => ticks, { timeout: 5000 }).toBeGreaterThan(10);
    expect(paused).toBe(false);
    const press = async (): Promise<void> => {
      bits = 8; // INPUT_PAUSE_REQ, held 90 ms like the client does
      send();
      await new Promise((r) => setTimeout(r, 90));
      bits = 0;
      send();
    };
    await press();
    await expect.poll(() => paused, { timeout: 3000 }).toBe(true);
    await new Promise((r) => setTimeout(r, 1000)); // (it stays paused: the bit was ONE press, not a toggle every tick)
    expect(paused).toBe(true);
    await press();
    await expect.poll(() => paused, { timeout: 3000 }).toBe(false);
    await new Promise((r) => setTimeout(r, 1000));
    expect(paused).toBe(false);
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat);
    ws?.close();
    await host.close();
  }
});
