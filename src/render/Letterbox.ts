// Not a port. 4:3 letterbox of the 800x600 logical stage in the window (docs/01-architecture.md §5).

export const LOGICAL_WIDTH = 800;
export const LOGICAL_HEIGHT = 600;

export interface Letterbox {
  /** Logical pixel -> CSS pixel factor. */
  scale: number;
  /** Top-left corner of the stage in CSS pixels of the window. */
  x: number;
  y: number;
  /** Size of the stage in CSS pixels (= 800 * scale, 600 * scale). */
  width: number;
  height: number;
}

/** The largest 4:3 rectangle that fits into the window, centred. */
export function computeLetterbox(winWidth: number, winHeight: number): Letterbox {
  const w = Math.max(winWidth, 1);
  const h = Math.max(winHeight, 1);
  const scale = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
  const width = LOGICAL_WIDTH * scale;
  const height = LOGICAL_HEIGHT * scale;
  return { scale, x: (w - width) / 2, y: (h - height) / 2, width, height };
}

/**
 * Window (CSS pixel) coordinates -> logical stage coordinates. Points over the black bars give values outside
 * [0, 800) x [0, 600), like `stage.mouseX/mouseY` outside the stage.
 */
export function windowToLogical(px: number, py: number, lb: Letterbox): { x: number; y: number } {
  return { x: (px - lb.x) / lb.scale, y: (py - lb.y) / lb.scale };
}
