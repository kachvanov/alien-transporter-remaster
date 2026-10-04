// Not a port (T3.2). The worker side of the network bridge of the host (docs/01-architecture.md §1, docs/03 §4).
//
// The MessagePort that main.ts made (`MessageChannelMain`) leads to the WebSocket server in the main process. Out: a copy
// of every Frame while a client is playing. In: the messages of the server -
//   `{t:'joined', name, ship}` / `{t:'left'}` / `{t:'stop'}` and `{t:'input', bits, seq}` (the Input of the client).
// The input bits go to InputRouter.setRemote (T1.6); the host applies them at the start of the next tick.

import type { RemoteInput } from './InputRouter';

/** The part of `MessagePort` the bridge uses (a fake in tests). */
export interface PortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  start?(): void;
  close(): void;
}

/** The part of InputRouter the bridge uses. */
export interface RemoteInputSink {
  setRemote(aRemote: RemoteInput | null): void;
}

/** Input bits (docs/03 §4; the same values as INPUT_* of src/net/protocol.ts). */
const BIT_GAS = 1;
const BIT_LEFT = 2;
const BIT_RIGHT = 4;
const BIT_PAUSE_REQ = 8;

export interface PeerInfo {
  name: string;
  ship: { shuttleKind: number; shuttleColor: number; engineKind: number; engineColor: number };
}

export class HostBridge {
  private readonly _input: RemoteInputSink;
  private _port: PortLike | null = null;
  private _peer: PeerInfo | null = null;
  private _pausePrev = false;
  private _framesSent = 0;

  /** T3.6 hook: a player joined (`aPeer`) or left (null). */
  onPeerChange: ((aPeer: PeerInfo | null) => void) | null = null;

  constructor(aInput: RemoteInputSink) {
    this._input = aInput;
  }

  /** A port is attached: the worker is a host (a new port replaces the old one). */
  get attached(): boolean {
    return this._port !== null;
  }

  /** The client that is playing now (from its `hello`), null when none. */
  get peer(): PeerInfo | null {
    return this._peer;
  }

  get framesSent(): number {
    return this._framesSent;
  }

  attach(aPort: PortLike): void {
    this.detach();
    this._port = aPort;
    aPort.onmessage = (ev) => this.handleMessage(ev.data);
    aPort.start?.();
  }

  /** The port is let go (closed); the remote input is cleared. */
  detach(): void {
    const port = this._port;
    if (port === null) {
      return;
    }

    this._port = null;
    port.onmessage = null;
    try {
      port.close();
    } catch {
      // (already closed)
    }

    this.clientLeft();
  }

  /**
   * Sends a copy of the Frame to the server. Call it BEFORE the original is transferred to the renderer: the copy is
   * made here. Nothing is copied while nobody plays.
   */
  sendFrame(aBuf: ArrayBuffer): void {
    const port = this._port;
    if (port === null || this._peer === null) {
      return;
    }

    const copy = aBuf.slice(0);
    // (not transferred: MessagePortMain in the main process receives a transferred ArrayBuffer as null; a plain
    // structured clone arrives as an ArrayBuffer. `copy` stays ours and is garbage after the post.)
    port.postMessage(copy);
    this._framesSent++;
  }

  /** A message from the port (public for tests). */
  handleMessage(aMsg: unknown): void {
    if (typeof aMsg !== 'object' || aMsg === null) {
      return;
    }

    const msg = aMsg as Record<string, unknown>;
    switch (msg['t']) {
      case 'input':
        if (typeof msg['bits'] === 'number') {
          this.applyBits(msg['bits'] & 0xff);
        }
        break;
      case 'joined':
        this.clientJoined(msg);
        break;
      case 'left':
        this.clientLeft();
        break;
      case 'stop':
        this.detach();
        break;
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  /**
   * `pauseReq` is the press of P on the client: the client holds the bit for ~90 ms and repeats it with every Input, so
   * it is turned into an edge here (one request per press, however many packets carry the bit).
   */
  private applyBits(aBits: number): void {
    if (this._peer === null) {
      return; // (a late packet of a client that has gone)
    }

    const pause = (aBits & BIT_PAUSE_REQ) !== 0;
    const edge = pause && !this._pausePrev;
    this._pausePrev = pause;
    this._input.setRemote({
      gas: (aBits & BIT_GAS) !== 0,
      left: (aBits & BIT_LEFT) !== 0,
      right: (aBits & BIT_RIGHT) !== 0,
      pauseReq: edge,
    });
  }

  private clientJoined(aMsg: Record<string, unknown>): void {
    const ship = (typeof aMsg['ship'] === 'object' && aMsg['ship'] !== null ? aMsg['ship'] : {}) as Record<string, unknown>;
    const uint = (aValue: unknown, aFallback: number): number =>
      typeof aValue === 'number' && Number.isInteger(aValue) && aValue >= 0 ? aValue : aFallback;
    this._peer = {
      name: typeof aMsg['name'] === 'string' ? aMsg['name'] : 'Player 2',
      ship: {
        shuttleKind: uint(ship['shuttleKind'], 1),
        shuttleColor: uint(ship['shuttleColor'], 1),
        engineKind: uint(ship['engineKind'], 1),
        engineColor: uint(ship['engineColor'], 1),
      },
    };
    this._pausePrev = false;
    this._input.setRemote(null);
    this.onPeerChange?.(this._peer);
  }

  private clientLeft(): void {
    const had = this._peer !== null;
    this._peer = null;
    this._pausePrev = false;
    this._input.setRemote(null);
    if (had) {
      this.onPeerChange?.(null);
    }
  }
}
