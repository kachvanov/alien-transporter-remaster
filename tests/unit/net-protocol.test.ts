import { describe, expect, it } from 'vitest';
import {
  CloseCode,
  DEFAULT_TCP_PORT,
  DEFAULT_UDP_PORT,
  INPUT_GAS,
  INPUT_LEFT,
  INPUT_PAUSE_REQ,
  INPUT_RIGHT,
  PROTO_VERSION,
  ProtocolError,
  decodeInput,
  encodeInput,
  encodeMessage,
  messageKind,
  parseAddress,
  parseClientMessage,
  parseHostMessage,
} from '../../src/net/protocol';

describe('net/protocol constants', () => {
  it('has the documented values', () => {
    expect(PROTO_VERSION).toBe(1);
    expect(DEFAULT_TCP_PORT).toBe(47020);
    expect(DEFAULT_UDP_PORT).toBe(47021);
    expect(CloseCode).toEqual({ full: 4000, version: 4001, busy: 4002, protocol_error: 4003 });
    expect([INPUT_GAS, INPUT_LEFT, INPUT_RIGHT, INPUT_PAUSE_REQ]).toEqual([1, 2, 4, 8]);
  });
});

describe('Input', () => {
  it('round-trips', () => {
    for (const seq of [0, 1, 255, 65536, 0xffffffff]) {
      for (const bits of [0, 1, 5, 15]) {
        const buf = encodeInput({ seq, bits });
        expect(buf.byteLength).toBe(6);
        expect(decodeInput(buf)).toEqual({ seq, bits });
      }
    }
  });

  it('is little-endian with type 0x02', () => {
    const u8 = new Uint8Array(encodeInput({ seq: 0x01020304, bits: INPUT_GAS | INPUT_RIGHT }));
    expect(Array.from(u8)).toEqual([2, 4, 3, 2, 1, 5]);
  });

  it('rejects wrong size and type', () => {
    expect(() => decodeInput(new ArrayBuffer(5))).toThrow(ProtocolError);
    expect(() => decodeInput(new Uint8Array([1, 0, 0, 0, 0, 0]))).toThrow(ProtocolError);
  });

  it('decodes a view with a byte offset', () => {
    const src = new Uint8Array(encodeInput({ seq: 9, bits: 3 }));
    const big = new Uint8Array(10);
    big.set(src, 2);
    expect(decodeInput(big.subarray(2, 8))).toEqual({ seq: 9, bits: 3 });
  });
});

describe('messageKind', () => {
  it('classifies data', () => {
    expect(messageKind('{"t":"bye"}')).toBe('json');
    expect(messageKind(encodeInput({ seq: 1, bits: 0 }))).toBe('input');
    expect(messageKind(new Uint8Array([1, 0, 0]))).toBe('frame');
    expect(messageKind(new Uint8Array([1, 0, 0]).buffer)).toBe('frame');
    expect(messageKind(new Uint8Array([9]))).toBe('unknown');
    expect(messageKind(new ArrayBuffer(0))).toBe('unknown');
    expect(messageKind(42)).toBe('unknown');
    expect(messageKind(null)).toBe('unknown');
  });
});

describe('JSON messages', () => {
  const ship = { shuttleKind: 0, shuttleColor: 2, engineKind: 0, engineColor: 1 };

  it('parses client messages', () => {
    const hello = { t: 'hello', proto: 1, buildHash: 'abc', name: 'Mac', ship } as const;
    expect(parseClientMessage(encodeMessage(hello))).toEqual(hello);
    expect(parseClientMessage('{"t":"bye"}')).toEqual({ t: 'bye' });
  });

  it('parses host messages', () => {
    for (const m of [
      { t: 'welcome', proto: 1, hostName: 'PC', tickRate: 35 },
      { t: 'reject', reason: 'full' },
      { t: 'reject', reason: 'version' },
      { t: 'reject', reason: 'busy' },
      { t: 'notice', text: 'Host paused' },
      { t: 'bye', reason: 'host_quit' },
    ] as const) {
      expect(parseHostMessage(encodeMessage(m))).toEqual(m);
    }
  });

  it('throws on invalid JSON', () => {
    expect(() => parseClientMessage('{nope')).toThrow(ProtocolError);
    expect(() => parseHostMessage('')).toThrow(ProtocolError);
  });

  it('throws on invalid schema', () => {
    expect(() => parseClientMessage('{"t":"hello"}')).toThrow(ProtocolError);
    expect(() =>
      parseClientMessage('{"t":"welcome","proto":1,"hostName":"x","tickRate":35}'),
    ).toThrow(ProtocolError);
    expect(() => parseHostMessage('{"t":"reject","reason":"other"}')).toThrow(ProtocolError);
    expect(() => parseHostMessage('{"t":"zzz"}')).toThrow(ProtocolError);
    expect(() => parseHostMessage('[]')).toThrow(ProtocolError);
    expect(() => parseHostMessage('null')).toThrow(ProtocolError);
  });
});

describe('parseAddress', () => {
  it('parses ip and ip:port', () => {
    expect(parseAddress('192.168.1.5:47020')).toEqual({ host: '192.168.1.5', port: 47020 });
    expect(parseAddress('192.168.1.5')).toEqual({ host: '192.168.1.5', port: DEFAULT_TCP_PORT });
    expect(parseAddress(' 10.0.0.1:1 ')).toEqual({ host: '10.0.0.1', port: 1 });
    expect(parseAddress('255.255.255.255:65535')).toEqual({ host: '255.255.255.255', port: 65535 });
  });

  it('rejects invalid input', () => {
    for (const s of [
      '',
      ':80',
      'abc',
      '300.1.1.1',
      '1.2.3',
      '1.2.3.4.5',
      '1.2.3.4:',
      '1.2.3.4:0',
      '1.2.3.4:65536',
      '1.2.3.4:abc',
      '1.2.3.4:-1',
      '1.2.3.4:80:90',
      'localhost:47020',
      '1.2.3.4a',
    ]) {
      expect(parseAddress(s), s).toBeNull();
    }
  });
});
