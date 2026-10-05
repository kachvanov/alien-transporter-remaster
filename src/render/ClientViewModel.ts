// Not a port. DEVIATION: online (card T5.1). Logic of the "view only" look of the network client: while the host is on a menu
// screen (main menu, level select, garage, between levels) the client only watches; the buttons of the host's frames are drawn
// muted and a hint says that the host decides. The game of the host does not know about it. Pure: unit-tested.
//
// "The host is on a menu" is read from the Frame header and needs no protocol change: `levelGroup` is the number of the level
// that the LevelManager of the host holds (1..20) and NO_LEVEL_GROUP when it holds none (GameLoop.renderFrame). The level is
// cleared whenever the host leaves it (GameScreen, LevelCompleteScreen, RestartLevelScreen) and is loaded before the level
// scene is built, so "no level" = menu screens, "a level" = the client can steer its ship.
//
// FIX-7: the host's pause popup (Resume / Restart / Main menu, the Effects and Quality switches) is the second "the host decides"
// state. It is read from the header too, from the `paused` flag (FRAME_PAUSED, bit0; GameLoop: `G.physics != null && G.gamePause`,
// which the original sets exactly while the pause popup is up: GameScreen.onClickPause / onTakeFocus -> showPausePopup, and
// clears when it closes), so the protocol does not change. Unlike the menu mode it has no debounce: both edges are immediate.
//
// FIX-9: the game over popup (Main menu / Restart, GameScreen.showGameOverPopup, shown by UISystem.onGameOver when the last
// life is lost) is the third state. The original does NOT raise `G.gamePause` for it (the world keeps running behind the fade;
// GameScreen.onGameOverClickToMenu / ...Restart only clear it) and the level stays loaded, so neither header field sees it. It
// is read from the nodes of the frame instead, with no protocol change: the title of the popup (the clip `GameOverTextEN_mc`,
// Text 'GameOverText_visual') is drawn only by GameOverPopupView. (The background `GameOverPopupBG_mc` is shared with the
// ConfirmPopupView of the level select menu, so it is not a mark.) The node is in the frame from the `show()` of the popup (it
// slides in from below the screen) until its `kill()` at the end of the slide out, so both edges follow the frames at once.

import { FRAME_PAUSED, NO_LEVEL_GROUP } from '../frame/constants';

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
  private _hostPaused = false;
  private _hostGameOver = false;

  constructor(aAfterFrames: number = VIEW_ONLY_AFTER_FRAMES) {
    this._after = aAfterFrames;
  }

  /** true: the host shows a menu, the client only watches. */
  get viewOnly(): boolean {
    return this._viewOnly;
  }

  /** true: the host's pause popup is open (the `paused` flag of the frame header). */
  get hostPaused(): boolean {
    return this._hostPaused;
  }

  /** true: the host's game over popup is on the screen (its title is among the nodes of the frame). */
  get hostGameOver(): boolean {
    return this._hostGameOver;
  }

  /** true: the client cannot press what it sees (a host menu, the host's pause or game over popup): muted buttons and the hint. */
  get dim(): boolean {
    return this._viewOnly || this._hostPaused || this._hostGameOver;
  }

  /**
   * `levelGroup` and the header `flags` of every Frame that becomes current. A level turns the menu mode off at once, no level
   * turns it on after a while; the pause flag and the game over popup (FIX-9) follow the frame as they are.
   */
  push(aLevelGroup: number, aFlags = 0, aGameOverPopup = false): void {
    this._hostPaused = (aFlags & FRAME_PAUSED) !== 0;
    this._hostGameOver = aGameOverPopup;
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
    this._hostPaused = false;
    this._hostGameOver = false;
  }
}

/**
 * FIX-9: the texIds that only the game over popup draws: the frames of the title clip `GameOverText*_mc` (one per language of
 * the texts; the keys of manifest.frames are `<symbol>#<index>`). 1 for such a texId, 0 for the others.
 */
export function buildGameOverMarks(aKeys: readonly string[]): Uint8Array {
  const marks = new Uint8Array(aKeys.length);
  for (let i = 0; i < aKeys.length; i++) {
    if (/^GameOverText[A-Za-z]*_mc#\d+$/.test(aKeys[i] as string)) {
      marks[i] = 1;
    }
  }
  return marks;
}

/** FIX-9: true when a node of the frame is the title of the game over popup (`marks` of buildGameOverMarks). */
export function frameHasGameOverPopup(aNodes: ArrayLike<{ texId: number }>, aMarks: Uint8Array): boolean {
  for (let i = 0; i < aNodes.length; i++) {
    if (aMarks[(aNodes[i] as { texId: number }).texId] === 1) {
      return true;
    }
  }
  return false;
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
