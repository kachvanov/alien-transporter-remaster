// T3.2: HostServer (electron/net/wsServer.ts) against the `ws` client, in plain Node on the loopback.
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { HostServer, type ClientInfo, type ClientLeftReason, type HostServerOptions } from '../../electron/net/wsServer';
import { encodeInput, encodeMessage, PROTO_VERSION, type Hello } from '../../src/net/protocol';

const BUILD = 'build-abc';
const SHIP = { shuttleKind: 1, shuttleColor: 2, engineKind: 0, engineColor: 1 };

function hello(aExtra: Partial<Hello> = {}): string {
  return encodeMessage({ t: 'hello', proto: PROTO_VERSION, buildHash: BUILD, name: 'MacBook', ship: SHIP, ...aExtra });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(aCond: () => boolean, aTimeoutMs = 3000): Promise<void> {
  const t0 = Date.now();
  while (!aCond()) {
    if (Date.now() - t0 > aTimeoutMs) throw new Error('waitFor: timeout');
    await sleep(5);
  }
}

/** A test client: everything it receives is recorded. */
class Peer {
  readonly ws: WebSocket;
  readonly texts: string[] = [];
  readonly binaries: Buffer[] = [];
  closeCode: number | null = null;

  constructor(aPort: number, aOptions: ConstructorParameters<typeof WebSocket>[2] = {}) {
    this.ws = new WebSocket('ws://127.0.0.1:' + aPort, aOptions);
    this.ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.binaries.push(Buffer.from(data));
      else this.texts.push(data.toString());
    });
    this.ws.on('close', (code: number) => {
      this.closeCode = code;
    });
    this.ws.on('error', () => undefined);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  json(aIndex: number): Record<string, unknown> {
    return JSON.parse(this.texts[aIndex] ?? 'null') as Record<string, unknown>;
  }
}

const servers: HostServer[] = [];
const peers: Peer[] = [];

interface Events {
  joined: ClientInfo[];
  left: ClientLeftReason[];
  inputs: { bits: number; seq: number }[];
  errors: Error[];
}

async function startServer(aOptions: Partial<HostServerOptions> = {}): Promise<{ server: HostServer; ev: Events }> {
  const ev: Events = { joined: [], left: [], inputs: [], errors: [] };
  const server = new HostServer({
    buildHash: BUILD,
    hostName: 'Windows-PC',
    address: '127.0.0.1',
    onClientJoined: (i) => ev.joined.push(i),
    onClientLeft: (r) => ev.left.push(r),
    onInput: (bits, seq) => ev.inputs.push({ bits, seq }),
    onError: (e) => ev.errors.push(e),
    ...aOptions,
  });
  servers.push(server);
  await server.start(0);
  return { server, ev };
}

async function connect(aServer: HostServer, aOptions?: ConstructorParameters<typeof WebSocket>[2]): Promise<Peer> {
  const peer = new Peer(aServer.port, aOptions);
  peers.push(peer);
  await peer.open();
  return peer;
}

/** Connects and says hello; resolves when `welcome` has come. */
async function join(aServer: HostServer, aOptions?: ConstructorParameters<typeof WebSocket>[2]): Promise<Peer> {
  const peer = await connect(aServer, aOptions);
  peer.ws.send(hello());
  await waitFor(() => peer.texts.length > 0);
  return peer;
}

afterEach(async () => {
  vi.useRealTimers();
  for (const p of peers.splice(0)) p.ws.terminate();
  for (const s of servers.splice(0)) await s.stop();
});

describe('handshake', () => {
  it('hello -> welcome, onClientJoined with the name and the ship', async () => {
    const { server, ev } = await startServer();
    const peer = await join(server);
    expect(peer.json(0)).toEqual({ t: 'welcome', proto: PROTO_VERSION, hostName: 'Windows-PC', tickRate: 35 });
    expect(ev.joined).toEqual([{ name: 'MacBook', ship: SHIP }]);
    expect(server.hasClient).toBe(true);
  });

  it('a wrong buildHash: reject version and close 4001; the slot stays free', async () => {
    const { server, ev } = await startServer();
    const bad = await connect(server);
    bad.ws.send(hello({ buildHash: 'other' }));
    await waitFor(() => bad.closeCode !== null);
    expect(bad.json(0)).toEqual({ t: 'reject', reason: 'version' });
    expect(bad.closeCode).toBe(4001);
    expect(ev.joined).toEqual([]);
    expect(ev.left).toEqual([]);

    const good = await join(server);
    expect(good.json(0)['t']).toBe('welcome');
  });

  it('a wrong proto is a version mismatch too', async () => {
    const { server } = await startServer();
    const bad = await connect(server);
    bad.ws.send(hello({ proto: PROTO_VERSION + 1 }));
    await waitFor(() => bad.closeCode !== null);
    expect(bad.closeCode).toBe(4001);
  });

  it('the second client: reject full and close 4000; the first one is not disturbed', async () => {
    const { server, ev } = await startServer();
    const first = await join(server);
    const second = await connect(server);
    await waitFor(() => second.closeCode !== null);
    expect(second.json(0)).toEqual({ t: 'reject', reason: 'full' });
    expect(second.closeCode).toBe(4000);
    expect(first.closeCode).toBeNull();
    expect(ev.joined).toHaveLength(1);
    expect(ev.left).toEqual([]);
    expect(server.sendFrame(new Uint8Array([1, 2, 3]))).toBe(true);
    await waitFor(() => first.binaries.length === 1);
  });

  it('garbage instead of a hello: close 4003, the slot is free again', async () => {
    const { server, ev } = await startServer();
    const bad = await connect(server);
    bad.ws.send('not json');
    await waitFor(() => bad.closeCode !== null);
    expect(bad.closeCode).toBe(4003);
    expect(ev.joined).toEqual([]);
    const good = await join(server);
    expect(good.json(0)['t']).toBe('welcome');
  });

  it('the name is cleaned: control characters out, at most 32 characters, empty -> Player 2', async () => {
    const { server, ev } = await startServer();
    const a = await connect(server);
    a.ws.send(hello({ name: 'A\u0000B\n' + 'x'.repeat(100) }));
    await waitFor(() => ev.joined.length === 1);
    expect(ev.joined[0]?.name).toBe('AB' + 'x'.repeat(30));
    a.ws.close();
    await waitFor(() => ev.left.length === 1);
    const b = await connect(server);
    b.ws.send(hello({ name: '  ' }));
    await waitFor(() => ev.joined.length === 2);
    expect(ev.joined[1]?.name).toBe('Player 2');
  });
});

describe('frames and input', () => {
  it('a frame reaches the client byte for byte (and nothing is sent before the hello)', async () => {
    const { server } = await startServer();
    expect(server.sendFrame(new Uint8Array([1]))).toBe(false); // nobody
    const peer = await connect(server);
    expect(server.sendFrame(new Uint8Array([1]))).toBe(false); // connected, no hello yet
    peer.ws.send(hello());
    await waitFor(() => peer.texts.length > 0);

    const frame = new Uint8Array(13_000);
    for (let i = 0; i < frame.length; i++) frame[i] = (i * 31 + 7) & 0xff;
    frame[0] = 0x01;
    expect(server.sendFrame(frame.buffer.slice(0))).toBe(true);
    await waitFor(() => peer.binaries.length === 1);
    expect(Buffer.compare(peer.binaries[0] as Buffer, Buffer.from(frame))).toBe(0);
    expect(server.framesSent).toBe(1);
  });

  it('a typed-array view is sent as its own bytes only', async () => {
    const { server } = await startServer();
    const peer = await join(server);
    const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
    server.sendFrame(big.subarray(2, 5));
    await waitFor(() => peer.binaries.length === 1);
    expect([...(peer.binaries[0] as Buffer)]).toEqual([1, 2, 3]);
  });

  it('the input arrives in onInput with seq; a packet with an older seq is dropped', async () => {
    const { server, ev } = await startServer();
    const peer = await join(server);
    peer.ws.send(encodeInput({ seq: 1, bits: 1 }));
    peer.ws.send(encodeInput({ seq: 2, bits: 3 }));
    peer.ws.send(encodeInput({ seq: 5, bits: 6 }));
    peer.ws.send(encodeInput({ seq: 4, bits: 7 })); // late
    peer.ws.send(encodeInput({ seq: 6, bits: 8 }));
    await waitFor(() => ev.inputs.length >= 4);
    await sleep(30);
    expect(ev.inputs).toEqual([
      { bits: 1, seq: 1 },
      { bits: 3, seq: 2 },
      { bits: 6, seq: 5 },
      { bits: 8, seq: 6 },
    ]);
  });

  it('a new client starts with its own seq counter', async () => {
    const { server, ev } = await startServer();
    const a = await join(server);
    a.ws.send(encodeInput({ seq: 100, bits: 1 }));
    await waitFor(() => ev.inputs.length === 1);
    a.ws.close();
    await waitFor(() => ev.left.length === 1);
    const b = await join(server);
    b.ws.send(encodeInput({ seq: 1, bits: 2 }));
    await waitFor(() => ev.inputs.length === 2);
    expect(ev.inputs[1]).toEqual({ bits: 2, seq: 1 });
  });

  it('a broken Input (wrong size) is ignored; the session goes on', async () => {
    const { server, ev } = await startServer();
    const peer = await join(server);
    peer.ws.send(Buffer.from([2, 1, 0, 0, 0])); // 5 bytes
    peer.ws.send(encodeInput({ seq: 1, bits: 1 }));
    await waitFor(() => ev.inputs.length === 1);
    expect(peer.closeCode).toBeNull();
    expect(ev.left).toEqual([]);
  });

  it('a socket that does not keep up: frames are skipped, the queue does not grow', async () => {
    const { server } = await startServer();
    const peer = await join(server);
    // the client stops reading: the kernel buffers fill up, then bufferedAmount of the server grows
    (peer.ws as unknown as { _socket: { pause(): void } })._socket.pause();
    const frame = new Uint8Array(1024 * 1024);
    frame[0] = 1;
    let sent = 0;
    for (let i = 0; i < 400 && server.framesSkipped === 0; i++) {
      if (server.sendFrame(frame)) sent++;
      if (i % 4 === 3) await sleep(1); // (let the socket take what it can)
    }
    expect(server.framesSkipped).toBeGreaterThan(0);
    const skippedBefore = server.framesSkipped;
    for (let i = 0; i < 10; i++) expect(server.sendFrame(frame)).toBe(false);
    expect(server.framesSkipped).toBe(skippedBefore + 10);
    expect(sent).toBeLessThan(400);
  });
});

describe('leaving', () => {
  it('bye from the client: the slot is free, onClientLeft(bye)', async () => {
    const { server, ev } = await startServer();
    const peer = await join(server);
    peer.ws.send(encodeMessage({ t: 'bye' }));
    await waitFor(() => ev.left.length === 1);
    expect(ev.left).toEqual(['bye']);
    expect(server.hasClient).toBe(false);
    await waitFor(() => peer.closeCode !== null);
    const next = await join(server);
    expect(next.json(0)['t']).toBe('welcome');
  });

  it('the socket closes: onClientLeft(closed), once', async () => {
    const { server, ev } = await startServer();
    const peer = await join(server);
    peer.ws.terminate();
    await waitFor(() => ev.left.length === 1);
    await sleep(30);
    expect(ev.left).toEqual(['closed']);
  });

  it('stop(): bye host_quit to the client, the port is free again', async () => {
    const { server, ev } = await startServer();
    const port = server.port;
    const peer = await join(server);
    await server.stop();
    await waitFor(() => peer.closeCode !== null);
    expect(peer.json(1)).toEqual({ t: 'bye', reason: 'host_quit' });
    expect(ev.left).toEqual([]); // (the host did it itself)
    expect(server.running).toBe(false);
    expect(server.sendFrame(new Uint8Array([1]))).toBe(false);

    const again = new HostServer({ buildHash: BUILD, hostName: 'x', address: '127.0.0.1' });
    servers.push(again);
    await again.start(port);
    expect(again.port).toBe(port);
  });

  it('start on a port that is taken rejects', async () => {
    const { server } = await startServer();
    const other = new HostServer({ buildHash: BUILD, hostName: 'x', address: '127.0.0.1' });
    servers.push(other);
    await expect(other.start(server.port)).rejects.toThrow(/EADDRINUSE/);
    expect(other.running).toBe(false);
  });

  it('start twice rejects', async () => {
    const { server } = await startServer();
    await expect(server.start(0)).rejects.toThrow(/already started/);
  });
});

describe('keepalive', () => {
  it('a silent client (no pong) is dropped after 5 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { server, ev } = await startServer();
    const peer = await join(server, { autoPong: false });
    expect(ev.joined).toHaveLength(1);

    vi.advanceTimersByTime(4000);
    expect(ev.left).toEqual([]);
    expect(server.hasClient).toBe(true);
    vi.advanceTimersByTime(2500);
    expect(ev.left).toEqual(['timeout']);
    expect(server.hasClient).toBe(false);
    await waitFor(() => peer.closeCode !== null);
  });

  it('a client that answers the pings stays', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { server, ev } = await startServer();
    const peer = await join(server);
    let pings = 0;
    peer.ws.on('ping', () => pings++);
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(1000);
      await sleep(15); // (the real network: the ping goes out, the pong comes back)
    }

    expect(pings).toBeGreaterThanOrEqual(10);
    expect(ev.left).toEqual([]);
    expect(server.hasClient).toBe(true);
  });

  it('a client that sends nothing but answers nothing either before the hello does not hold the slot', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { server } = await startServer();
    const idle = new Peer(server.port);
    peers.push(idle);
    await new Promise<void>((resolve) => idle.ws.once('open', () => resolve()));
    vi.advanceTimersByTime(5100);
    vi.useRealTimers();
    await waitFor(() => idle.closeCode !== null);
    expect(idle.closeCode).toBe(4003);
    const good = await join(server);
    expect(good.json(0)['t']).toBe('welcome');
  });
});
