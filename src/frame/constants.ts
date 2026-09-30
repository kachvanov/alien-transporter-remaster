// Not a port. Constants of the Frame format: docs/03-frame-and-network-protocol.md §1.

/** First byte of a Frame message. */
export const MSG_FRAME = 0x01;
/** First byte of a client Input message (docs/03 §4). */
export const MSG_INPUT = 0x02;

/** Size of the Frame header in bytes. */
export const HEADER_SIZE = 26;

/** Header `flags`. */
export const FRAME_PAUSED = 1 << 0;
/** All nodes teleport (screen or level change). */
export const FRAME_SCENE_RESET = 1 << 1;
/** The frame carries a DEBUG_LINES ext node (dev only). */
export const FRAME_HAS_DEBUG = 1 << 2;

/** Header `muteFlags`. */
export const MUTE_MUSIC = 1 << 0;
export const MUTE_SOUNDS = 1 << 1;

/** Header `musicTrack` / `levelGroup`: nothing. */
export const NO_MUSIC = 0xffff;
export const NO_LEVEL_GROUP = 0xffff;

/** Node `texId` of a node without a texture (ext only). */
export const NO_TEXTURE = 0xffff;

/** Node `flags`. */
export const NODE_TELEPORT = 1 << 0;
export const NODE_HAS_SCALE = 1 << 1;
export const NODE_HAS_ALPHA = 1 << 2;
export const NODE_HAS_TINT = 1 << 3;
/** bits 4-5: blend mode (BLEND_*). */
export const NODE_BLEND_SHIFT = 4;
export const NODE_BLEND_MASK = 0x3 << NODE_BLEND_SHIFT;
export const NODE_HAS_EXT = 1 << 6;

export const BLEND_NORMAL = 0;
export const BLEND_ADD = 1;
export const BLEND_OVERLAY = 2;
export const BLEND_SCREEN = 3;

/** Ext block types (first byte of an ext block). */
export const EXT_LIGHT = 0x01;
export const EXT_DEBUG_LINES = 0x02;

/** nodeCount is a u16: the writer drops nodes over this limit. */
export const MAX_NODES = 65535;

/** A node that moved farther than this (screen px) since the previous frame teleports. */
export const TELEPORT_DISTANCE = 200;

/** Sizes in bytes. */
export const NODE_BASE_SIZE = 19; // uid 4 + texId 2 + flags 1 + x, y, rotation 12
export const ONE_SHOT_SIZE = 4; // u16 soundId, u8 volume, i8 pan
export const LOOP_SIZE = 6; // u16 channelId, u16 soundId, u8 volume, i8 pan
