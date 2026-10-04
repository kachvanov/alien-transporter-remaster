// Not a port. Decoded Frame (docs/03-frame-and-network-protocol.md §1) and the input of the FrameWriter.

import type { AntCamera } from '../engine/core/AntCamera';
import type { AntEntity } from '../engine/core/AntEntity';

/** Ext block of a node: a light (AntLight). Coordinates are screen coordinates (800x600). */
export interface LightExt {
  kind: 0x01;
  /** x0, y0, x1, y1, ...; the first point is the centre of the source. */
  points: Float32Array;
  gradCenterX: number;
  gradCenterY: number;
  gradRadius: number;
  /** ratio, r, g, b, a for every gradient stop (5 bytes per stop). */
  stops: Uint8Array;
  blurX: number;
  blurY: number;
}

/** Ext block of a node: Box2D debug lines (dev only). */
export interface DebugLinesExt {
  kind: 0x02;
  /** x1, y1, x2, y2 for every line. */
  lines: Float32Array;
  /** 0xRRGGBBAA of every line. */
  colors: Uint32Array;
}

export type NodeExt = LightExt | DebugLinesExt;

export interface NodeData {
  uid: number;
  texId: number;
  flags: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** 0..255 */
  alpha: number;
  /** 0xRRGGBB (multiply). */
  tint: number;
  ext?: NodeExt;
}

export interface OneShotData {
  soundId: number;
  /** 0..255 */
  volume: number;
  /** -127..127 (-1..1) */
  pan: number;
}

export interface LoopData {
  channelId: number;
  soundId: number;
  /** 0..255 */
  volume: number;
  /** -127..127 (-1..1) */
  pan: number;
}

export interface FrameData {
  tick: number;
  flags: number;
  musicTrack: number;
  musicVol: number;
  muteFlags: number;
  levelGroup: number;
  tickCost: number;
  nodes: NodeData[];
  oneShots: OneShotData[];
  loops: LoopData[];
}

//---------------------------------------
// FrameWriter input
//---------------------------------------

/** Sound events of one tick (the simulation of AntSoundManager / MusicManager fills them in). */
export interface FrameAudio {
  musicTrack: number;
  /** 0..255 */
  musicVol: number;
  /** MUTE_* bits */
  muteFlags: number;
  oneShots: readonly OneShotData[];
  loops: readonly LoopData[];
}

/** Box2D debug draw of the tick. `lines` holds 4 numbers per line, `colors` one 0xRRGGBBAA per line. */
export interface FrameDebugLines {
  count: number;
  lines: ArrayLike<number>;
  colors: ArrayLike<number>;
}

/** Everything the FrameWriter serialises at the render point of a tick. */
export interface FrameScene {
  /** Root of the drawn tree (`state.defGroup`). */
  root: AntEntity | null;
  camera: AntCamera;
  tick: number;
  paused?: boolean;
  /** Screen or level change: every node of this frame teleports. */
  sceneReset?: boolean;
  /** 1..20, or NO_LEVEL_GROUP. */
  levelGroup?: number;
  /** Duration of the last tick in hundredths of ms. */
  tickCost?: number;
  audio?: FrameAudio | null;
  debugLines?: FrameDebugLines | null;
  /** texId of the first frame of a symbol (AntTileMap layers); default: AssetRegistry.current. */
  resolveTexId?: ((symbolName: string) => number) | null;
}

/**
 * Where an entity that draws in its own way (Label glyphs, AntLight, ...) puts its nodes. Implemented by
 * the FrameWriter. All coordinates are screen coordinates: use `screenX/screenY`.
 */
export interface FrameSink {
  readonly camera: AntCamera;
  /** `global + scroll * scrollFactor` (AntEntity.toScreenPosition). */
  screenX(entity: AntEntity, globalX: number): number;
  screenY(entity: AntEntity, globalY: number): number;
  /**
   * One sprite node. `alpha` 0..255, `tint` 0xRRGGBB (0xFFFFFF = none), `blend` 0..3. `teleport`: the entity
   * was reset()/revive()d; the writer adds the other teleport reasons itself.
   */
  node(
    uid: number,
    texId: number,
    x: number,
    y: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
    alpha: number,
    tint: number,
    blend: number,
    teleport: boolean,
  ): void;
  /**
   * A light node (ext LIGHT). `points`: 2 numbers per point (screen coordinates), `stops`: 5 numbers
   * (ratio, r, g, b, a: 0..255) per gradient stop.
   */
  light(
    uid: number,
    blend: number,
    points: ArrayLike<number>,
    pointCount: number,
    gradCenterX: number,
    gradCenterY: number,
    gradRadius: number,
    stops: ArrayLike<number>,
    stopCount: number,
    blurX: number,
    blurY: number,
  ): void;
}

/**
 * Implemented by entities that draw in their own way. The FrameWriter calls it instead of the default
 * self-drawing (AntActor frame / AntTileMap layer) at the point where AntEntity.draw would draw the entity
 * itself, i.e. before its children. It must also do the side effects of the draw() override of the original.
 */
export interface IFrameWritable {
  writeFrame(sink: FrameSink): void;
  /**
   * true: `writeFrame` draws the children itself (AntLightEnvironment draws them into its own buffer, not into
   * the picture), so the FrameWriter must not walk them.
   */
  readonly writesOwnChildren?: boolean;
}

export function isFrameWritable(e: unknown): e is IFrameWritable {
  return typeof (e as { writeFrame?: unknown }).writeFrame === 'function';
}
