import { beforeEach, describe, expect, it } from 'vitest';
import type { FrameMeta } from '../../src/engine/assets/AssetRegistry';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntAnimation } from '../../src/engine/core/AntAnimation';
import { AntBasic } from '../../src/engine/core/AntBasic';
import { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { Anthill } from '../../src/engine/core/Anthill';
import { AntState } from '../../src/engine/core/AntState';
import { AntTileMap } from '../../src/engine/core/AntTileMap';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import {
  BLEND_ADD,
  BLEND_OVERLAY,
  BLEND_SCREEN,
  EXT_DEBUG_LINES,
  EXT_LIGHT,
  FRAME_HAS_DEBUG,
  FRAME_PAUSED,
  FRAME_SCENE_RESET,
  HEADER_SIZE,
  MAX_NODES,
  NODE_BLEND_MASK,
  NODE_BLEND_SHIFT,
  NODE_HAS_ALPHA,
  NODE_HAS_EXT,
  NODE_HAS_SCALE,
  NODE_HAS_TINT,
  NODE_TELEPORT,
  NO_LEVEL_GROUP,
  NO_MUSIC,
  NO_TEXTURE,
} from '../../src/frame/constants';
import { FrameDecodeError } from '../../src/frame/FrameDecodeError';
import { readFrame } from '../../src/frame/FrameReader';
import { FrameWriter, blendCode, makeUid } from '../../src/frame/FrameWriter';
import type { FrameScene, FrameSink, IFrameWritable, NodeData } from '../../src/frame/types';

/** An animation of `n` frames; frame i is 10 + i wide, 20 high, its registration point is (5, 10). */
function makeAnim(name: string, n: number, texBase = 100): AntAnimation {
  const frames: FrameMeta[] = [];
  for (let i = 0; i < n; i++) {
    frames.push({ texId: texBase + i, size1x: [10 + i, 20], origin1x: [5, 10], trim1x: [0, 0, 10, 20] });
  }
  const a = new AntAnimation(name);
  a.makeFromFrames(frames);
  return a;
}

function makeActor(texBase = 100, x = 0, y = 0): AntActor {
  const a = new AntActor();
  a.addAnimation(makeAnim('T' + texBase, 2, texBase));
  a.x = x;
  a.y = y;
  a.globalX = x;
  a.globalY = y;
  return a;
}

let camera: AntCamera;
let writer: FrameWriter;
let tick = 0;

function scene(root: AntEntity | null, extra: Partial<FrameScene> = {}): FrameScene {
  return { root, camera, tick: tick++, ...extra };
}

function bytes(buf: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buf));
}

beforeEach(() => {
  AntG.timeScale = 1;
  AntG.elapsed = 1 / 35;
  camera = new AntCamera(0, 0, 800, 600);
  writer = new FrameWriter();
  AntBasic.resetEntityIds(); // after the camera (it is an AntBasic too): the first entity gets id 1
  tick = 0;
});

describe('Frame format (golden bytes)', () => {
  it('a small frame is byte for byte what docs/03 §1 says', () => {
    const root = new AntEntity(); // entityId 1
    const actor = makeActor(100, 10, 20); // entityId 2, texId 100
    root.add(actor);
    const buf = writer.write({ root, camera, tick: 7 });
    expect(bytes(buf)).toEqual([
      // header (26 bytes)
      0x01, // type
      0x07, 0x00, 0x00, 0x00, // tick
      0x00, // flags
      0xff, 0xff, // musicTrack = silence
      0x00, // musicVol
      0x00, // muteFlags
      0xff, 0xff, // levelGroup = none
      0x00, 0x00, // tickCost
      0x00, 0x00, 0x00, 0x00, // reserved
      0x01, 0x00, // nodeCount
      0x00, 0x00, // oneShotCount
      0x00, 0x00, // loopCount
      0x00, 0x00, // extBytes
      // node (19 bytes)
      0x00, 0x02, 0x00, 0x00, // uid = 2 << 8
      0x64, 0x00, // texId 100
      0x01, // flags: teleport (new uid)
      0x00, 0x00, 0x20, 0x41, // x = 10
      0x00, 0x00, 0xa0, 0x41, // y = 20
      0x00, 0x00, 0x00, 0x00, // rotation
    ]);
    expect(buf.byteLength).toBe(HEADER_SIZE + 19);
  });

  it('scale, alpha, tint, blend, audio and header fields', () => {
    const root = new AntEntity();
    const actor = makeActor(100, 10, 20);
    root.add(actor);
    actor.scaleX = 2;
    actor.scaleY = 0.5;
    actor.alpha = 0.5; // 128
    actor.color = 0xff8040;
    actor.blend = 'add';
    const buf = writer.write({
      root,
      camera,
      tick: 0x01020304,
      paused: true,
      levelGroup: 4,
      tickCost: 1234,
      audio: {
        musicTrack: 3,
        musicVol: 200,
        muteFlags: 1,
        oneShots: [{ soundId: 5, volume: 128, pan: -64 }],
        loops: [{ channelId: 2, soundId: 9, volume: 255, pan: 127 }],
      },
    });
    expect(bytes(buf)).toEqual([
      0x01,
      0x04, 0x03, 0x02, 0x01,
      FRAME_PAUSED,
      0x03, 0x00,
      0xc8,
      0x01,
      0x04, 0x00,
      0xd2, 0x04,
      0x00, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x01, 0x00,
      0x01, 0x00,
      0x00, 0x00,
      // node
      0x00, 0x02, 0x00, 0x00,
      0x64, 0x00,
      0x01 | 0x02 | 0x04 | 0x08 | 0x10, // teleport, scale, alpha, tint, blend add
      0x00, 0x00, 0x20, 0x41,
      0x00, 0x00, 0xa0, 0x41,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x40, // scaleX 2
      0x00, 0x00, 0x00, 0x3f, // scaleY 0.5
      0x80, // alpha
      0xff, 0x80, 0x40, // tint
      // oneShot: soundId 5, volume 128, pan -64
      0x05, 0x00, 0x80, 0xc0,
      // loop: channelId 2, soundId 9, volume 255, pan 127
      0x02, 0x00, 0x09, 0x00, 0xff, 0x7f,
    ]);
  });

  it('an empty frame is just the header', () => {
    const buf = writer.write({ root: null, camera, tick: 1 });
    expect(buf.byteLength).toBe(HEADER_SIZE);
    const f = readFrame(buf);
    expect(f).toEqual({
      tick: 1,
      flags: 0,
      musicTrack: NO_MUSIC,
      musicVol: 0,
      muteFlags: 0,
      levelGroup: NO_LEVEL_GROUP,
      tickCost: 0,
      nodes: [],
      oneShots: [],
      loops: [],
    });
  });
});

/** Deterministic generator for the round-trip tests (no Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('Frame round trip', () => {
  it('1000 nodes with every flag combination', () => {
    const rnd = lcg(42);
    const expected: NodeData[] = [];
    // written through the sink API by a custom entity (below)
    const nodes: Array<(s: FrameSink) => void> = [];
    for (let i = 0; i < 1000; i++) {
      const hasScale = (i & 1) !== 0;
      const hasAlpha = (i & 2) !== 0;
      const hasTint = (i & 4) !== 0;
      const blend = (i >> 3) & 3;
      const teleport = (i & 32) !== 0;
      const uid = makeUid(1 + i, i % 5 === 0 ? i & 0xff : 0);
      const texId = i % 7 === 0 ? NO_TEXTURE : (rnd() * 60000) | 0;
      const x = Math.fround(rnd() * 800);
      const y = Math.fround(rnd() * 600);
      const rot = Math.fround((rnd() - 0.5) * 12);
      const sx = hasScale ? Math.fround(rnd() * 4 - 2) : 1;
      const sy = hasScale ? Math.fround(rnd() * 4 - 2) : 1;
      const alpha = hasAlpha ? (rnd() * 254) | 0 : 255;
      const tint = hasTint ? (rnd() * 0xfffffe) | 0 : 0xffffff;
      let flags = blend << NODE_BLEND_SHIFT;
      // 1st frame: every uid is new, so all nodes teleport
      flags |= NODE_TELEPORT;
      if (hasScale) flags |= NODE_HAS_SCALE;
      if (hasAlpha) flags |= NODE_HAS_ALPHA;
      if (hasTint) flags |= NODE_HAS_TINT;
      expected.push({ uid, texId, flags, x, y, rotation: rot, scaleX: sx, scaleY: sy, alpha, tint });
      nodes.push((s) => s.node(uid, texId, x, y, rot, sx, sy, alpha, tint, blend, teleport));
    }

    const holder = new (class extends AntEntity implements IFrameWritable {
      writeFrame(s: FrameSink): void {
        for (const n of nodes) n(s);
      }
    })();
    const small = new FrameWriter(256); // forces the buffer to grow many times
    const buf = small.write({ root: holder, camera, tick: 99 });
    const f = readFrame(buf);
    expect(f.nodes).toHaveLength(1000);
    expect(f.nodes).toEqual(expected);
  });

  it('blend codes and the blend bits', () => {
    expect(blendCode(null)).toBe(0);
    expect(blendCode('add')).toBe(BLEND_ADD);
    expect(blendCode('overlay')).toBe(BLEND_OVERLAY);
    expect(blendCode('screen')).toBe(BLEND_SCREEN);
    expect(NODE_BLEND_MASK).toBe(0x30);
  });

  it('a light with 100 points and gradient stops', () => {
    const points: number[] = [];
    for (let i = 0; i < 100; i++) {
      points.push(Math.fround(400 + i * 1.25), Math.fround(300 - i * 0.5));
    }
    const stops = [0, 255, 200, 100, 255, 128, 10, 20, 30, 128, 255, 0, 0, 0, 0];
    const holder = new (class extends AntEntity implements IFrameWritable {
      writeFrame(s: FrameSink): void {
        s.light(makeUid(this.entityId), BLEND_OVERLAY, points, 100, 400.5, 300.25, 90, stops, 3, 4, 6);
      }
    })();
    const buf = writer.write({ root: holder, camera, tick: 1 });
    const f = readFrame(buf);
    expect(f.nodes).toHaveLength(1);
    const n = f.nodes[0]!;
    expect(n.texId).toBe(NO_TEXTURE);
    expect(n.flags & NODE_HAS_EXT).toBe(NODE_HAS_EXT);
    expect((n.flags & NODE_BLEND_MASK) >> NODE_BLEND_SHIFT).toBe(BLEND_OVERLAY);
    expect(n.ext).toEqual({
      kind: EXT_LIGHT,
      points: new Float32Array(points),
      gradCenterX: 400.5,
      gradCenterY: 300.25,
      gradRadius: 90,
      stops: new Uint8Array(stops),
      blurX: 4,
      blurY: 6,
    });
    // 1 type + 2 count + 800 points + 12 + 1 + 15 stops + 8 blur
    expect(new DataView(buf).getUint16(24, true)).toBe(1 + 2 + 800 + 12 + 1 + 15 + 8);
  });

  it('debug lines set the header bit and come last', () => {
    const root = new AntEntity();
    root.add(makeActor(100));
    const lines = [1, 2, 3, 4, 5.5, 6.5, 7.5, 8.5];
    const colors = [0xff0000ff, 0x00ff00cc];
    const buf = writer.write({ root, camera, tick: 3, debugLines: { count: 2, lines, colors } });
    const f = readFrame(buf);
    expect(f.flags & FRAME_HAS_DEBUG).toBe(FRAME_HAS_DEBUG);
    expect(f.nodes).toHaveLength(2);
    expect(f.nodes[1]!.uid).toBe(0);
    expect(f.nodes[1]!.ext).toEqual({
      kind: EXT_DEBUG_LINES,
      lines: new Float32Array(lines),
      colors: new Uint32Array(colors),
    });
  });

  it('u16 / i8 / u8 boundaries of the header and the sound events', () => {
    const buf = writer.write({
      root: null,
      camera,
      tick: 0xffffffff,
      paused: true,
      sceneReset: true,
      levelGroup: 20,
      tickCost: 0xffff,
      audio: {
        musicTrack: 0xfffe,
        musicVol: 255,
        muteFlags: 3,
        oneShots: [
          { soundId: 0, volume: 0, pan: -127 },
          { soundId: 0xffff, volume: 255, pan: 127 },
        ],
        loops: [
          { channelId: 0xffff, soundId: 0xffff, volume: 255, pan: -127 },
          { channelId: 0, soundId: 0, volume: 0, pan: 0 },
        ],
      },
    });
    const f = readFrame(buf);
    expect(f.tick).toBe(0xffffffff);
    expect(f.flags).toBe(FRAME_PAUSED | FRAME_SCENE_RESET);
    expect([f.musicTrack, f.musicVol, f.muteFlags, f.levelGroup, f.tickCost]).toEqual([0xfffe, 255, 3, 20, 0xffff]);
    expect(f.oneShots).toEqual([
      { soundId: 0, volume: 0, pan: -127 },
      { soundId: 0xffff, volume: 255, pan: 127 },
    ]);
    expect(f.loops).toEqual([
      { channelId: 0xffff, soundId: 0xffff, volume: 255, pan: -127 },
      { channelId: 0, soundId: 0, volume: 0, pan: 0 },
    ]);
  });

  it('nodes over MAX_NODES are dropped, nodeCount stays a valid u16', () => {
    const holder = new (class extends AntEntity implements IFrameWritable {
      writeFrame(s: FrameSink): void {
        for (let i = 0; i < MAX_NODES + 10; i++) s.node(i + 1, 1, 0, 0, 0, 1, 1, 255, 0xffffff, 0, false);
      }
    })();
    const f = readFrame(writer.write({ root: holder, camera, tick: 0 }));
    expect(f.nodes).toHaveLength(MAX_NODES);
  });
});

describe('readFrame errors', () => {
  function complexFrame(): ArrayBuffer {
    const root = new AntEntity();
    const a = makeActor(100, 1, 2);
    a.scaleX = 2;
    a.alpha = 0.5;
    a.color = 0x123456;
    root.add(a);
    const light = new (class extends AntEntity implements IFrameWritable {
      writeFrame(s: FrameSink): void {
        s.light(77, 1, [1, 2, 3, 4], 2, 1, 2, 3, [1, 2, 3, 4, 5], 1, 0, 0);
      }
    })();
    root.add(light);
    return writer.write({
      root,
      camera,
      tick: 5,
      debugLines: { count: 1, lines: [1, 2, 3, 4], colors: [5] },
      audio: {
        musicTrack: 1,
        musicVol: 2,
        muteFlags: 0,
        oneShots: [{ soundId: 1, volume: 2, pan: 3 }],
        loops: [{ channelId: 1, soundId: 2, volume: 3, pan: 4 }],
      },
    });
  }

  it('every truncated prefix throws FrameDecodeError, never anything else', () => {
    const buf = complexFrame();
    expect(() => readFrame(buf)).not.toThrow();
    for (let n = 0; n < buf.byteLength; n++) {
      expect(() => readFrame(buf.slice(0, n)), 'prefix ' + n).toThrow(FrameDecodeError);
    }
  });

  it('trailing bytes, a wrong type, an unknown ext type and a wrong extBytes are rejected', () => {
    const buf = complexFrame();
    const longer = new Uint8Array(buf.byteLength + 1);
    longer.set(new Uint8Array(buf));
    expect(() => readFrame(longer.buffer)).toThrow(/trailing/);

    const wrongType = buf.slice(0);
    new Uint8Array(wrongType)[0] = 0x02;
    expect(() => readFrame(wrongType)).toThrow(FrameDecodeError);

    const wrongExt = buf.slice(0);
    new DataView(wrongExt).setUint16(24, 3, true);
    expect(() => readFrame(wrongExt)).toThrow(/extBytes/);

    const badExtType = buf.slice(0);
    // the light node follows the actor node (19 + 8 scale + 1 alpha + 3 tint = 31 bytes); its ext type is at +19
    new Uint8Array(badExtType)[HEADER_SIZE + 31 + 19] = 0x7f;
    expect(() => readFrame(badExtType)).toThrow(/unknown ext type/);
  });

  it('a huge nodeCount in a tiny buffer is an error, not an allocation', () => {
    const buf = new ArrayBuffer(HEADER_SIZE);
    const v = new DataView(buf);
    v.setUint8(0, 1);
    v.setUint16(18, 65535, true);
    expect(() => readFrame(buf)).toThrow(FrameDecodeError);
  });
});

describe('FrameWriter: traversal order and visibility', () => {
  it('nodes come in the drawing order of AntEntity.draw: an actor first, then its children', () => {
    // root
    //  ├─ A (actor)
    //  │   ├─ A1 (actor)
    //  │   │   └─ A1a (actor)
    //  │   └─ A2 (actor)
    //  ├─ G (group)
    //  │   ├─ G1 (actor)
    //  │   └─ G2 (actor)
    //  └─ B (actor)
    const root = new AntEntity();
    const A = makeActor(100);
    const A1 = makeActor(110);
    const A1a = makeActor(120);
    const A2 = makeActor(130);
    const G = new AntEntity();
    const G1 = makeActor(140);
    const G2 = makeActor(150);
    const B = makeActor(160);
    root.add(A);
    A.add(A1);
    A1.add(A1a);
    A.add(A2);
    root.add(G);
    G.add(G1);
    G.add(G2);
    root.add(B);
    const f = readFrame(writer.write(scene(root)));
    const names = new Map<number, string>([
      [A.entityId, 'A'],
      [A1.entityId, 'A1'],
      [A1a.entityId, 'A1a'],
      [A2.entityId, 'A2'],
      [G1.entityId, 'G1'],
      [G2.entityId, 'G2'],
      [B.entityId, 'B'],
    ]);
    expect(f.nodes.map((n) => names.get(n.uid >>> 8))).toEqual(['A', 'A1', 'A1a', 'A2', 'G1', 'G2', 'B']);
  });

  it('exists=false or visible=false hides the entity with all its children', () => {
    const root = new AntEntity();
    const parent = makeActor(100);
    const child = makeActor(110);
    const other = makeActor(120);
    root.add(parent);
    parent.add(child);
    root.add(other);
    expect(readFrame(writer.write(scene(root))).nodes).toHaveLength(3);

    parent.exists = false;
    let f = readFrame(writer.write(scene(root)));
    expect(f.nodes.map((n) => n.texId)).toEqual([120]);

    parent.exists = true;
    parent.visible = false;
    f = readFrame(writer.write(scene(root)));
    expect(f.nodes.map((n) => n.texId)).toEqual([120]);

    parent.visible = true;
    child.exists = false;
    f = readFrame(writer.write(scene(root)));
    expect(f.nodes.map((n) => n.texId)).toEqual([100, 120]);

    root.visible = false;
    expect(readFrame(writer.write(scene(root))).nodes).toHaveLength(0);
  });

  it('an actor without a frame and a plain group write no node', () => {
    const root = new AntEntity();
    root.add(new AntActor()); // no animation
    root.add(new AntEntity());
    expect(readFrame(writer.write(scene(root))).nodes).toHaveLength(0);
  });

  it('screen coordinates: global + scroll * scrollFactor, radians, scale, alpha, tint', () => {
    const root = new AntEntity();
    const a = makeActor(100, 100, 50);
    a.angle = 90;
    a.globalAngle = 90;
    a.scaleX = -1;
    a.alpha = 0;
    a.color = 0x0000ff;
    root.add(a);
    const bg = makeActor(110, 100, 50);
    bg.scrollFactorX = 0.5;
    bg.scrollFactorY = 0;
    root.add(bg);
    camera.scroll.set(-30, -20);
    const f = readFrame(writer.write(scene(root)));
    const n = f.nodes[0]!;
    expect([n.x, n.y]).toEqual([70, 30]);
    expect(n.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect([n.scaleX, n.scaleY, n.alpha, n.tint]).toEqual([-1, 1, 0, 0x0000ff]);
    const m = f.nodes[1]!;
    expect([m.x, m.y]).toEqual([85, 50]);
  });

  it('uid = (entityId << 8) | subIndex, entity ids are u24', () => {
    expect(makeUid(1, 0)).toBe(0x100);
    expect(makeUid(0xffffff, 0xff)).toBe(0xffffffff);
    expect(makeUid(0xffffff, 1)).toBe(0xffffff01);
    const root = new AntEntity();
    const a = makeActor(100);
    root.add(a);
    expect(readFrame(writer.write(scene(root))).nodes[0]!.uid).toBe(makeUid(a.entityId));
  });

  it('AntTileMap layer: texId of the symbol via resolveTexId', () => {
    const root = new AntEntity();
    const map = new AntTileMap();
    map.symbolName = 'Level01BG_mc';
    root.add(map);
    const asked: string[] = [];
    const resolve = (s: string): number => {
      asked.push(s);
      return 777;
    };
    const f = readFrame(writer.write(scene(root, { resolveTexId: resolve })));
    expect(f.nodes.map((n) => n.texId)).toEqual([777]);
    writer.write(scene(root, { resolveTexId: resolve }));
    expect(asked).toEqual(['Level01BG_mc']); // cached
  });

  it('IFrameWritable entities: glyph uids, children still follow', () => {
    class Glyphs extends AntEntity implements IFrameWritable {
      writeFrame(s: FrameSink): void {
        for (let i = 0; i < 3; i++) {
          s.node(makeUid(this.entityId, i), 500 + i, s.screenX(this, this.globalX + i * 8), s.screenY(this, this.globalY), 0, 1, 1, 255, 0xffffff, 0, this.justReset);
        }
      }
    }
    const root = new AntEntity();
    const label = new Glyphs();
    label.x = label.globalX = 10;
    label.y = label.globalY = 10;
    root.add(label);
    label.add(makeActor(100));
    const f = readFrame(writer.write(scene(root)));
    expect(f.nodes.map((n) => [n.uid & 0xff, n.texId])).toEqual([
      [0, 500],
      [1, 501],
      [2, 502],
      [0, 100],
    ]);
    expect(f.nodes[1]!.x).toBe(18);
  });
});

describe('FrameWriter: teleport', () => {
  function flagsOf(f: { nodes: NodeData[] }, i = 0): boolean {
    return (f.nodes[i]!.flags & NODE_TELEPORT) !== 0;
  }

  it('a new uid teleports, a node that stays does not', () => {
    const root = new AntEntity();
    const a = makeActor(100, 10, 10);
    root.add(a);
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
    a.x = a.globalX = 15;
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(false);
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(false);

    // a second actor appears
    const b = makeActor(110, 0, 0);
    root.add(b);
    const f = readFrame(writer.write(scene(root)));
    expect([flagsOf(f, 0), flagsOf(f, 1)]).toEqual([false, true]);
  });

  it('a node that was hidden for a tick teleports when it comes back', () => {
    const root = new AntEntity();
    const a = makeActor(100, 10, 10);
    root.add(a);
    writer.write(scene(root));
    a.visible = false;
    writer.write(scene(root));
    a.visible = true;
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
  });

  it('a jump over 200 px teleports, exactly 200 does not', () => {
    const root = new AntEntity();
    const a = makeActor(100, 0, 0);
    root.add(a);
    writer.write(scene(root));
    a.x = a.globalX = 200;
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(false);
    a.x = a.globalX = 200 + 200.5;
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
    a.x = a.globalX = 200 + 200.5 + 141;
    a.y = a.globalY = 141; // sqrt(141^2 + 141^2) = 199.4
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(false);
  });

  it('a camera jump teleports too (screen coordinates changed by more than 200)', () => {
    const root = new AntEntity();
    root.add(makeActor(100, 0, 0));
    writer.write(scene(root));
    camera.scroll.x = -300;
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
  });

  it('reset() and revive() teleport once (justReset is cleared by the writer)', () => {
    const root = new AntEntity();
    const a = makeActor(100, 10, 10);
    root.add(a);
    writer.write(scene(root));
    a.reset(12, 10);
    expect(a.justReset).toBe(true);
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
    expect(a.justReset).toBe(false);
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(false);

    a.kill();
    a.revive();
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(false);
  });

  it('sceneReset teleports everything and is in the header; the next frame is normal', () => {
    const root = new AntEntity();
    root.add(makeActor(100, 10, 10));
    root.add(makeActor(110, 20, 10));
    writer.write(scene(root));
    let f = readFrame(writer.write(scene(root, { sceneReset: true })));
    expect(f.flags & FRAME_SCENE_RESET).toBe(FRAME_SCENE_RESET);
    expect(f.nodes.every((n) => (n.flags & NODE_TELEPORT) !== 0)).toBe(true);
    f = readFrame(writer.write(scene(root)));
    expect(f.flags & FRAME_SCENE_RESET).toBe(0);
    expect(f.nodes.some((n) => (n.flags & NODE_TELEPORT) !== 0)).toBe(false);
  });

  it('writer.reset() forgets the previous frame', () => {
    const root = new AntEntity();
    root.add(makeActor(100, 10, 10));
    writer.write(scene(root));
    writer.reset();
    expect(flagsOf(readFrame(writer.write(scene(root))))).toBe(true);
  });

  it('many uids (hash collisions) keep their own positions', () => {
    const holder = new (class extends AntEntity implements IFrameWritable {
      shift = 0;
      writeFrame(s: FrameSink): void {
        for (let i = 0; i < 5000; i++) s.node(makeUid(i + 1), 1, i + this.shift, 0, 0, 1, 1, 255, 0xffffff, 0, false);
      }
    })();
    writer.write(scene(holder));
    holder.shift = 0;
    let f = readFrame(writer.write(scene(holder)));
    expect(f.nodes.some((n) => (n.flags & NODE_TELEPORT) !== 0)).toBe(false);
    holder.shift = 250;
    f = readFrame(writer.write(scene(holder)));
    expect(f.nodes.every((n) => (n.flags & NODE_TELEPORT) !== 0)).toBe(true);
  });
});

describe('FrameWriter at the render point of Anthill.tick', () => {
  it('between state.postUpdate() and plugins.update(), the frame shows the state of this tick', () => {
    const log: string[] = [];
    const frames: ArrayBuffer[] = [];
    class S extends AntState {
      actor = makeActor(100, 0, 0);
      override create(): void {
        this.add(this.actor);
      }
      override update(): void {
        this.actor.x = this.actor.globalX += 5;
        super.update();
        log.push('update');
      }
      override postUpdate(): void {
        log.push('post');
      }
    }
    let n = 0;
    const hill = new Anthill(null, true, {
      onRender: (cameras) => {
        log.push('render');
        const s = hill.state as S;
        frames.push(writer.write({ root: s.defGroup, camera: cameras[0]!, tick: n++ }));
      },
      onPlugins: () => log.push('plugins'),
    });
    hill.switchState(new S());
    hill.tick(emptyInputSnapshot());
    hill.tick(emptyInputSnapshot());
    expect(log).toEqual(['update', 'post', 'render', 'plugins', 'update', 'post', 'render', 'plugins']);
    const f = readFrame(frames[1]!);
    expect(f.tick).toBe(1);
    expect(f.nodes).toHaveLength(1);
    expect(f.nodes[0]!.x).toBe(10);
    expect((f.nodes[0]!.flags & NODE_TELEPORT) !== 0).toBe(false);
  });
});

describe('FrameWriter speed', () => {
  it('600 nodes (log only, soft threshold 0.3 ms on an M5)', () => {
    const root = new AntEntity();
    const group = new AntEntity();
    root.add(group);
    for (let i = 0; i < 600; i++) {
      const a = makeActor(100 + (i % 20), (i * 7) % 800, (i * 13) % 600);
      if (i % 3 === 0) a.alpha = 0.5;
      if (i % 5 === 0) a.scaleX = 1.5;
      group.add(a);
    }
    for (let i = 0; i < 200; i++) writer.write(scene(root)); // warm up the JIT
    const runs = 1000;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) writer.write(scene(root));
    const ms = (performance.now() - t0) / runs;
    console.log(`FrameWriter: 600 nodes in ${ms.toFixed(3)} ms per frame`);
    expect(readFrame(writer.write(scene(root))).nodes).toHaveLength(600);
    expect(ms).toBeLessThan(5); // very soft: only catches an accidental O(n^2)
  });
});
