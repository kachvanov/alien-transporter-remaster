// Not a port. Reads a Frame (docs/03-frame-and-network-protocol.md §1). Little-endian.

import {
  EXT_DEBUG_LINES,
  EXT_LIGHT,
  HEADER_SIZE,
  MSG_FRAME,
  NODE_HAS_ALPHA,
  NODE_HAS_EXT,
  NODE_HAS_SCALE,
  NODE_HAS_TINT,
} from './constants';
import { FrameDecodeError } from './FrameDecodeError';
import type { DebugLinesExt, FrameData, LightExt, LoopData, NodeData, NodeExt, OneShotData } from './types';

/** Cursor with bounds checks: every read first checks that the bytes exist. */
class Cursor {
  readonly view: DataView;
  pos = 0;

  constructor(buf: ArrayBuffer) {
    this.view = new DataView(buf);
  }

  need(n: number, what: string): void {
    if (this.pos + n > this.view.byteLength) {
      throw new FrameDecodeError(
        `truncated buffer: need ${n} byte(s) for ${what} at offset ${this.pos}, size is ${this.view.byteLength}`,
      );
    }
  }

  u8(what: string): number {
    this.need(1, what);
    return this.view.getUint8(this.pos++);
  }

  i8(what: string): number {
    this.need(1, what);
    return this.view.getInt8(this.pos++);
  }

  u16(what: string): number {
    this.need(2, what);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(what: string): number {
    this.need(4, what);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f32(what: string): number {
    this.need(4, what);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
}

function readLight(c: Cursor): LightExt {
  const pointCount = c.u16('light pointCount');
  c.need(pointCount * 8, 'light points');
  const points = new Float32Array(pointCount * 2);
  for (let i = 0; i < points.length; i++) {
    points[i] = c.f32('light point');
  }

  const gradCenterX = c.f32('light gradCenterX');
  const gradCenterY = c.f32('light gradCenterY');
  const gradRadius = c.f32('light gradRadius');
  const stopCount = c.u8('light stopCount');
  c.need(stopCount * 5, 'light stops');
  const stops = new Uint8Array(stopCount * 5);
  for (let i = 0; i < stops.length; i++) {
    stops[i] = c.u8('light stop');
  }

  const blurX = c.f32('light blurX');
  const blurY = c.f32('light blurY');
  return { kind: EXT_LIGHT, points, gradCenterX, gradCenterY, gradRadius, stops, blurX, blurY };
}

function readDebugLines(c: Cursor): DebugLinesExt {
  const n = c.u16('debug line count');
  c.need(n * 20, 'debug lines');
  const lines = new Float32Array(n * 4);
  const colors = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    lines[i * 4] = c.f32('debug x1');
    lines[i * 4 + 1] = c.f32('debug y1');
    lines[i * 4 + 2] = c.f32('debug x2');
    lines[i * 4 + 3] = c.f32('debug y2');
    colors[i] = c.u32('debug rgba');
  }

  return { kind: EXT_DEBUG_LINES, lines, colors };
}

/** Decodes a Frame. Throws FrameDecodeError for a truncated or malformed buffer. */
export function readFrame(buf: ArrayBuffer): FrameData {
  const c = new Cursor(buf);
  if (buf.byteLength < HEADER_SIZE) {
    throw new FrameDecodeError(`truncated buffer: ${buf.byteLength} byte(s), the header is ${HEADER_SIZE}`);
  }

  const type = c.u8('type');
  if (type !== MSG_FRAME) {
    throw new FrameDecodeError(`bad message type 0x${type.toString(16)}, expected 0x01`);
  }

  const tick = c.u32('tick');
  const flags = c.u8('flags');
  const musicTrack = c.u16('musicTrack');
  const musicVol = c.u8('musicVol');
  const muteFlags = c.u8('muteFlags');
  const levelGroup = c.u16('levelGroup');
  const tickCost = c.u16('tickCost');
  c.u32('reserved');
  const nodeCount = c.u16('nodeCount');
  const oneShotCount = c.u16('oneShotCount');
  const loopCount = c.u16('loopCount');
  const extBytes = c.u16('extBytes');

  // The smallest node is 19 bytes: reject an absurd count before allocating.
  c.need(nodeCount * 19, 'nodes');

  const nodes: NodeData[] = new Array<NodeData>(nodeCount);
  let extTotal = 0;
  for (let i = 0; i < nodeCount; i++) {
    const uid = c.u32('node uid');
    const texId = c.u16('node texId');
    const nflags = c.u8('node flags');
    const x = c.f32('node x');
    const y = c.f32('node y');
    const rotation = c.f32('node rotation');
    let scaleX = 1;
    let scaleY = 1;
    if ((nflags & NODE_HAS_SCALE) !== 0) {
      scaleX = c.f32('node scaleX');
      scaleY = c.f32('node scaleY');
    }

    const alpha = (nflags & NODE_HAS_ALPHA) !== 0 ? c.u8('node alpha') : 255;
    let tint = 0xffffff;
    if ((nflags & NODE_HAS_TINT) !== 0) {
      const r = c.u8('node tint r');
      const g = c.u8('node tint g');
      const b = c.u8('node tint b');
      tint = (r << 16) | (g << 8) | b;
    }

    const node: NodeData = { uid, texId, flags: nflags, x, y, rotation, scaleX, scaleY, alpha, tint };
    if ((nflags & NODE_HAS_EXT) !== 0) {
      const start = c.pos;
      const extType = c.u8('ext type');
      let ext: NodeExt;
      if (extType === EXT_LIGHT) {
        ext = readLight(c);
      } else if (extType === EXT_DEBUG_LINES) {
        ext = readDebugLines(c);
      } else {
        throw new FrameDecodeError(`unknown ext type 0x${extType.toString(16)} at offset ${start}`);
      }

      extTotal += c.pos - start;
      node.ext = ext;
    }

    nodes[i] = node;
  }

  // extBytes is informational and saturates at 0xFFFF.
  if (extBytes !== 0xffff && extBytes !== extTotal) {
    throw new FrameDecodeError(`extBytes is ${extBytes}, the ext blocks take ${extTotal}`);
  }

  c.need(oneShotCount * 4 + loopCount * 6, 'sound events');
  const oneShots: OneShotData[] = new Array<OneShotData>(oneShotCount);
  for (let i = 0; i < oneShotCount; i++) {
    oneShots[i] = { soundId: c.u16('oneShot soundId'), volume: c.u8('oneShot volume'), pan: c.i8('oneShot pan') };
  }

  const loops: LoopData[] = new Array<LoopData>(loopCount);
  for (let i = 0; i < loopCount; i++) {
    loops[i] = {
      channelId: c.u16('loop channelId'),
      soundId: c.u16('loop soundId'),
      volume: c.u8('loop volume'),
      pan: c.i8('loop pan'),
    };
  }

  if (c.pos !== buf.byteLength) {
    throw new FrameDecodeError(`${buf.byteLength - c.pos} trailing byte(s) after the frame`);
  }

  return { tick, flags, musicTrack, musicVol, muteFlags, levelGroup, tickCost, nodes, oneShots, loops };
}
