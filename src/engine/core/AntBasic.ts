// Port of ru/antkarlov/anthill/AntBasic.as

import type { AntCamera } from './AntCamera';

/** Largest entityId: the id is a u24 (docs/03-frame-and-network-protocol.md, uid = entityId << 8 | subIndex). */
const MAX_ENTITY_ID = 0xffffff;

export class AntBasic {
  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  static NUM_OF_ACTIVE = 0; // int
  static NUM_OF_VISIBLE = 0; // int
  static NUM_ON_SCREEN = 0; // int
  static BUFFERS_SIZE = 0; // int

  /** Next entityId to hand out (not in the original, see the constructor). */
  private static _nextEntityId = 1;

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  tag = 0; // int
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userData: any = null;
  exists = false;
  active = false;
  visible = false;
  alive = false;
  cameras: AntCamera[] | null = null;
  allowDebugDraw = false;

  /**
   * Not in the original: stable id of the entity for the Frame uid (docs/01-architecture.md §4).
   * Monotonic u24 counter, wraps to 1 (0 is never used).
   */
  readonly entityId: number;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this.entityId = AntBasic._nextEntityId;
    AntBasic._nextEntityId = AntBasic._nextEntityId >= MAX_ENTITY_ID ? 1 : AntBasic._nextEntityId + 1;

    this.tag = -1;
    this.userData = null;
    this.exists = true;
    this.active = true;
    this.visible = true;
    this.alive = true;
    this.allowDebugDraw = true;
  }

  /** Restarts the entityId counter (new game / replay start: ids have to be reproducible). */
  static resetEntityIds(): void {
    AntBasic._nextEntityId = 1;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {}

  preUpdate(): void {
    ++AntBasic.NUM_OF_ACTIVE;
  }

  update(): void {}

  postUpdate(): void {}

  /**
   * In the original this draws into the camera buffer. There is no drawing here (the FrameWriter
   * serialises the tree); the traversal and the side effects of the overrides are kept.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(_aCamera: AntCamera): void {}

  kill(): void {
    this.exists = false;
    this.alive = false;
  }

  revive(): void {
    this.exists = true;
    this.alive = true;
  }
}
