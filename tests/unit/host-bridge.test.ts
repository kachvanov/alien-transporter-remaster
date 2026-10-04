// T3.2: the worker side of the network bridge of the host (src/sim/HostBridge.ts) with the real InputRouter.
import { describe, expect, it } from 'vitest';
import { HostBridge, type PeerInfo, type PortLike } from '../../src/sim/HostBridge';
import { InputRouter, KEY_P2_GAS, KEY_P2_LEFT, KEY_P2_RIGHT, KEY_PAUSE } from '../../src/sim/InputRouter';
import { INPUT_GAS, INPUT_LEFT, INPUT_PAUSE_REQ, INPUT_RIGHT } from '../../src/net/protocol';

class FakePort implements PortLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  posted: { message: unknown; transfer: Transferable[] | undefined }[] = [];
  started = false;
  closed = false;
  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }
  start(): void {
    this.started = true;
  }
  close(): void {
    this.closed = true;
  }
  /** A message from the main process. */
  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const JOINED = { t: 'joined', name: 'MacBook', ship: { shuttleKind: 1, shuttleColor: 2, engineKind: 0, engineColor: 1 } };

function setup(): { router: InputRouter; bridge: HostBridge; port: FakePort } {
  const router = new InputRouter();
  router.setHostMode(true);
  const bridge = new HostBridge(router);
  const port = new FakePort();
  bridge.attach(port);
  return { router, bridge, port };
}

describe('HostBridge', () => {
  it('attach starts the port; a frame is copied only while a client plays', () => {
    const { bridge, port } = setup();
    expect(port.started).toBe(true);
    expect(bridge.attached).toBe(true);

    const frame = new Uint8Array([1, 2, 3, 4]).buffer;
    bridge.sendFrame(frame);
    expect(port.posted).toHaveLength(0); // nobody plays

    port.receive(JOINED);
    bridge.sendFrame(frame);
    expect(port.posted).toHaveLength(1);
    const sent = port.posted[0]?.message as ArrayBuffer;
    expect(sent).not.toBe(frame); // a copy: the original goes to the renderer
    expect(new Uint8Array(sent)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(port.posted[0]?.transfer).toBeUndefined(); // (MessagePortMain gets a transferred buffer as null)
    expect(frame.byteLength).toBe(4); // the original is intact (not transferred)
  });

  it('joined / left: the peer is known, onPeerChange is told', () => {
    const { bridge, port } = setup();
    const changes: (PeerInfo | null)[] = [];
    bridge.onPeerChange = (p) => changes.push(p);
    port.receive(JOINED);
    expect(bridge.peer).toEqual({ name: 'MacBook', ship: JOINED.ship });
    port.receive({ t: 'left' });
    expect(bridge.peer).toBeNull();
    port.receive({ t: 'left' }); // (twice: nothing new)
    expect(changes).toEqual([{ name: 'MacBook', ship: JOINED.ship }, null]);
  });

  it('the input bits become the keys of P2 in the next tick', () => {
    const { router, port } = setup();
    port.receive(JOINED);
    port.receive({ t: 'input', bits: INPUT_GAS | INPUT_LEFT, seq: 1 });
    expect(router.compose().keysDown.sort()).toEqual([KEY_P2_GAS, KEY_P2_LEFT].sort());
    // the bits stay until the next Input
    expect(router.compose().keysDown.sort()).toEqual([KEY_P2_GAS, KEY_P2_LEFT].sort());
    port.receive({ t: 'input', bits: INPUT_RIGHT, seq: 2 });
    expect(router.compose().keysDown).toEqual([KEY_P2_RIGHT]);
  });

  it('pauseReq: ~90 ms of the bit (3 packets) is ONE press of P, however many ticks and packets', () => {
    const { router, port } = setup();
    port.receive(JOINED);
    const presses: number[] = [];
    let tick = 0;
    const run = (): void => {
      if (router.compose().keysDown.includes(KEY_PAUSE)) presses.push(tick);
      tick++;
    };
    // The client holds the bit for 90 ms (PAUSE_HOLD_MS) and repeats the Input at 35 Hz: 3 packets with the bit,
    // the ticks in between may or may not have a packet.
    run();
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ, seq: 1 });
    run();
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ | INPUT_GAS, seq: 2 });
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ | INPUT_GAS, seq: 3 });
    run();
    run(); // (a tick without a packet)
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ | INPUT_GAS, seq: 4 });
    run();
    port.receive({ t: 'input', bits: INPUT_GAS, seq: 5 }); // the bit is released
    run();
    run();
    expect(presses).toEqual([1]); // exactly one tick has P down: one press, no toggle back
  });

  it('a second press of P (the bit gone, then back) is a second request', () => {
    const { router, port } = setup();
    port.receive(JOINED);
    const pressed = (): boolean => router.compose().keysDown.includes(KEY_PAUSE);
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ, seq: 1 });
    expect(pressed()).toBe(true);
    port.receive({ t: 'input', bits: 0, seq: 2 });
    expect(pressed()).toBe(false);
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ, seq: 3 });
    expect(pressed()).toBe(true);
  });

  it('left clears the remote keys; a late input of the gone client is ignored', () => {
    const { router, port } = setup();
    port.receive(JOINED);
    port.receive({ t: 'input', bits: INPUT_GAS, seq: 1 });
    expect(router.compose().keysDown).toEqual([KEY_P2_GAS]);
    port.receive({ t: 'left' });
    expect(router.compose().keysDown).toEqual([]);
    port.receive({ t: 'input', bits: INPUT_GAS, seq: 2 });
    expect(router.compose().keysDown).toEqual([]);
  });

  it('a new client does not inherit the pause state of the old one', () => {
    const { router, port } = setup();
    port.receive(JOINED);
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ, seq: 1 });
    router.compose();
    port.receive({ t: 'left' });
    port.receive(JOINED);
    port.receive({ t: 'input', bits: INPUT_PAUSE_REQ, seq: 1 });
    expect(router.compose().keysDown).toContain(KEY_PAUSE);
  });

  it('stop closes the port and clears the client; a new port replaces the old one', () => {
    const { bridge, router, port } = setup();
    port.receive(JOINED);
    port.receive({ t: 'input', bits: INPUT_GAS, seq: 1 });
    port.receive({ t: 'stop' });
    expect(port.closed).toBe(true);
    expect(bridge.attached).toBe(false);
    expect(bridge.peer).toBeNull();
    expect(router.compose().keysDown).toEqual([]);

    const a = new FakePort();
    const b = new FakePort();
    bridge.attach(a);
    bridge.attach(b);
    expect(a.closed).toBe(true);
    expect(a.onmessage).toBeNull();
    expect(bridge.attached).toBe(true);
  });

  it('garbage messages are ignored', () => {
    const { bridge, port } = setup();
    for (const m of [null, 42, 'x', {}, { t: 'input' }, { t: 'input', bits: 'a' }, { t: 'nope' }]) port.receive(m);
    expect(bridge.peer).toBeNull();
    expect(bridge.attached).toBe(true);
  });
});
