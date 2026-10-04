// T3.2/T3.3: the real HostServer (electron/net/wsServer.ts) with the real ClientSession (src/net/clientSession.ts) and
// ClientInputMapper, and the worker side (HostBridge + InputRouter) behind the server, all in Node on the loopback.
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { HostServer } from '../../electron/net/wsServer';
import { ClientInputMapper } from '../../src/net/clientInput';
import { ClientSession, type SessionCloseReason, type WebSocketLike } from '../../src/net/clientSession';
import type { FrameData } from '../../src/frame/types';
import { HostBridge, type PortLike } from '../../src/sim/HostBridge';
import { InputRouter, KEY_P2_GAS, KEY_P2_LEFT, KEY_PAUSE } from '../../src/sim/InputRouter';

const BUILD = 'a'.repeat(64);
const HELLO = { buildHash: BUILD, name: 'Player 2 (darwin)', ship: { shuttleKind: 1, shuttleColor: 2, engineKind: 1, engineColor: 3 } };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(aCond: () => boolean, aTimeoutMs = 3000): Promise<void> {
  const t0 = Date.now();
  while (!aCond()) {
    if (Date.now() - t0 > aTimeoutMs) throw new Error('waitFor: timeout');
    await sleep(5);
  }
}

/** A valid Frame without nodes (docs/03 §1). */
function frameBytes(aTick: number): ArrayBuffer {
  const buf = new ArrayBuffer(26);
  const v = new DataView(buf);
  v.setUint8(0, 0x01);
  v.setUint32(1, aTick, true);
  v.setUint16(6, 0xffff, true);
  v.setUint16(10, 0xffff, true);
  return buf;
}

/** The host side as main.ts + worker.ts wire it: server -> port -> HostBridge -> InputRouter. */
class Host {
  readonly router = new InputRouter();
  readonly port: PortLike & { receive(d: unknown): void; posted: unknown[] };
  readonly bridge: HostBridge;
  readonly server: HostServer;

  constructor() {
    this.router.setHostMode(true);
    const posted: unknown[] = [];
    this.port = {
      onmessage: null,
      posted,
      postMessage: (m) => void posted.push(m),
      close: () => undefined,
      receive(d: unknown) {
        this.onmessage?.({ data: d });
      },
    };
    this.bridge = new HostBridge(this.router);
    this.bridge.attach(this.port);
    this.server = new HostServer({
      buildHash: BUILD,
      hostName: 'Host',
      address: '127.0.0.1',
      onClientJoined: (i) => this.port.receive({ t: 'joined', name: i.name, ship: i.ship }),
      onClientLeft: () => this.port.receive({ t: 'left' }),
      onInput: (bits, seq) => this.port.receive({ t: 'input', bits, seq }),
    });
  }
}

const hosts: Host[] = [];
const sessions: ClientSession[] = [];

async function startHost(): Promise<Host> {
  const host = new Host();
  hosts.push(host);
  await host.server.start(0);
  return host;
}

interface Client {
  session: ClientSession;
  frames: FrameData[];
  reasons: SessionCloseReason[];
}

function connectClient(aHost: Host, aBuildHash = BUILD): Client {
  const frames: FrameData[] = [];
  const reasons: SessionCloseReason[] = [];
  const session = new ClientSession(
    {
      onFrame: (f) => frames.push(f),
      onStateChange: (state, reason) => {
        if (state === 'closed' && reason !== null) reasons.push(reason);
      },
    },
    { createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike },
  );
  sessions.push(session);
  session.connect('127.0.0.1', aHost.server.port, { ...HELLO, buildHash: aBuildHash });
  return { session, frames, reasons };
}

afterEach(async () => {
  for (const s of sessions.splice(0)) s.disconnect();
  for (const h of hosts.splice(0)) await h.server.stop();
});

describe('HostServer + ClientSession', () => {
  it('the client joins, plays, gets the frames and steers P2', async () => {
    const host = await startHost();
    const client = connectClient(host);
    await waitFor(() => client.session.state === 'playing');
    expect(client.session.welcome).toMatchObject({ hostName: 'Host', tickRate: 35 });
    expect(host.bridge.peer?.name).toBe('Player 2 (darwin)');
    expect(host.bridge.peer?.ship).toEqual(HELLO.ship);

    // the host sends the frames of its ticks
    for (let tick = 0; tick < 5; tick++) host.server.sendFrame(frameBytes(tick));
    await waitFor(() => client.frames.length === 5);
    expect(client.frames.map((f) => f.tick)).toEqual([0, 1, 2, 3, 4]);

    // the input of the client becomes the keys of P2 in the next tick
    client.session.setInput(1 | 2); // gas + left
    await waitFor(() => host.router.compose().keysDown.length === 2);
    expect(host.router.compose().keysDown.sort()).toEqual([KEY_P2_GAS, KEY_P2_LEFT].sort());
    client.session.setInput(0);
    await waitFor(() => host.router.compose().keysDown.length === 0);
  });

  it('the pause: the held P of the client (~90 ms) is ONE press of P on the host', async () => {
    const host = await startHost();
    const client = connectClient(host);
    await waitFor(() => client.session.state === 'playing');

    const mapper = new ClientInputMapper();
    const t0 = performance.now();
    const presses: number[] = [];
    let ticks = 0;
    mapper.setKeysDown([KEY_PAUSE], performance.now()); // the player presses P (and holds it for 300 ms)
    let keyUp = false;
    // the renderer loop (every ~4 ms) feeds the session; the sim ticks at 35 Hz
    let nextTick = t0;
    while (performance.now() - t0 < 450) {
      const now = performance.now();
      if (!keyUp && now - t0 > 300) {
        keyUp = true;
        mapper.setKeysDown([], now);
      }
      client.session.setInput(mapper.bits(now));
      if (now >= nextTick) {
        nextTick += 1000 / 35;
        if (host.router.compose().keysDown.includes(KEY_PAUSE)) presses.push(ticks);
        ticks++;
      }
      await sleep(3);
    }

    expect(ticks).toBeGreaterThan(10);
    expect(presses).toHaveLength(1); // not 3 ticks of P, and not a toggle back
  });

  it('a different buildHash: the client closes with rejected_version', async () => {
    const host = await startHost();
    const client = connectClient(host, 'b'.repeat(64));
    await waitFor(() => client.reasons.length > 0);
    expect(client.reasons).toEqual(['rejected_version']);
    expect(host.bridge.peer).toBeNull();
  });

  it('a second client closes with rejected_full; the first one plays on', async () => {
    const host = await startHost();
    const first = connectClient(host);
    await waitFor(() => first.session.state === 'playing');
    const second = connectClient(host);
    await waitFor(() => second.reasons.length > 0);
    expect(second.reasons).toEqual(['rejected_full']);
    host.server.sendFrame(frameBytes(7));
    await waitFor(() => first.frames.length === 1);
    expect(first.session.state).toBe('playing');
  });

  it('the host stops: the client closes with host_quit', async () => {
    const host = await startHost();
    const client = connectClient(host);
    await waitFor(() => client.session.state === 'playing');
    await host.server.stop();
    await waitFor(() => client.reasons.length > 0);
    expect(client.reasons).toEqual(['host_quit']);
  });

  it('the client leaves: the host clears the remote input and takes the next client', async () => {
    const host = await startHost();
    const first = connectClient(host);
    await waitFor(() => first.session.state === 'playing');
    first.session.setInput(1);
    await waitFor(() => host.router.compose().keysDown.length === 1);
    first.session.disconnect();
    await waitFor(() => host.bridge.peer === null);
    expect(host.router.compose().keysDown).toEqual([]);

    const second = connectClient(host);
    await waitFor(() => second.session.state === 'playing');
    expect(host.bridge.peer).not.toBeNull();
  });
});
