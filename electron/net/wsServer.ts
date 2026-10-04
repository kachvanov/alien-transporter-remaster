// Not a port (T3.2). The WebSocket server of the host (docs/03-frame-and-network-protocol.md §2-§5, docs/01 §1, §9).
//
// No Electron here: it runs (and is tested) in plain Node. main.ts wires it to the sim worker through a MessagePort.
//   - One client at a time: the slot is taken at the connection; the second one gets `reject: full` and close 4000.
//   - The first message must be `hello`; the `buildHash` (and `proto`) must match, otherwise `reject: version`, 4001.
//   - Frames go out with `sendFrame(buf)`; a socket that does not keep up (bufferedAmount > 1 MB) skips the frame.
//   - `ws.ping()` once a second; no pong (or any other message) for 5 s: the client is dropped.
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  CLOSE_FULL,
  CLOSE_PROTOCOL_ERROR,
  CLOSE_VERSION,
  decodeInput,
  encodeMessage,
  messageKind,
  parseClientMessage,
  PROTO_VERSION,
  ProtocolError,
} from '../../src/net/protocol';
import type { Hello, Ship } from '../../src/net/protocol';

/** Tick rate of the simulation, told to the client in `welcome`. */
export const HOST_TICK_RATE = 35;
/** A client that has not sent `hello` within this time is dropped (the slot is free again). */
export const HELLO_TIMEOUT_MS = 5000;
export const PING_INTERVAL_MS = 1000;
export const PONG_TIMEOUT_MS = 5000;
/** The frame is skipped when this much is waiting to be sent to the client. */
export const MAX_BUFFERED_BYTES = 1024 * 1024;
/** The biggest message the host accepts (a hello is a few hundred bytes, an Input 6). */
const MAX_PAYLOAD = 64 * 1024;
const MAX_NAME_LENGTH = 32;

/** Who joined (from the `hello`). */
export interface ClientInfo {
  name: string;
  ship: Ship;
}

/** Why the client is gone. */
export type ClientLeftReason =
  /** The client sent `bye`. */
  | 'bye'
  /** The socket closed (or broke). */
  | 'closed'
  /** No pong for 5 s. */
  | 'timeout'
  /** It broke the protocol after the handshake. */
  | 'protocol_error';

export interface HostServerOptions {
  /** `manifest.buildHash`: a client of another build gets `reject: version`. */
  buildHash: string;
  hostName: string;
  /** Address to listen on; `0.0.0.0` so that another machine can connect. */
  address?: string;
  onClientJoined?: (aInfo: ClientInfo) => void;
  /** Only after `onClientJoined` (a client that was rejected or never said hello is not reported). */
  onClientLeft?: (aReason: ClientLeftReason) => void;
  /** An Input of the client; the packets with an older `seq` are dropped before this. */
  onInput?: (aBits: number, aSeq: number) => void;
  /** An error of the server or of a socket (the server goes on). */
  onError?: (aError: Error) => void;
}

type SlotState = 'hello' | 'playing';

interface Slot {
  ws: WebSocket;
  state: SlotState;
  lastAlive: number;
  lastSeq: number;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export class HostServer {
  private readonly _opts: HostServerOptions;
  private _wss: WebSocketServer | null = null;
  private _slot: Slot | null = null;
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _framesSent = 0;
  private _framesSkipped = 0;

  constructor(aOpts: HostServerOptions) {
    this._opts = aOpts;
  }

  /** The port the server listens on (useful after `start(0)`); 0 when it is not running. */
  get port(): number {
    const addr = this._wss?.address();
    return addr !== null && addr !== undefined && typeof addr === 'object' ? addr.port : 0;
  }

  get running(): boolean {
    return this._wss !== null;
  }

  /** A client has joined and is playing. */
  get hasClient(): boolean {
    return this._slot !== null && this._slot.state === 'playing';
  }

  get framesSent(): number {
    return this._framesSent;
  }

  /** Frames that were not sent because the socket was behind. */
  get framesSkipped(): number {
    return this._framesSkipped;
  }

  /** Starts listening. Rejects when the port cannot be used (EADDRINUSE, ...). */
  start(aPort: number): Promise<void> {
    if (this._wss !== null) {
      return Promise.reject(new Error('HostServer: already started'));
    }

    return new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({
        port: aPort,
        host: this._opts.address ?? '0.0.0.0',
        perMessageDeflate: false,
        maxPayload: MAX_PAYLOAD,
      });
      let listening = false;
      wss.on('listening', () => {
        listening = true;
        this._wss = wss;
        resolve();
      });
      wss.on('error', (e: Error) => {
        if (!listening) {
          wss.close();
          reject(e);
        } else {
          this._opts.onError?.(e);
        }
      });
      wss.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  /** Tells the client `bye: host_quit`, closes everything. */
  stop(): Promise<void> {
    const wss = this._wss;
    if (wss === null) {
      return Promise.resolve();
    }

    this._wss = null;
    this.stopPing();
    const slot = this._slot;
    this._slot = null;
    if (slot !== null) {
      this.clearHelloTimer(slot);
      if (slot.state === 'playing') {
        this.sendJson(slot.ws, { t: 'bye', reason: 'host_quit' });
      }

      slot.ws.removeAllListeners('close');
      slot.ws.close(1000);
    }

    for (const ws of wss.clients) {
      if (ws !== slot?.ws) {
        ws.terminate();
      }
    }

    return new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  }

  /**
   * Sends a Frame to the client. Returns false when it was not sent: nobody is playing, or the socket is behind
   * (more than 1 MB waits to be sent): the frame is skipped, the queue does not grow.
   */
  sendFrame(aBuf: ArrayBuffer | ArrayBufferView): boolean {
    const slot = this._slot;
    if (slot === null || slot.state !== 'playing' || slot.ws.readyState !== slot.ws.OPEN) {
      return false;
    }

    if (slot.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      this._framesSkipped++;
      return false;
    }

    try {
      slot.ws.send(aBuf, { binary: true });
    } catch (e) {
      this._opts.onError?.(e instanceof Error ? e : new Error(String(e)));
      return false;
    }

    this._framesSent++;
    return true;
  }

  /** An optional notification for the client (`notice`). */
  sendNotice(aText: string): void {
    const slot = this._slot;
    if (slot !== null && slot.state === 'playing') {
      this.sendJson(slot.ws, { t: 'notice', text: aText });
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private handleConnection(aWs: WebSocket): void {
    aWs.on('error', (e: Error) => this._opts.onError?.(e));
    if (this._slot !== null) {
      this.reject(aWs, 'full', CLOSE_FULL);
      return;
    }

    const slot: Slot = { ws: aWs, state: 'hello', lastAlive: Date.now(), lastSeq: -1, helloTimer: null };
    this._slot = slot;
    slot.helloTimer = setTimeout(() => {
      slot.helloTimer = null;
      if (this._slot === slot && slot.state === 'hello') {
        this.dropSlot(slot);
        aWs.close(CLOSE_PROTOCOL_ERROR); // (no hello in time)
      }
    }, HELLO_TIMEOUT_MS);
    aWs.on('pong', () => {
      slot.lastAlive = Date.now();
    });
    aWs.on('message', (data: RawData, isBinary: boolean) => {
      slot.lastAlive = Date.now();
      this.handleMessage(slot, data, isBinary);
    });
    aWs.on('close', () => {
      if (this._slot !== slot) {
        return;
      }

      const joined = slot.state === 'playing';
      this.dropSlot(slot);
      if (joined) {
        this._opts.onClientLeft?.('closed');
      }
    });
  }

  private handleMessage(aSlot: Slot, aData: RawData, aIsBinary: boolean): void {
    if (this._slot !== aSlot) {
      return;
    }

    if (!aIsBinary) {
      this.handleText(aSlot, aData.toString());
      return;
    }

    if (aSlot.state !== 'playing') {
      this.protocolError(aSlot); // (binary data before the hello)
      return;
    }

    const bytes = toUint8Array(aData);
    if (messageKind(bytes) !== 'input') {
      return; // (a client does not send frames; unknown binary messages are ignored)
    }

    let input;
    try {
      input = decodeInput(bytes);
    } catch (e) {
      if (e instanceof ProtocolError) {
        return; // (a broken Input is dropped; the next one is not affected)
      }
      throw e;
    }

    if (input.seq < aSlot.lastSeq) {
      return; // (an old packet that came late)
    }

    aSlot.lastSeq = input.seq;
    this._opts.onInput?.(input.bits, input.seq);
  }

  private handleText(aSlot: Slot, aText: string): void {
    let msg;
    try {
      msg = parseClientMessage(aText);
    } catch (e) {
      if (e instanceof ProtocolError) {
        this.protocolError(aSlot);
        return;
      }
      throw e;
    }

    if (msg.t === 'bye') {
      const joined = aSlot.state === 'playing';
      this.dropSlot(aSlot);
      aSlot.ws.close(1000);
      if (joined) {
        this._opts.onClientLeft?.('bye');
      }
      return;
    }

    if (aSlot.state === 'playing') {
      return; // (a second hello is ignored)
    }

    this.handleHello(aSlot, msg);
  }

  private handleHello(aSlot: Slot, aHello: Hello): void {
    this.clearHelloTimer(aSlot);
    if (aHello.proto !== PROTO_VERSION || aHello.buildHash !== this._opts.buildHash) {
      this.dropSlot(aSlot);
      this.reject(aSlot.ws, 'version', CLOSE_VERSION);
      return;
    }

    aSlot.state = 'playing';
    aSlot.lastAlive = Date.now();
    this.sendJson(aSlot.ws, {
      t: 'welcome',
      proto: PROTO_VERSION,
      hostName: this._opts.hostName,
      tickRate: HOST_TICK_RATE,
    });
    this.startPing();
    this._opts.onClientJoined?.({ name: cleanName(aHello.name), ship: aHello.ship });
  }

  private protocolError(aSlot: Slot): void {
    const joined = aSlot.state === 'playing';
    this.dropSlot(aSlot);
    aSlot.ws.close(CLOSE_PROTOCOL_ERROR);
    if (joined) {
      this._opts.onClientLeft?.('protocol_error');
    }
  }

  private reject(aWs: WebSocket, aReason: 'full' | 'version', aCode: number): void {
    this.sendJson(aWs, { t: 'reject', reason: aReason });
    aWs.close(aCode);
  }

  /** The slot is free again (the socket is closed by the caller). */
  private dropSlot(aSlot: Slot): void {
    this.clearHelloTimer(aSlot);
    if (this._slot === aSlot) {
      this._slot = null;
      this.stopPing();
    }
  }

  private clearHelloTimer(aSlot: Slot): void {
    if (aSlot.helloTimer !== null) {
      clearTimeout(aSlot.helloTimer);
      aSlot.helloTimer = null;
    }
  }

  private sendJson(aWs: WebSocket, aMsg: Parameters<typeof encodeMessage>[0]): void {
    if (aWs.readyState !== aWs.OPEN) {
      return;
    }

    try {
      aWs.send(encodeMessage(aMsg));
    } catch (e) {
      this._opts.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private startPing(): void {
    if (this._pingTimer !== null) {
      return;
    }

    this._pingTimer = setInterval(() => this.pingTick(), PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this._pingTimer !== null) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  private pingTick(): void {
    const slot = this._slot;
    if (slot === null || slot.state !== 'playing') {
      return;
    }

    if (Date.now() - slot.lastAlive > PONG_TIMEOUT_MS) {
      this.dropSlot(slot);
      slot.ws.terminate();
      this._opts.onClientLeft?.('timeout');
      return;
    }

    try {
      slot.ws.ping();
    } catch (e) {
      this._opts.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

function toUint8Array(aData: RawData): Uint8Array {
  if (Array.isArray(aData)) {
    return new Uint8Array(Buffer.concat(aData));
  }

  if (aData instanceof ArrayBuffer) {
    return new Uint8Array(aData);
  }

  return new Uint8Array(aData.buffer, aData.byteOffset, aData.byteLength);
}

/** The name goes to the screen of the host: no control characters, at most 32 characters. */
function cleanName(aName: string): string {
  // eslint-disable-next-line no-control-regex
  const name = aName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return name === '' ? 'Player 2' : name;
}
