// Not a port. LAN multiplayer protocol: docs/03-frame-and-network-protocol.md §2-§5.
// Pure TypeScript (no DOM, no Node): shared by the host (main process) and the client (renderer).
import { z } from 'zod';
import { MSG_FRAME, MSG_INPUT } from '../frame/constants';

export const PROTO_VERSION = 1;
export const DEFAULT_TCP_PORT = 47020;
export const DEFAULT_UDP_PORT = 47021;

/** WebSocket close codes (docs/03 §3). */
export const CLOSE_FULL = 4000;
export const CLOSE_VERSION = 4001;
export const CLOSE_BUSY = 4002;
export const CLOSE_PROTOCOL_ERROR = 4003;

export const CloseCode = {
  full: CLOSE_FULL,
  version: CLOSE_VERSION,
  busy: CLOSE_BUSY,
  protocol_error: CLOSE_PROTOCOL_ERROR,
} as const;
export type CloseReason = keyof typeof CloseCode;

/** Input `bits` (docs/03 §4). */
export const INPUT_GAS = 1;
export const INPUT_LEFT = 2;
export const INPUT_RIGHT = 4;
export const INPUT_PAUSE_REQ = 8;

/** Size of an Input message in bytes. */
export const INPUT_SIZE = 6;

// ---------------------------------------------------------------- JSON messages

const uint = z.number().int().min(0);

export const ShipSchema = z.object({
  shuttleKind: uint,
  shuttleColor: uint,
  engineKind: uint,
  engineColor: uint,
});
export type Ship = z.infer<typeof ShipSchema>;

/** client -> host, right after open. */
export const HelloSchema = z.object({
  t: z.literal('hello'),
  proto: uint,
  buildHash: z.string(),
  name: z.string(),
  ship: ShipSchema,
});
export type Hello = z.infer<typeof HelloSchema>;

/** host -> client. */
export const WelcomeSchema = z.object({
  t: z.literal('welcome'),
  proto: uint,
  hostName: z.string(),
  tickRate: z.number().positive(),
});
export type Welcome = z.infer<typeof WelcomeSchema>;

/** host -> client; the socket is then closed with the matching 4000..4002 code. */
export const RejectSchema = z.object({
  t: z.literal('reject'),
  reason: z.enum(['full', 'version', 'busy']),
});
export type Reject = z.infer<typeof RejectSchema>;

/** host -> client, optional notification. */
export const NoticeSchema = z.object({
  t: z.literal('notice'),
  text: z.string(),
});
export type Notice = z.infer<typeof NoticeSchema>;

/** Either side ends the session; the host sends `reason: "host_quit"`. */
export const ByeSchema = z.object({
  t: z.literal('bye'),
  reason: z.string().optional(),
});
export type Bye = z.infer<typeof ByeSchema>;

export const ClientMessageSchema = z.discriminatedUnion('t', [HelloSchema, ByeSchema]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const HostMessageSchema = z.discriminatedUnion('t', [
  WelcomeSchema,
  RejectSchema,
  NoticeSchema,
  ByeSchema,
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function parseJson<T>(aSchema: z.ZodType<T>, aText: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(aText);
  } catch {
    throw new ProtocolError('invalid JSON');
  }
  const res = aSchema.safeParse(raw);
  if (!res.success) {
    throw new ProtocolError('invalid message: ' + res.error.message);
  }
  return res.data;
}

/** Parses a text message received by the host. Throws ProtocolError on bad JSON or schema. */
export function parseClientMessage(aText: string): ClientMessage {
  return parseJson(ClientMessageSchema, aText);
}

/** Parses a text message received by the client. Throws ProtocolError on bad JSON or schema. */
export function parseHostMessage(aText: string): HostMessage {
  return parseJson(HostMessageSchema, aText);
}

export function encodeMessage(aMsg: ClientMessage | HostMessage): string {
  return JSON.stringify(aMsg);
}

// ---------------------------------------------------------------- Input (type = 0x02)

export interface InputMessage {
  seq: number;
  bits: number;
}

/** `u8 type=0x02 | u32 seq | u8 bits`, little-endian. */
export function encodeInput(aInput: InputMessage): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_SIZE);
  const v = new DataView(buf);
  v.setUint8(0, MSG_INPUT);
  v.setUint32(1, aInput.seq >>> 0, true);
  v.setUint8(5, aInput.bits & 0xff);
  return buf;
}

export function decodeInput(aData: ArrayBuffer | ArrayBufferView): InputMessage {
  const v =
    aData instanceof ArrayBuffer
      ? new DataView(aData)
      : new DataView(aData.buffer, aData.byteOffset, aData.byteLength);
  if (v.byteLength !== INPUT_SIZE) {
    throw new ProtocolError('bad Input size: ' + v.byteLength);
  }
  if (v.getUint8(0) !== MSG_INPUT) {
    throw new ProtocolError('not an Input message');
  }
  return { seq: v.getUint32(1, true), bits: v.getUint8(5) };
}

// ---------------------------------------------------------------- classification

export type MessageKind = 'json' | 'frame' | 'input' | 'unknown';

/** Classifies a WebSocket message: string -> json; binary -> by the first byte. */
export function messageKind(aData: unknown): MessageKind {
  if (typeof aData === 'string') {
    return 'json';
  }
  let first = -1;
  if (aData instanceof ArrayBuffer) {
    if (aData.byteLength > 0) {
      first = new Uint8Array(aData)[0] ?? -1;
    }
  } else if (ArrayBuffer.isView(aData)) {
    if (aData.byteLength > 0) {
      first = new Uint8Array(aData.buffer, aData.byteOffset, 1)[0] ?? -1;
    }
  }
  if (first === MSG_FRAME) {
    return 'frame';
  }
  if (first === MSG_INPUT) {
    return 'input';
  }
  return 'unknown';
}

// ---------------------------------------------------------------- address

export interface Address {
  host: string;
  port: number;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const PORT_RE = /^\d{1,5}$/;

/**
 * Parses "ip" or "ip:port" (IPv4 only). The port defaults to DEFAULT_TCP_PORT.
 * Returns null for invalid input (bad octet, port outside 1..65535, empty host).
 */
export function parseAddress(aText: string): Address | null {
  const text = aText.trim();
  const colon = text.indexOf(':');
  const hostPart = colon < 0 ? text : text.slice(0, colon);
  const portPart = colon < 0 ? null : text.slice(colon + 1);

  const m = IPV4_RE.exec(hostPart);
  if (m === null) {
    return null;
  }
  for (let i = 1; i <= 4; i++) {
    if (Number(m[i]) > 255) {
      return null;
    }
  }

  let port = DEFAULT_TCP_PORT;
  if (portPart !== null) {
    if (!PORT_RE.test(portPart)) {
      return null;
    }
    port = Number(portPart);
    if (port < 1 || port > 65535) {
      return null;
    }
  }
  return { host: hostPart, port };
}
