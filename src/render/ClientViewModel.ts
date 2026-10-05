// Not a port. DEVIATION: online (card T5.1). Logic of the "view only" look of the network client: while the host is on a menu
// screen (main menu, level select, garage, between levels) the client only watches; the buttons of the host's frames are drawn
// muted and a hint says that the host decides. The game of the host does not know about it. Pure: unit-tested.
//
// "The host is on a menu" is read from the Frame header and needs no protocol change: `levelGroup` is the number of the level
// that the LevelManager of the host holds (1..20) and NO_LEVEL_GROUP when it holds none (GameLoop.renderFrame). The level is
// cleared whenever the host leaves it (GameScreen, LevelCompleteScreen, RestartLevelScreen) and is loaded before the level
// scene is built, so "no level" = menu screens, "a level" = the client can steer its ship.

import { NO_LEVEL_GROUP } from '../frame/constants';

/** The hint of the client while the host is on a menu screen (the glyphs of font01, uppercase). */
export const VIEW_ONLY_HINT = 'WAITING FOR THE HOST';

/**
 * Frames in a row without a level before the client counts as "view only". The level is cleared for a moment on a restart
 * (RestartLevelScreen -> GameScreen loads it again): a short gap must not flash the muted look.
 */
export const VIEW_ONLY_AFTER_FRAMES = 12;

/** Alpha factor and multiply tint of a muted button (the original has no disabled look: AntButton only has `enabled`). */
export const DIM_ALPHA = 0.45;
export const DIM_TINT = 0x9a9a9a;

export class ClientViewModel {
  private readonly _after: number;
  private _noLevelFrames = 0;
  private _viewOnly = false;

  constructor(aAfterFrames: number = VIEW_ONLY_AFTER_FRAMES) {
    this._after = aAfterFrames;
  }

  /** true: the host shows a menu, the client only watches. */
  get viewOnly(): boolean {
    return this._viewOnly;
  }

  /** `levelGroup` of every Frame that becomes current. A level turns the mode off at once, no level turns it on after a while. */
  push(aLevelGroup: number): void {
    if (aLevelGroup === NO_LEVEL_GROUP) {
      if (this._noLevelFrames < this._after) {
        this._noLevelFrames++;
      }
      if (this._noLevelFrames >= this._after) {
        this._viewOnly = true;
      }
    } else {
      this._noLevelFrames = 0;
      this._viewOnly = false;
    }
  }

  reset(): void {
    this._noLevelFrames = 0;
    this._viewOnly = false;
  }
}

/** The button faces of the manifest: which texIds are muted and which texId is the "up" face of a button. */
export interface ButtonFaces {
  /** 1 for the texIds of a button face (every frame of a `Btn*` symbol that has several). */
  dim: Uint8Array;
  /** The "up" face (frame 0) for the texId of any face of a 3-frame button (up, over, down), otherwise the texId itself. */
  up: Int32Array;
}

/**
 * Finds the buttons by the keys of the frames (`<symbol>#<index>`, manifest.frames): the symbols `Btn*` of the original with
 * several frames. `BtnShadow*` and `BtnStar_mc` have one frame and are not touched. A 3-frame symbol is a classic AntButton
 * (up, over, down): its over and down faces are shown as the up face, so the hover of the mouse of the host does not look like
 * an answer to a click of the client.
 */
export function buildButtonFaces(aKeys: readonly string[]): ButtonFaces {
  const dim = new Uint8Array(aKeys.length);
  const up = new Int32Array(aKeys.length);
  const bySymbol = new Map<string, number[]>();
  for (let i = 0; i < aKeys.length; i++) {
    up[i] = i;
    const key = aKeys[i] as string;
    const hash = key.lastIndexOf('#');
    if (hash <= 0 || !key.startsWith('Btn')) {
      continue;
    }
    const symbol = key.slice(0, hash);
    const index = Number(key.slice(hash + 1));
    if (!Number.isInteger(index)) {
      continue;
    }
    const list = bySymbol.get(symbol) ?? [];
    list[index] = i;
    bySymbol.set(symbol, list);
  }
  for (const list of bySymbol.values()) {
    const ids = list.filter((id) => id !== undefined);
    if (ids.length < 2) {
      continue;
    }
    for (const id of ids) {
      dim[id] = 1;
    }
    if (list.length === 3 && ids.length === 3) {
      up[list[1] as number] = list[0] as number;
      up[list[2] as number] = list[0] as number;
    }
  }
  return { dim, up };
}

/** A tint (0xRRGGBB, multiply) darkened by DIM_TINT. */
export function dimTint(aTint: number): number {
  const r = (((aTint >> 16) & 0xff) * ((DIM_TINT >> 16) & 0xff)) / 255;
  const g = (((aTint >> 8) & 0xff) * ((DIM_TINT >> 8) & 0xff)) / 255;
  const b = ((aTint & 0xff) * (DIM_TINT & 0xff)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
