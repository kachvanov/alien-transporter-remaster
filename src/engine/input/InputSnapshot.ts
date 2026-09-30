// Input state of one tick (docs/01-architecture.md §8). Not in the original: it replaces the Flash
// stage events (KeyboardEvent, MouseEvent, stage.mouseX/Y) that AntKeyboard/AntMouse listened to.

export interface InputSnapshot {
  /** Flash keyCodes of all keys that are held down at the moment of the snapshot. */
  keysDown: number[];
  /** Pointer position in stage coordinates (800x600), like `stage.mouseX/mouseY`. */
  mouseX: number;
  mouseY: number;
  /** Left mouse button is held down. */
  mouseDown: boolean;
  /** Sum of the mouse wheel deltas since the previous snapshot (Flash MouseEvent.delta: > 0 is up). */
  wheelDelta: number;
}

export function emptyInputSnapshot(): InputSnapshot {
  return { keysDown: [], mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
}
