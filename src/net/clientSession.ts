// Not a port. Client side of the LAN game (docs/03-frame-and-network-protocol.md §2-§5, docs/01-architecture.md §1).
//
// connect(host, port, hello): connecting -> handshaking -> playing -> closed(reason).
//   - `hello` goes out right after `open`; `welcome` starts the play; `reject` / `bye` / a lost socket close the session
//     with a reason that the UI shows (closeText()).
//   - The binary frames are decoded and handed to `onFrame` (the jitter buffer; the renderer plays them from there).
//   - The input bits go out on every change plus a heartbeat of 35 Hz (the host drops the packets with an old `seq`).
//   - No Frame for `frameTimeoutMs` (3 s) -> closed('timeout'), the socket is closed.
//
// The socket is injected (`createSocket`): the browser `WebSocket` in the renderer, the `ws` package in the tests.

import { FrameDecodeError } from '../frame/FrameDecodeError';
import { readFrame } from '../frame/FrameReader';
import type { FrameData } from '../frame/types';
import { PROTO_VERSION, ProtocolError, encodeInput, encodeMessage, messageKind, parseHostMessage } from './protocol';
import type { Hello, Welcome } from './protocol';

export type SessionState = 'idle' | 'connecting' | 'handshaking' | 'playing' | 'closed';

/** Why a session is closed. */
export type SessionCloseReason =
  /** The host refused: the slot is taken. */
  | 'rejected_full'
  /** The host refused: another game version (buildHash). */
  | 'rejected_version'
  | 'rejected_busy'
  /** The host quit the game or stopped the session (`bye`). */
  | 'host_quit'
  /** This side disconnected (`disconnect()`). */
  | 'left'
  /** The socket could not be opened. */
  | 'connect_failed'
  /** No answer to the hello. */
  | 'handshake_timeout'
  /** No Frame for 3 s. */
  | 'timeout'
  /** The socket closed in the middle of the play. */
  | 'connection_lost'
  | 'protocol_error';

/** The text for the player (docs/03 §3, §5). */
export function closeText(aReason: SessionCloseReason): string {
  switch (aReason) {
    case 'rejected_full':
      return 'The host already has a player';
    case 'rejected_version':
      return 'Different game version on host and client';
    case 'rejected_busy':
      return 'The host is busy';
    case 'host_quit':
      return 'The host closed the game';
    case 'left':
      return 'Disconnected';
    case 'connect_failed':
      return 'Cannot connect to the host';
    case 'handshake_timeout':
      return 'The host did not answer';
    case 'protocol_error':
      return 'Protocol error';
    case 'timeout':
    case 'connection_lost':
      return 'Connection lost';
  }
}

/** The part of WebSocket the session uses (the browser `WebSocket` and the `ws` package both fit). */
export interface WebSocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

const WS_OPEN = 1;

export type ClientHello = Omit<Hello, 't' | 'proto'>;

export interface ClientSessionOptions {
  /** Default: `new WebSocket(url)`. */
  createSocket?: (url: string) => WebSocketLike;
  /** Clock, ms (default `performance.now()`). */
  now?: () => number;
  /** No Frame for this long -> closed('timeout'). Default 3000. */
  frameTimeoutMs?: number;
  /** The socket must open (and the welcome must come) within this time. Default 5000. */
  connectTimeoutMs?: number;
  /** Period of the input heartbeat, ms. Default 1000/35. */
  heartbeatMs?: number;
}

export interface ClientSessionEvents {
  onStateChange?: (aState: SessionState, aReason: SessionCloseReason | null) => void;
  /** A decoded Frame. `aBytes` is its size on the wire. */
  onFrame?: (aFrame: FrameData, aBytes: number) => void;
  onWelcome?: (aWelcome: Welcome) => void;
  /** An optional notification of the host. */
  onNotice?: (aText: string) => void;
}

export class ClientSession {
  readonly events: ClientSessionEvents;

  private readonly _createSocket: (url: string) => WebSocketLike;
  private readonly _now: () => number;
  private readonly _frameTimeoutMs: number;
  private readonly _connectTimeoutMs: number;
  private readonly _heartbeatMs: number;

  private _state: SessionState = 'idle';
  private _reason: SessionCloseReason | null = null;
  private _socket: WebSocketLike | null = null;
  private _welcome: Welcome | null = null;
  private _hello: Hello | null = null;
  private _seq = 0;
  private _bits = 0;
  private _lastFrameAt = 0;
  private _watchdog: ReturnType<typeof setInterval> | null = null;
  private _heartbeat: ReturnType<typeof setInterval> | null = null;
  private _connectTimer: ReturnType<typeof setTimeout> | null = null;

  private _framesReceived = 0;
  private _badFrames = 0;
  private _inputsSent = 0;

  constructor(aEvents: ClientSessionEvents = {}, aOptions: ClientSessionOptions = {}) {
    this.events = aEvents;
    this._createSocket = aOptions.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this._now = aOptions.now ?? (() => performance.now());
    this._frameTimeoutMs = aOptions.frameTimeoutMs ?? 3000;
    this._connectTimeoutMs = aOptions.connectTimeoutMs ?? 5000;
    this._heartbeatMs = aOptions.heartbeatMs ?? 1000 / 35;
  }

  get state(): SessionState {
    return this._state;
  }

  /** Why the session is closed (null while it is not). */
  get closeReason(): SessionCloseReason | null {
    return this._reason;
  }

  get welcome(): Welcome | null {
    return this._welcome;
  }

  get framesReceived(): number {
    return this._framesReceived;
  }

  /** Frames that could not be decoded (dropped). */
  get badFrames(): number {
    return this._badFrames;
  }

  get inputsSent(): number {
    return this._inputsSent;
  }

  /** Opens the connection to `ws://host:port` and sends the hello. */
  connect(aHost: string, aPort: number, aHello: ClientHello): void {
    if (this._state !== 'idle' && this._state !== 'closed') {
      throw new Error('ClientSession: already connected');
    }
    this._hello = { t: 'hello', proto: PROTO_VERSION, ...aHello };
    this._reason = null;
    this._welcome = null;
    this._seq = 0;
    this._bits = 0;
    this.setState('connecting');

    let socket: WebSocketLike;
    try {
      socket = this._createSocket('ws://' + aHost + ':' + aPort);
    } catch {
      this.close('connect_failed');
      return;
    }
    socket.binaryType = 'arraybuffer';
    this._socket = socket;
    socket.onopen = () => {
      if (this._socket !== socket) {
        return;
      }
      this.setState('handshaking');
      socket.send(encodeMessage(this._hello as Hello));
    };
    socket.onmessage = (ev) => {
      if (this._socket === socket) {
        this.handleMessage(ev.data);
      }
    };
    socket.onerror = () => {
      // (a failure is reported by `close` as well; nothing to do here)
    };
    socket.onclose = (ev) => {
      if (this._socket !== socket) {
        return;
      }
      this.handleSocketClosed(ev.code);
    };
    this._connectTimer = setTimeout(() => {
      this._connectTimer = null;
      if (this._state === 'connecting') {
        this.close('connect_failed');
      } else if (this._state === 'handshaking') {
        this.close('handshake_timeout');
      }
    }, this._connectTimeoutMs);
  }

  /**
   * The current input bits (INPUT_GAS ...). Sent at once when they differ from the last sent ones; the heartbeat
   * repeats them. Before the play they are only remembered.
   */
  setInput(aBits: number): void {
    const bits = aBits & 0xff;
    if (bits === this._bits) {
      return;
    }
    this._bits = bits;
    this.sendInput();
  }

  /** This side leaves: `bye`, the socket is closed. */
  disconnect(): void {
    if (this._state === 'closed' || this._state === 'idle') {
      return;
    }
    const socket = this._socket;
    if (socket !== null && socket.readyState === WS_OPEN) {
      try {
        socket.send(encodeMessage({ t: 'bye' }));
      } catch {
        // (the socket is closed below anyway)
      }
    }
    this.close('left');
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private handleMessage(aData: unknown): void {
    switch (messageKind(aData)) {
      case 'json':
        this.handleJson(aData as string);
        break;
      case 'frame':
        this.handleFrame(aData);
        break;
      default:
        break; // (an Input or an unknown message: not for a client)
    }
  }

  private handleJson(aText: string): void {
    let msg;
    try {
      msg = parseHostMessage(aText);
    } catch (e) {
      if (e instanceof ProtocolError) {
        this.close('protocol_error');
        return;
      }
      throw e;
    }
    switch (msg.t) {
      case 'welcome':
        if (this._state === 'handshaking') {
          this._welcome = msg;
          this.clearConnectTimer();
          this.setState('playing');
          this._lastFrameAt = this._now();
          this.startTimers();
          this.events.onWelcome?.(msg);
          this.sendInput(); // (the bits pressed during the handshake)
        }
        break;
      case 'reject':
        this.close(msg.reason === 'full' ? 'rejected_full' : msg.reason === 'version' ? 'rejected_version' : 'rejected_busy');
        break;
      case 'notice':
        this.events.onNotice?.(msg.text);
        break;
      case 'bye':
        this.close('host_quit');
        break;
    }
  }

  private handleFrame(aData: unknown): void {
    if (this._state !== 'playing') {
      return;
    }
    let buf: ArrayBuffer;
    if (aData instanceof ArrayBuffer) {
      buf = aData;
    } else if (ArrayBuffer.isView(aData)) {
      buf = aData.buffer.slice(aData.byteOffset, aData.byteOffset + aData.byteLength) as ArrayBuffer;
    } else {
      return;
    }
    let frame: FrameData;
    try {
      frame = readFrame(buf);
    } catch (e) {
      if (e instanceof FrameDecodeError) {
        this._badFrames++;
        return;
      }
      throw e;
    }
    this._lastFrameAt = this._now();
    this._framesReceived++;
    this.events.onFrame?.(frame, buf.byteLength);
  }

  private handleSocketClosed(aCode: number): void {
    if (this._state === 'closed') {
      return;
    }
    // The host sends `reject` / `bye` before the close; a bare close code is mapped as well.
    if (aCode === 4000) {
      this.close('rejected_full');
    } else if (aCode === 4001) {
      this.close('rejected_version');
    } else if (aCode === 4002) {
      this.close('rejected_busy');
    } else if (aCode === 4003) {
      this.close('protocol_error');
    } else if (this._state === 'playing') {
      this.close('connection_lost');
    } else if (this._state === 'handshaking') {
      this.close('handshake_timeout');
    } else {
      this.close('connect_failed');
    }
  }

  private sendInput(): void {
    const socket = this._socket;
    if (this._state !== 'playing' || socket === null || socket.readyState !== WS_OPEN) {
      return;
    }
    this._seq = (this._seq + 1) >>> 0;
    this._inputsSent++;
    try {
      socket.send(encodeInput({ seq: this._seq, bits: this._bits }));
    } catch {
      // (a broken socket is reported by its close event)
    }
  }

  private startTimers(): void {
    this._heartbeat = setInterval(() => this.sendInput(), this._heartbeatMs);
    const period = Math.max(10, Math.min(250, this._frameTimeoutMs / 4));
    this._watchdog = setInterval(() => {
      if (this._state === 'playing' && this._now() - this._lastFrameAt >= this._frameTimeoutMs) {
        this.close('timeout');
      }
    }, period);
  }

  private clearConnectTimer(): void {
    if (this._connectTimer !== null) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }

  /** Closes the session with a reason and the socket with it. */
  private close(aReason: SessionCloseReason): void {
    if (this._state === 'closed') {
      return;
    }
    this.clearConnectTimer();
    if (this._heartbeat !== null) {
      clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
    if (this._watchdog !== null) {
      clearInterval(this._watchdog);
      this._watchdog = null;
    }
    const socket = this._socket;
    this._socket = null;
    this._reason = aReason;
    this.setState('closed');
    if (socket !== null) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = () => undefined;
      try {
        socket.close(1000);
      } catch {
        // (already closed)
      }
    }
  }

  private setState(aState: SessionState): void {
    this._state = aState;
    this.events.onStateChange?.(aState, this._reason);
  }
}
