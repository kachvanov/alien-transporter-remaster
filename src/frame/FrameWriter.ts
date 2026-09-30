// Not a port. Serialises the scene tree into a Frame (docs/03-frame-and-network-protocol.md §1).
//
// The traversal is the drawing order of the original: AntState.draw -> AntEntity.draw. An AntActor draws
// itself first, then `drawChildren()` (children that are `exists && visible`, in list order), so the
// children are in front of their parent. A node is written for an actor with a frame, for an AntTileMap
// with a layer symbol, and for entities that implement IFrameWritable (Label glyphs, AntLight, ...).
//
// Screen coordinates: `global + camera.scroll * scrollFactor` (AntEntity.toScreenPosition, as
// AntActor.drawActor does). DEVIATION from docs/tasks/T1.5 ("global - scroll * scrollFactor"): in the
// original the camera `scroll` is the negated camera position, so it is added; the shake of the camera is
// already part of `scroll` (AntCamera.updateShaker), there is no separate shake offset.
//
// The sprite position is the registration point of the frame: in AntActor.drawActor the bitmap is
// translated by `screen + origin` and the matrix (scale, rotate) pivots around the registration point, so
// the renderer sets the anchor from origin1x and puts the sprite at the node position.
//
// No allocations per node: the buffer is reused between ticks, the previous positions (teleport rule) live
// in two open-addressing tables of typed arrays.

import { AntActor } from '../engine/core/AntActor';
import type { AntCamera } from '../engine/core/AntCamera';
import type { AntEntity } from '../engine/core/AntEntity';
import { AntTileMap } from '../engine/core/AntTileMap';
import { AssetRegistry } from '../engine/assets/AssetRegistry';
import {
  BLEND_ADD,
  BLEND_NORMAL,
  BLEND_OVERLAY,
  BLEND_SCREEN,
  EXT_DEBUG_LINES,
  EXT_LIGHT,
  FRAME_HAS_DEBUG,
  FRAME_PAUSED,
  FRAME_SCENE_RESET,
  HEADER_SIZE,
  MAX_NODES,
  MSG_FRAME,
  NODE_BASE_SIZE,
  NODE_BLEND_SHIFT,
  NODE_HAS_ALPHA,
  NODE_HAS_EXT,
  NODE_HAS_SCALE,
  NODE_HAS_TINT,
  NODE_TELEPORT,
  NO_LEVEL_GROUP,
  NO_MUSIC,
  NO_TEXTURE,
  TELEPORT_DISTANCE,
} from './constants';
import type { FrameScene, FrameSink } from './types';
import { isFrameWritable } from './types';

const TABLE_BITS = 17; // 131072 slots: at most MAX_NODES entries, load <= 0.5
const TABLE_SIZE = 1 << TABLE_BITS;
const TABLE_MASK = TABLE_SIZE - 1;
const HASH_SHIFT = 32 - TABLE_BITS;
const TELEPORT_DIST2 = TELEPORT_DISTANCE * TELEPORT_DISTANCE;

/** Positions of the nodes of one frame by uid. An entry is valid when `stamp[slot] === generation`. */
class PositionTable {
  readonly keys = new Uint32Array(TABLE_SIZE);
  readonly stamp = new Uint32Array(TABLE_SIZE);
  readonly xs = new Float32Array(TABLE_SIZE);
  readonly ys = new Float32Array(TABLE_SIZE);
}

/** `blend` string of AntActor -> node blend code. */
export function blendCode(aBlend: string | null): number {
  switch (aBlend) {
    case 'add':
      return BLEND_ADD;
    case 'overlay':
      return BLEND_OVERLAY;
    case 'screen':
      return BLEND_SCREEN;
    default:
      return BLEND_NORMAL;
  }
}

/** `(entityId << 8) | subIndex` as u32. */
export function makeUid(aEntityId: number, aSubIndex = 0): number {
  return ((aEntityId << 8) | (aSubIndex & 0xff)) >>> 0;
}

export class FrameWriter implements FrameSink {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _buffer: ArrayBuffer;
  private _view: DataView;
  private _pos = 0;
  private _nodeCount = 0;
  private _extBytes = 0;

  private readonly _tables: [PositionTable, PositionTable] = [new PositionTable(), new PositionTable()];
  /** Generation of the frame being written; the previous frame is `_gen - 1`. */
  private _gen = 2;
  private _sceneReset = false;
  private _scene: FrameScene | null = null;
  private readonly _texIds = new Map<string, number>();

  camera!: AntCamera;

  constructor(aInitialCapacity = 32 * 1024) {
    this._buffer = new ArrayBuffer(Math.max(aInitialCapacity, 256));
    this._view = new DataView(this._buffer);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** Forgets the previous frame: every node of the next frame teleports. */
  reset(): void {
    this._gen += 2;
    this._texIds.clear();
  }

  /** Writes the frame of this tick. The returned buffer is a copy, the writer keeps reusing its own. */
  write(aScene: FrameScene): ArrayBuffer {
    this._scene = aScene;
    this.camera = aScene.camera;
    this._gen = (this._gen + 1) >>> 0;
    this._sceneReset = aScene.sceneReset === true;
    this._pos = HEADER_SIZE;
    this._nodeCount = 0;
    this._extBytes = 0;

    const root = aScene.root;
    if (root != null && root.exists && root.visible) {
      this.drawEntity(root);
    }

    const debug = aScene.debugLines;
    if (debug != null) {
      this.writeDebugLines(debug.count, debug.lines, debug.colors);
    }

    const audio = aScene.audio ?? null;
    let oneShotCount = 0;
    let loopCount = 0;
    if (audio != null) {
      oneShotCount = Math.min(audio.oneShots.length, 0xffff);
      loopCount = Math.min(audio.loops.length, 0xffff);
      this.ensure(oneShotCount * 4 + loopCount * 6);
      const v = this._view;
      let p = this._pos;
      for (let i = 0; i < oneShotCount; i++) {
        const s = audio.oneShots[i]!;
        v.setUint16(p, s.soundId, true);
        v.setUint8(p + 2, s.volume);
        v.setInt8(p + 3, s.pan);
        p += 4;
      }

      for (let i = 0; i < loopCount; i++) {
        const s = audio.loops[i]!;
        v.setUint16(p, s.channelId, true);
        v.setUint16(p + 2, s.soundId, true);
        v.setUint8(p + 4, s.volume);
        v.setInt8(p + 5, s.pan);
        p += 6;
      }

      this._pos = p;
    }

    let flags = 0;
    if (aScene.paused === true) {
      flags |= FRAME_PAUSED;
    }
    if (this._sceneReset) {
      flags |= FRAME_SCENE_RESET;
    }
    if (debug != null) {
      flags |= FRAME_HAS_DEBUG;
    }

    const v = this._view;
    v.setUint8(0, MSG_FRAME);
    v.setUint32(1, aScene.tick >>> 0, true);
    v.setUint8(5, flags);
    v.setUint16(6, audio != null ? audio.musicTrack : NO_MUSIC, true);
    v.setUint8(8, audio != null ? audio.musicVol : 0);
    v.setUint8(9, audio != null ? audio.muteFlags : 0);
    v.setUint16(10, aScene.levelGroup ?? NO_LEVEL_GROUP, true);
    v.setUint16(12, Math.min(Math.max(aScene.tickCost ?? 0, 0), 0xffff), true);
    v.setUint32(14, 0, true);
    v.setUint16(18, this._nodeCount, true);
    v.setUint16(20, oneShotCount, true);
    v.setUint16(22, loopCount, true);
    v.setUint16(24, Math.min(this._extBytes, 0xffff), true);

    this._scene = null;
    return this._buffer.slice(0, this._pos);
  }

  //---------------------------------------
  // FrameSink
  //---------------------------------------

  screenX(aEntity: AntEntity, aGlobalX: number): number {
    return aGlobalX + this.camera.scroll.x * aEntity.scrollFactorX;
  }

  screenY(aEntity: AntEntity, aGlobalY: number): number {
    return aGlobalY + this.camera.scroll.y * aEntity.scrollFactorY;
  }

  node(
    aUid: number,
    aTexId: number,
    aX: number,
    aY: number,
    aRotation: number,
    aScaleX: number,
    aScaleY: number,
    aAlpha: number,
    aTint: number,
    aBlend: number,
    aTeleport: boolean,
  ): void {
    if (this._nodeCount >= MAX_NODES) {
      return;
    }

    this.ensure(NODE_BASE_SIZE + 8 + 1 + 3);
    let flags = (aBlend & 3) << NODE_BLEND_SHIFT;
    // isTeleport() also records the position for the next frame: it must run for every node
    if (this.isTeleport(aUid, aX, aY) || aTeleport) {
      flags |= NODE_TELEPORT;
    }

    const hasScale = aScaleX !== 1 || aScaleY !== 1;
    const hasAlpha = aAlpha !== 255;
    const hasTint = aTint !== 0xffffff;
    if (hasScale) {
      flags |= NODE_HAS_SCALE;
    }
    if (hasAlpha) {
      flags |= NODE_HAS_ALPHA;
    }
    if (hasTint) {
      flags |= NODE_HAS_TINT;
    }

    const v = this._view;
    let p = this._pos;
    v.setUint32(p, aUid, true);
    v.setUint16(p + 4, aTexId, true);
    v.setUint8(p + 6, flags);
    v.setFloat32(p + 7, aX, true);
    v.setFloat32(p + 11, aY, true);
    v.setFloat32(p + 15, aRotation, true);
    p += NODE_BASE_SIZE;
    if (hasScale) {
      v.setFloat32(p, aScaleX, true);
      v.setFloat32(p + 4, aScaleY, true);
      p += 8;
    }

    if (hasAlpha) {
      v.setUint8(p++, aAlpha);
    }

    if (hasTint) {
      v.setUint8(p, (aTint >> 16) & 0xff);
      v.setUint8(p + 1, (aTint >> 8) & 0xff);
      v.setUint8(p + 2, aTint & 0xff);
      p += 3;
    }

    this._pos = p;
    this._nodeCount++;
  }

  light(
    aUid: number,
    aBlend: number,
    aPoints: ArrayLike<number>,
    aPointCount: number,
    aGradCenterX: number,
    aGradCenterY: number,
    aGradRadius: number,
    aStops: ArrayLike<number>,
    aStopCount: number,
    aBlurX: number,
    aBlurY: number,
  ): void {
    if (this._nodeCount >= MAX_NODES) {
      return;
    }

    aPointCount = Math.min(aPointCount, 0xffff);
    aStopCount = Math.min(aStopCount, 0xff);
    const extSize = 1 + 2 + aPointCount * 8 + 12 + 1 + aStopCount * 5 + 8;
    this.ensure(NODE_BASE_SIZE + extSize);
    const v = this._view;
    let p = this._pos;
    // A light is rebuilt every tick and has no position of its own: no teleport bookkeeping.
    v.setUint32(p, aUid, true);
    v.setUint16(p + 4, NO_TEXTURE, true);
    v.setUint8(p + 6, ((aBlend & 3) << NODE_BLEND_SHIFT) | NODE_HAS_EXT);
    v.setFloat32(p + 7, 0, true);
    v.setFloat32(p + 11, 0, true);
    v.setFloat32(p + 15, 0, true);
    p += NODE_BASE_SIZE;

    v.setUint8(p++, EXT_LIGHT);
    v.setUint16(p, aPointCount, true);
    p += 2;
    for (let i = 0, n = aPointCount * 2; i < n; i++) {
      v.setFloat32(p, aPoints[i]!, true);
      p += 4;
    }

    v.setFloat32(p, aGradCenterX, true);
    v.setFloat32(p + 4, aGradCenterY, true);
    v.setFloat32(p + 8, aGradRadius, true);
    p += 12;
    v.setUint8(p++, aStopCount);
    for (let i = 0, n = aStopCount * 5; i < n; i++) {
      v.setUint8(p++, aStops[i]!);
    }

    v.setFloat32(p, aBlurX, true);
    v.setFloat32(p + 4, aBlurY, true);
    p += 8;

    this._extBytes += extSize;
    this._pos = p;
    this._nodeCount++;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  /** Traversal of AntEntity.draw: the entity itself, then drawChildren(). */
  private drawEntity(aEntity: AntEntity): void {
    if (isFrameWritable(aEntity)) {
      aEntity.writeFrame(this);
    } else if (aEntity instanceof AntActor) {
      this.writeActor(aEntity);
    } else if (aEntity instanceof AntTileMap) {
      this.writeTileMap(aEntity);
    }

    aEntity.justReset = false;

    const children = aEntity.children;
    if (children != null) {
      // numChildren is re-read like the original loop does
      for (let i = 0; i < aEntity.numChildren; i++) {
        const child = children[i];
        if (child != null && child.exists && child.visible) {
          this.drawEntity(child);
        }
      }
    }
  }

  private writeActor(aActor: AntActor): void {
    // AntActor.draw(): updateBounds() when there are pixels, then drawActor() (the counters).
    const meta = aActor.currentFrameMeta;
    if (meta != null) {
      aActor.updateBounds();
    }

    aActor.drawActor(this.camera);
    if (meta == null) {
      return;
    }

    let alpha = Math.round(aActor.alpha * 255);
    alpha = alpha < 0 ? 0 : alpha > 255 ? 255 : alpha;
    this.node(
      makeUid(aActor.entityId),
      meta.texId,
      this.screenX(aActor, aActor.globalX),
      this.screenY(aActor, aActor.globalY),
      Math.PI * 2 * (aActor.globalAngle / 360),
      aActor.scaleX,
      aActor.scaleY,
      alpha,
      aActor.color,
      blendCode(aActor.blend),
      aActor.justReset,
    );
  }

  private writeTileMap(aMap: AntTileMap): void {
    const symbol = aMap.symbolName;
    if (symbol == null) {
      return;
    }

    this.node(
      makeUid(aMap.entityId),
      this.resolveTexId(symbol),
      this.screenX(aMap, aMap.globalX),
      this.screenY(aMap, aMap.globalY),
      Math.PI * 2 * (aMap.globalAngle / 360),
      aMap.scaleX,
      aMap.scaleY,
      255,
      0xffffff,
      BLEND_NORMAL,
      aMap.justReset,
    );
  }

  private resolveTexId(aSymbol: string): number {
    const cached = this._texIds.get(aSymbol);
    if (cached !== undefined) {
      return cached;
    }

    const resolver = this._scene?.resolveTexId ?? null;
    let texId: number;
    if (resolver != null) {
      texId = resolver(aSymbol);
    } else {
      const registry = AssetRegistry.current;
      if (registry == null) {
        throw new Error("FrameWriter: no AssetRegistry to resolve the layer texture '" + aSymbol + "'.");
      }

      texId = (registry.getAnimation(aSymbol).frames[0] as { texId: number }).texId;
    }

    this._texIds.set(aSymbol, texId);
    return texId;
  }

  private writeDebugLines(aCount: number, aLines: ArrayLike<number>, aColors: ArrayLike<number>): void {
    if (this._nodeCount >= MAX_NODES) {
      return;
    }

    const n = Math.min(aCount, 0xffff);
    const extSize = 1 + 2 + n * 20;
    this.ensure(NODE_BASE_SIZE + extSize);
    const v = this._view;
    let p = this._pos;
    v.setUint32(p, 0, true); // uid 0: entityId starts at 1, so it never collides
    v.setUint16(p + 4, NO_TEXTURE, true);
    v.setUint8(p + 6, NODE_HAS_EXT);
    v.setFloat32(p + 7, 0, true);
    v.setFloat32(p + 11, 0, true);
    v.setFloat32(p + 15, 0, true);
    p += NODE_BASE_SIZE;
    v.setUint8(p++, EXT_DEBUG_LINES);
    v.setUint16(p, n, true);
    p += 2;
    for (let i = 0; i < n; i++) {
      v.setFloat32(p, aLines[i * 4]!, true);
      v.setFloat32(p + 4, aLines[i * 4 + 1]!, true);
      v.setFloat32(p + 8, aLines[i * 4 + 2]!, true);
      v.setFloat32(p + 12, aLines[i * 4 + 3]!, true);
      v.setUint32(p + 16, aColors[i]! >>> 0, true);
      p += 20;
    }

    this._extBytes += extSize;
    this._pos = p;
    this._nodeCount++;
  }

  /**
   * Teleport rule (docs/03 §1): the uid is new, or the node moved farther than TELEPORT_DISTANCE since the
   * previous frame, or the frame is a scene reset. Records the position for the next frame.
   * (The reset()/revive() reason is passed by the caller.)
   */
  private isTeleport(aUid: number, aX: number, aY: number): boolean {
    const cur = this._tables[this._gen & 1]!;
    const prev = this._tables[(this._gen - 1) & 1]!;
    const gen = this._gen;
    const prevGen = (gen - 1) >>> 0;

    // record for the next frame
    let slot = Math.imul(aUid, 0x9e3779b1) >>> HASH_SHIFT;
    while (cur.stamp[slot] === gen && cur.keys[slot] !== aUid) {
      slot = (slot + 1) & TABLE_MASK;
    }

    cur.stamp[slot] = gen;
    cur.keys[slot] = aUid;
    cur.xs[slot] = aX;
    cur.ys[slot] = aY;

    if (this._sceneReset) {
      return true;
    }

    slot = Math.imul(aUid, 0x9e3779b1) >>> HASH_SHIFT;
    while (prev.stamp[slot] === prevGen) {
      if (prev.keys[slot] === aUid) {
        const dx = aX - prev.xs[slot]!;
        const dy = aY - prev.ys[slot]!;
        return dx * dx + dy * dy > TELEPORT_DIST2;
      }

      slot = (slot + 1) & TABLE_MASK;
    }

    return true;
  }

  private ensure(aBytes: number): void {
    const need = this._pos + aBytes;
    if (need <= this._buffer.byteLength) {
      return;
    }

    let size = this._buffer.byteLength * 2;
    while (size < need) {
      size *= 2;
    }

    const bigger = new ArrayBuffer(size);
    new Uint8Array(bigger).set(new Uint8Array(this._buffer, 0, this._pos));
    this._buffer = bigger;
    this._view = new DataView(bigger);
  }
}
