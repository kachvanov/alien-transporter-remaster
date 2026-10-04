// ClientSession against a fake host (the `ws` package in Node plays the host and the browser WebSocket: injected).
// The real HostServer (T3.2) is not in this branch; T3.7 tests the two together.

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { ClientSession, closeText } from '../../src/net/clientSession';
import type { SessionCloseReason, SessionState, WebSocketLike } from '../../src/net/clientSession';
import type { FrameData } from '../../src/frame/types';
import {
  CLOSE_FULL,
  CLOSE_VERSION,
  INPUT_GAS,
  INPUT_LEFT,
  INPUT_PAUSE_REQ,
  PROTO_VERSION,
  decodeInput,
  encodeMessage,
  messageKind,
  parseClientMessage,
} from '../../src/net/protocol';
import type { ClientMessage, InputMessage } from '../../src/net/protocol';

const HELLO = { buildHash: 'a'.repeat(64), name: 'Mac', ship: { shuttleKind: 1, shuttleColor: 2, engineKind: 1, engineColor: 3 } };

/** A valid Frame without nodes (docs/03 §1: the 26 bytes header) with `aOneShots` sounds. */
function frameBytes(aTick: number, aOneShots = 0): ArrayBuffer {
  const buf = new ArrayBuffer(26 + aOneShots * 4);
  const v = new DataView(buf);
  v.setUint8(0, 0x01);
  v.setUint32(1, aTick, true);
  v.setUint16(6, 0xffff, true);
  v.setUint16(10, 0xffff, true);
  v.setUint16(20, aOneShots, true);
  for (let i = 0; i < aOneShots; i++) {
    v.setUint16(26 + i * 4, 100 + i, true);
    v.setUint8(28 + i * 4, 200);
  }
  return buf;
}

interface Server {
  wss: WebSocketServer;
  port: number;
  /** The first connected socket (resolves after the connection). */
  socket: Promise<WebSocket>;
  /** Everything the host received, in order. */
  received: (ClientMessage | { binary: InputMessage } | { badBinary: number })[];
  closed: Promise<number>;
}

const servers: WebSocketServer[] = [];
const sessions: ClientSession[] = [];

async function startServer(aOnHello?: (ws: WebSocket, hello: ClientMessage) => void): Promise<Server> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', perMessageDeflate: false });
  servers.push(wss);
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  const port = (wss.address() as { port: number }).port;
  const received: Server['received'] = [];
  let resolveSocket: (ws: WebSocket) => void = () => undefined;
  const socket = new Promise<WebSocket>((resolve) => (resolveSocket = resolve));
  let resolveClosed: (code: number) => void = () => undefined;
  const closed = new Promise<number>((resolve) => (resolveClosed = resolve));
  wss.on('connection', (ws) => {
    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        const msg = parseClientMessage(data.toString());
        received.push(msg);
        aOnHello?.(ws, msg);
      } else {
        const ab = (data as Buffer).buffer.slice((data as Buffer).byteOffset, (data as Buffer).byteOffset + (data as Buffer).byteLength);
        try {
          received.push({ binary: decodeInput(ab as ArrayBuffer) });
        } catch {
          received.push({ badBinary: ab.byteLength });
        }
      }
    });
    ws.on('close', (code) => resolveClosed(code));
    resolveSocket(ws);
  });
  return { wss, port, socket, received, closed };
}

function welcome(ws: WebSocket): void {
  ws.send(encodeMessage({ t: 'welcome', proto: PROTO_VERSION, hostName: 'Windows-PC', tickRate: 35 }));
}

interface Probe {
  session: ClientSession;
  states: SessionState[];
  frames: FrameData[];
  notices: string[];
  reasons: (SessionCloseReason | null)[];
}

function makeSession(aOptions: ConstructorParameters<typeof ClientSession>[1] = {}): Probe {
  const probe: Probe = { session: null as unknown as ClientSession, states: [], frames: [], notices: [], reasons: [] };
  probe.session = new ClientSession(
    {
      onStateChange: (s, r) => {
        probe.states.push(s);
        probe.reasons.push(r);
      },
      onFrame: (f) => probe.frames.push(f),
      onNotice: (t) => probe.notices.push(t),
    },
    { createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike, ...aOptions },
  );
  sessions.push(probe.session);
  return probe;
}

async function waitFor(aCond: () => boolean, aMs = 2000): Promise<void> {
  const start = Date.now();
  while (!aCond()) {
    if (Date.now() - start > aMs) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

afterEach(async () => {
  for (const s of sessions.splice(0)) s.disconnect();
  for (const wss of servers.splice(0)) {
    for (const c of wss.clients) c.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }
});

describe('ClientSession', () => {
  it('handshake: hello goes out after open, welcome starts the play', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession();
    expect(p.session.state).toBe('idle');
    p.session.connect('127.0.0.1', server.port, HELLO);
    expect(p.session.state).toBe('connecting');
    await waitFor(() => p.session.state === 'playing');
    expect(p.states).toEqual(['connecting', 'handshaking', 'playing']);
    expect(p.session.welcome).toEqual({ t: 'welcome', proto: PROTO_VERSION, hostName: 'Windows-PC', tickRate: 35 });
    expect(server.received[0]).toEqual({ t: 'hello', proto: PROTO_VERSION, ...HELLO });
  });

  it('receives frames in order, drops a broken one without failing', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    const ws = await server.socket;
    ws.send(frameBytes(10, 2));
    ws.send(new Uint8Array([1, 2, 3])); // 0x01 type, but cut short
    ws.send(frameBytes(11));
    ws.send(frameBytes(12));
    await waitFor(() => p.frames.length === 3);
    expect(p.frames.map((f) => f.tick)).toEqual([10, 11, 12]);
    expect(p.frames[0]?.oneShots).toEqual([
      { soundId: 100, volume: 200, pan: 0 },
      { soundId: 101, volume: 200, pan: 0 },
    ]);
    expect(p.session.badFrames).toBe(1);
    expect(p.session.state).toBe('playing');
  });

  it('input: sent on every change with a growing seq, repeated by the heartbeat', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession({ heartbeatMs: 10 });
    p.session.connect('127.0.0.1', server.port, HELLO);
    p.session.setInput(INPUT_GAS); // during the handshake: only remembered, sent when the play starts
    await waitFor(() => p.session.state === 'playing');
    const inputs = (): InputMessage[] => server.received.flatMap((m) => ('binary' in m ? [m.binary] : []));

    await waitFor(() => inputs().length >= 1);
    expect(inputs()[0]?.bits).toBe(INPUT_GAS);
    p.session.setInput(INPUT_GAS | INPUT_LEFT);
    await waitFor(() => inputs().some((i) => i.bits === (INPUT_GAS | INPUT_LEFT)));
    const n = inputs().length;
    await waitFor(() => inputs().length >= n + 3); // the heartbeat
    const list = inputs();
    for (let i = 1; i < list.length; i++) {
      expect((list[i] as InputMessage).seq).toBeGreaterThan((list[i - 1] as InputMessage).seq);
    }
    expect(list[list.length - 1]?.bits).toBe(INPUT_GAS | INPUT_LEFT);
    p.session.setInput(INPUT_PAUSE_REQ);
    await waitFor(() => inputs().some((i) => i.bits === INPUT_PAUSE_REQ));
  });

  it('reject: version -> closed(rejected_version); the text says so', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') {
        ws.send(encodeMessage({ t: 'reject', reason: 'version' }));
        ws.close(CLOSE_VERSION);
      }
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('rejected_version');
    expect(p.states).toEqual(['connecting', 'handshaking', 'closed']);
    expect(closeText('rejected_version')).toBe('Different game version on host and client');
  });

  it('reject: full -> closed(rejected_full)', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') {
        ws.send(encodeMessage({ t: 'reject', reason: 'full' }));
        ws.close(CLOSE_FULL);
      }
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('rejected_full');
  });

  it('a bare close code of a reject (no JSON message) is understood as well', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') ws.close(CLOSE_VERSION);
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('rejected_version');
  });

  it('notice goes to the UI, bye of the host closes with host_quit', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    const ws = await server.socket;
    ws.send(encodeMessage({ t: 'notice', text: 'Host paused' }));
    await waitFor(() => p.notices.length === 1);
    expect(p.notices).toEqual(['Host paused']);
    ws.send(encodeMessage({ t: 'bye', reason: 'host_quit' }));
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('host_quit');
    await server.closed;
  });

  it('no frames for the timeout: closed(timeout), the socket is closed', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession({ frameTimeoutMs: 150 });
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    const ws = await server.socket;
    ws.send(frameBytes(1));
    await waitFor(() => p.frames.length === 1);
    const t0 = Date.now();
    await waitFor(() => p.session.state === 'closed');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100);
    expect(p.session.closeReason).toBe('timeout');
    expect(closeText('timeout')).toBe('Connection lost');
    await server.closed; // the socket was closed by the client
  });

  it('frames keep the session alive', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession({ frameTimeoutMs: 150 });
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    const ws = await server.socket;
    for (let i = 0; i < 12; i++) {
      ws.send(frameBytes(i));
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(p.session.state).toBe('playing');
  });

  it('the host dies in the middle of the play: closed(connection_lost)', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    (await server.socket).terminate();
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('connection_lost');
  });

  it('disconnect(): bye goes to the host, the socket is closed, reason left', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    p.session.disconnect();
    expect(p.session.state).toBe('closed');
    expect(p.session.closeReason).toBe('left');
    await server.closed;
    expect(server.received.some((m) => 't' in m && m.t === 'bye')).toBe(true);
    p.session.disconnect(); // again: nothing
    expect(p.states.filter((s) => s === 'closed').length).toBe(1);
  });

  it('nobody listens: closed(connect_failed)', async () => {
    const server = await startServer();
    const port = server.port;
    for (const c of server.wss.clients) c.terminate();
    await new Promise<void>((resolve) => server.wss.close(() => resolve()));
    servers.length = 0;
    const p = makeSession();
    p.session.connect('127.0.0.1', port, HELLO);
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('connect_failed');
  });

  it('the host does not answer the hello: closed(handshake_timeout)', async () => {
    const server = await startServer(); // never answers
    const p = makeSession({ connectTimeoutMs: 100 });
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('handshake_timeout');
  });

  it('a message that is not a protocol message: closed(protocol_error)', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') ws.send('{"t":"nonsense"}');
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'closed');
    expect(p.session.closeReason).toBe('protocol_error');
  });

  it('can connect again after the close', async () => {
    const server = await startServer((ws, msg) => {
      if (msg.t === 'hello') welcome(ws);
    });
    const p = makeSession();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    p.session.disconnect();
    p.session.connect('127.0.0.1', server.port, HELLO);
    await waitFor(() => p.session.state === 'playing');
    expect(p.session.closeReason).toBeNull();
  });

  it('the browser WebSocket is configured for binary frames', () => {
    let seen = '';
    const fake: WebSocketLike = {
      get binaryType() {
        return seen;
      },
      set binaryType(v: string) {
        seen = v;
      },
      readyState: 0,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: () => undefined,
      close: () => undefined,
    };
    const session = new ClientSession({}, { createSocket: () => fake });
    sessions.push(session);
    session.connect('1.2.3.4', 47020, HELLO);
    expect(seen).toBe('arraybuffer');
    expect(messageKind(frameBytes(1))).toBe('frame');
    session.disconnect();
  });
});
