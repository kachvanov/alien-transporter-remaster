// T3.7: the tools of the network verification: the latency proxy (tools/net), the traffic meter of the host, the TEST of the
// Host screen (electron/net/selfTest.ts), and the constants that are kept equal in two places by hand.
import { createServer, connect, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DISCOVERY_PROTO } from '../../electron/net/discovery';
import { probeTcp, selfTest } from '../../electron/net/selfTest';
import { formatTraffic, TrafficMeter } from '../../electron/net/trafficMeter';
import { HostServer } from '../../electron/net/wsServer';
import { DelayLine } from '../../tools/net/delayLine';
import { probeHost } from '../../tools/net/probe';
import { parseProxyArgs, startProxy } from '../../tools/net/proxy';
import { PROTO_VERSION } from '../../src/net/protocol';

describe('constants kept in two places', () => {
  it('the protocol version of the beacon (electron/net/discovery.ts) equals the one of the handshake (src/net/protocol.ts)', () => {
    expect(DISCOVERY_PROTO).toBe(PROTO_VERSION);
  });
});

//---------------------------------------
// DelayLine
//---------------------------------------

/** A fake clock and timer. */
function fakeTime() {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 0;
  return {
    now: () => now,
    schedule: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return () => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = timers[0];
        if (t === undefined || t.at > end) break;
        timers.shift();
        now = Math.max(now, t.at);
        t.fn();
      }
      now = end;
    },
  };
}

describe('DelayLine', () => {
  it('delivers every item delay +- jitter after it came in', () => {
    const clock = fakeTime();
    const out: [string, number][] = [];
    const randoms = [0.5, 1, 0]; // jitter 0, +15, -15
    const line = new DelayLine<string>({
      delayMs: 30,
      jitterMs: 15,
      deliver: (x) => out.push([x, clock.now()]),
      now: clock.now,
      schedule: clock.schedule,
      random: () => randoms.shift() ?? 0.5,
    });
    line.push('a'); // due at 30
    clock.advance(100);
    line.push('b'); // due at 100 + 45
    clock.advance(100);
    line.push('c'); // due at 200 + 15
    clock.advance(100);
    expect(out).toEqual([
      ['a', 30],
      ['b', 145],
      ['c', 215],
    ]);
    expect(line.pending).toBe(0);
  });

  it('keeps the order: an item never overtakes the one before it, whatever the jitter', () => {
    const clock = fakeTime();
    const out: number[] = [];
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const line = new DelayLine<number>({
      delayMs: 30,
      jitterMs: 25,
      deliver: (x) => out.push(x),
      now: clock.now,
      schedule: clock.schedule,
      random: rnd,
    });
    for (let i = 0; i < 500; i++) {
      line.push(i);
      clock.advance(rnd() * 8);
    }
    clock.advance(1000);
    expect(out).toEqual(Array.from({ length: 500 }, (_, i) => i));
  });

  it('a delay of 0 and a jitter of 0 deliver at the same time, close() drops what waits', () => {
    const clock = fakeTime();
    const out: number[] = [];
    const line = new DelayLine<number>({ delayMs: 0, jitterMs: 0, deliver: (x) => out.push(x), now: clock.now, schedule: clock.schedule });
    line.push(1);
    clock.advance(0);
    expect(out).toEqual([1]);
    const slow = new DelayLine<number>({ delayMs: 50, jitterMs: 0, deliver: (x) => out.push(x), now: clock.now, schedule: clock.schedule });
    slow.push(2);
    slow.close();
    slow.push(3);
    clock.advance(500);
    expect(out).toEqual([1]);
  });
});

describe('parseProxyArgs', () => {
  it('the options of the card, `--name value` and `--name=value`', () => {
    expect(parseProxyArgs(['--listen', '47030', '--target', '127.0.0.1:47020', '--delay', '30', '--jitter', '15'])).toEqual({
      listenPort: 47030,
      targetHost: '127.0.0.1',
      targetPort: 47020,
      delayMs: 30,
      jitterMs: 15,
    });
    expect(parseProxyArgs(['--listen=1234', '--target=host.local:99'])).toMatchObject({ listenPort: 1234, targetHost: 'host.local', targetPort: 99, delayMs: 30, jitterMs: 15 });
  });

  it('rejects what is not an option, a bad number or a bad target', () => {
    expect(() => parseProxyArgs(['47030'])).toThrow();
    expect(() => parseProxyArgs(['--delay'])).toThrow();
    expect(() => parseProxyArgs(['--delay', '-1'])).toThrow();
    expect(() => parseProxyArgs(['--delay', 'x'])).toThrow();
    expect(() => parseProxyArgs(['--target', 'nohost'])).toThrow();
    expect(() => parseProxyArgs(['--target', 'a:0'])).toThrow();
    expect(() => parseProxyArgs(['--foo', '1'])).toThrow();
  });
});

//---------------------------------------
// The proxy on real sockets
//---------------------------------------

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

function listen(aServer: Server): Promise<number> {
  return new Promise((resolve) => {
    aServer.listen(0, '127.0.0.1', () => {
      closers.push(() => new Promise<void>((r) => aServer.close(() => r())));
      resolve((aServer.address() as { port: number }).port);
    });
  });
}

describe('latency proxy', () => {
  it('delays both directions, keeps the bytes and their order', async () => {
    const sockets: Socket[] = [];
    const echo = createServer((s) => {
      sockets.push(s);
      s.on('data', (d) => s.write(d));
    });
    closers.push(() => sockets.forEach((s) => s.destroy()));
    const targetPort = await listen(echo);
    const proxy = await startProxy({ listenPort: 0, listenHost: '127.0.0.1', targetHost: '127.0.0.1', targetPort, delayMs: 40, jitterMs: 15 });
    closers.push(() => proxy.close());

    const client = connect({ host: '127.0.0.1', port: proxy.port });
    client.setNoDelay(true);
    closers.push(() => void client.destroy());
    const received: Buffer[] = [];
    client.on('data', (d: Buffer) => received.push(d));
    await new Promise<void>((r) => client.once('connect', () => r()));

    // the round trip takes 2 x (40 +- 15): between 50 and 110 ms (plus the scheduling of the timers)
    const t0 = performance.now();
    client.write(Buffer.from('ping'));
    while (Buffer.concat(received).length < 4) await new Promise((r) => setTimeout(r, 1));
    const rtt = performance.now() - t0;
    expect(rtt).toBeGreaterThanOrEqual(48);
    expect(rtt).toBeLessThan(250);

    // a stream of many small writes comes back whole and in order
    received.length = 0;
    const sent: number[] = [];
    for (let i = 0; i < 300; i++) {
      client.write(Buffer.from([i & 255, (i >> 8) & 255]));
      sent.push(i & 255, (i >> 8) & 255);
      if (i % 20 == 0) await new Promise((r) => setTimeout(r, 2));
    }
    while (Buffer.concat(received).length < sent.length) await new Promise((r) => setTimeout(r, 5));
    expect([...Buffer.concat(received)]).toEqual(sent);
    expect(proxy.stats.up).toBe(4 + sent.length);
    expect(proxy.stats.down).toBe(4 + sent.length);
  });

  it('the end of a side reaches the other side after the data, and a refused target closes the client', async () => {
    const chunks: Buffer[] = [];
    let ended = false;
    const sink = createServer((s) => {
      s.on('data', (d) => chunks.push(d));
      s.on('end', () => {
        ended = true;
        s.end();
      });
    });
    const targetPort = await listen(sink);
    const proxy = await startProxy({ listenPort: 0, listenHost: '127.0.0.1', targetHost: '127.0.0.1', targetPort, delayMs: 20, jitterMs: 10 });
    closers.push(() => proxy.close());
    const client = connect({ host: '127.0.0.1', port: proxy.port });
    closers.push(() => void client.destroy());
    client.on('error', () => undefined);
    client.end(Buffer.from('last words'));
    while (!ended) await new Promise((r) => setTimeout(r, 5));
    expect(Buffer.concat(chunks).toString()).toBe('last words');

    // nobody listens at the target
    const dead = createServer();
    const deadPort = await listen(dead);
    await new Promise<void>((r) => dead.close(() => r()));
    const proxy2 = await startProxy({ listenPort: 0, listenHost: '127.0.0.1', targetHost: '127.0.0.1', targetPort: deadPort, delayMs: 5, jitterMs: 0 });
    closers.push(() => proxy2.close());
    const client2 = connect({ host: '127.0.0.1', port: proxy2.port });
    client2.on('error', () => undefined);
    await new Promise<void>((r) => client2.once('close', () => r()));
  });
});

//---------------------------------------
// TrafficMeter, HostServer.traffic
//---------------------------------------

describe('TrafficMeter', () => {
  it('total, average and the peak of a full second', () => {
    const m = new TrafficMeter();
    expect(m.stats).toMatchObject({ bytes: 0, avgBytesPerSec: 0, peakBytesPerSec: 0 });
    for (let t = 0; t <= 4000; t += 100) m.add(1000, 5000 + t); // 10 KB a second, 41 writes over 4 s
    m.add(50_000, 9500); // a burst in the fifth second (the last, incomplete bucket is not the peak)
    const s = m.stats;
    expect(s.bytes).toBe(41 * 1000 + 50_000);
    expect(s.seconds).toBeCloseTo(4.5, 5);
    expect(s.avgBytesPerSec).toBeCloseTo((41_000 + 50_000) / 4.5, 5);
    expect(s.peakBytesPerSec).toBe(10_000);
    m.add(1, 11_000);
    expect(m.stats.peakBytesPerSec).toBe(51_000); // (now the second with the burst is complete)
    m.reset();
    expect(m.stats.bytes).toBe(0);
  });

  it('a short run counts as one second, the text', () => {
    const m = new TrafficMeter();
    m.add(2048, 100);
    m.add(2048, 300);
    expect(m.stats.seconds).toBe(1);
    expect(m.stats.avgBytesPerSec).toBe(4096);
    expect(m.stats.peakBytesPerSec).toBe(4096);
    expect(formatTraffic(m.stats)).toBe('avg 4.0 KB/s, peak 4.0 KB/s (0.00 MB in 1 s)');
  });

  it('HostServer counts the frames it sends to the client', async () => {
    const WebSocket = (await import('ws')).default;
    const server = new HostServer({ buildHash: 'h', hostName: 'x' });
    await server.start(0);
    closers.push(() => void server.stop());
    expect(server.traffic.bytes).toBe(0);
    const ws = new WebSocket('ws://127.0.0.1:' + server.port);
    closers.push(() => ws.close());
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ t: 'hello', proto: PROTO_VERSION, buildHash: 'h', name: 'p', ship: { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 } }));
    while (!server.hasClient) await new Promise((r) => setTimeout(r, 5));
    expect(server.sendFrame(new Uint8Array(1500))).toBe(true);
    expect(server.sendFrame(new Uint8Array(500))).toBe(true);
    expect(server.traffic.bytes).toBe(2000);
  });
});

//---------------------------------------
// selfTest
//---------------------------------------

describe('selfTest (the TEST button of the Host screen)', () => {
  it('OK for an address that the server listens on, ECONNREFUSED for a closed port, empty list is not OK', async () => {
    const server = createServer((s) => s.destroy());
    const port = await listen(server);
    expect(await probeTcp('127.0.0.1', port, 1000)).toEqual({ address: '127.0.0.1', ok: true });
    expect(await selfTest(['127.0.0.1'], port)).toEqual({ ok: true, port, results: [{ address: '127.0.0.1', ok: true }] });

    await new Promise<void>((r) => server.close(() => r()));
    const closed = await selfTest(['127.0.0.1'], port);
    expect(closed.ok).toBe(false);
    expect(closed.results[0]).toEqual({ address: '127.0.0.1', ok: false, error: 'ECONNREFUSED' });

    expect(await selfTest([], port)).toEqual({ ok: false, port, results: [] });
  });

  it('one address that does not answer makes the whole test fail', async () => {
    const server = createServer((s) => s.destroy());
    const port = await listen(server);
    const r = await selfTest(['127.0.0.1', '127.0.0.2'], port, 300); // (the server listens on 127.0.0.1 only)
    expect(r.results[0]?.ok).toBe(true);
    // 127.0.0.2 answers on Linux and Windows loopback, not on macOS: either way `ok` is the AND of the results
    expect(r.ok).toBe(r.results.every((x) => x.ok));
  });
});

//---------------------------------------
// probeHost (tools/net/host-probe.ts: the check from the second machine)
//---------------------------------------

describe('probeHost', () => {
  async function host(): Promise<HostServer> {
    const server = new HostServer({ buildHash: 'good', hostName: 'Test-PC' });
    await server.start(0);
    closers.push(() => void server.stop());
    return server;
  }

  it('welcome, the Frames and the pings: ok with the numbers', async () => {
    const server = await host();
    const pump = setInterval(() => server.sendFrame(new Uint8Array(2000)), 1000 / 35);
    closers.push(() => clearInterval(pump));
    const r = await probeHost({ host: '127.0.0.1', port: server.port, buildHash: 'good', durationMs: 1200 });
    expect(r.outcome).toBe('ok');
    expect(r.hostName).toBe('Test-PC');
    expect(r.frames).toBeGreaterThan(20);
    expect(r.framesPerSec).toBeGreaterThan(20);
    expect(r.framesPerSec).toBeLessThan(45);
    expect(r.kbPerSec).toBeGreaterThan(40);
    expect(r.rttAvgMs).not.toBeNull();
    expect(r.rttAvgMs as number).toBeLessThan(100);
    // the slot is free again
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.hasClient).toBe(false);
  });

  it('another build: the host answers with reject, which still proves that the way is open', async () => {
    const server = await host();
    const r = await probeHost({ host: '127.0.0.1', port: server.port, buildHash: 'other', durationMs: 500 });
    expect(r.outcome).toBe('rejected_version');
  });

  it('a second client: full', async () => {
    const server = await host();
    const first = probeHost({ host: '127.0.0.1', port: server.port, buildHash: 'good', durationMs: 1500 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const second = await probeHost({ host: '127.0.0.1', port: server.port, buildHash: 'good', durationMs: 500 });
    expect(second.outcome).toBe('rejected_full');
    expect((await first).outcome).toBe('ok');
  });

  it('nothing listens: failed, with a hint', async () => {
    const dead = createServer();
    const port = await listen(dead);
    await new Promise<void>((resolve) => dead.close(() => resolve()));
    const r = await probeHost({ host: '127.0.0.1', port, buildHash: 'good', durationMs: 500 });
    expect(r.outcome).toBe('failed');
    expect(r.message).toMatch(/ECONNREFUSED/);
  });
});
