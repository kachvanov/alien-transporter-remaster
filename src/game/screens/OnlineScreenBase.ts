// Not a port (T3.4, DEVIATION: online). The common part of the screens of the LAN game: the background of the main
// menu, the buttons that the original uses (round, with an icon and the shadow BtnShadowBig_mc), the captions under
// them, the lines of text of the bitmap fonts, the key Esc as "back".
//
// The original has no buttons with a text (the icon is the caption), so a button of these screens is a round button of
// the original with a Label under it (font04, the font of the captions of the original).

import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { Config } from '../Config';
import { Label } from '../fonts/Label';
import { G } from '../G';
import { BasicScreen } from './BasicScreen';
import type { Button } from './Button';

/** Colours of the text (AARRGGBB, see Label.color): the yellow of the texts of the original (TextUIView), grey, red. */
export const TEXT_COLOR = 0xffffb15e;
export const TEXT_DIM_COLOR = 0xff8f8296;
export const TEXT_ERROR_COLOR = 0xffff7a7a;
export const TEXT_WHITE = 0xffffffff;

/** The places that the three screens share (the cave of MainMenuBG_mc is empty below y = 310). */
export const BACK_X = 100;
export const ACTION_X = 700;
export const BUTTON_ROW_Y = 505;

export abstract class OnlineScreenBase extends BasicScreen {
  protected _tm: AntTaskManager;
  protected _labels: Label[] = [];

  constructor() {
    super();
    this._tm = new AntTaskManager();
  }

  override destroy(): void {
    this._tm.clear();
    for (const label of this._labels) {
      label.kill();
    }

    this._labels.length = 0;
    super.destroy();
  }

  override update(): void {
    super.update();
    if (AntG.keys.isPressed(Config.keyPause2)) {
      this.onEscape();
    }
  }

  /** Esc: the same as the button Back / Stop of the screen. */
  protected abstract onEscape(): void;

  /** The music of the menu goes on when it was not playing (as in MainMenuScreen). */
  protected playMenuMusic(): void {
    if (!G.music.isPlaying()) {
      G.music.playMenuTheme();
    }
  }

  /** A line of text. `aAlign`: 'left' (x is the left edge), 'center' (x is the middle) or 'right' (x is the right edge). */
  protected makeLabel(aX: number, aY: number, aText: string, aFont = 'font04', aAlign = 'center', aColor = TEXT_WHITE): Label {
    const label = G.gameState.layerMenu.recycle(Label) as Label;
    label.revive();
    label.align = aAlign;
    label.fontName = aFont;
    label.color = aColor;
    label.text = aText;
    label.reset(aX | 0, aY | 0);
    this._labels.push(label);
    return label;
  }

  /** Changes the text and the colour of a line (an empty text is a space: Label keeps the last text for an empty one). */
  protected setLabel(aLabel: Label, aText: string, aColor = TEXT_WHITE): void {
    aLabel.color = aColor;
    aLabel.text = aText == '' ? ' ' : aText;
  }

  /**
   * A button of the original (`aAnim`, its shadow) with the caption of it. It is made by the task manager at its turn
   * (the buttons of the original appear one after another, 0.15 s apart). The caption is under the button, or, for the
   * buttons of the bottom row (`aBelow` false), beside it on the side of the middle of the screen: the vignette of the
   * screen (ScreenFade_mc) covers the corners, a caption under them would be cut.
   */
  protected addButton(
    aX: number,
    aY: number,
    aAnim: string,
    aCaption: string,
    aCallback: (aButton: AntButton) => void,
    aSelected = false,
    aBelow = true,
  ): void {
    this._tm.addInstantTask(this.onMakeButton, [aX, aY, aAnim, 'BtnShadowBig_mc', aCallback, aSelected]);
    if (aBelow) {
      this._tm.addInstantTask(this.onMakeCaption, [aX, aY + 56, aCaption, 'center']);
    } else if (aX < 400) {
      this._tm.addInstantTask(this.onMakeCaption, [aX + 60, aY - 13, aCaption, 'left']);
    } else {
      this._tm.addInstantTask(this.onMakeCaption, [aX - 60, aY - 13, aCaption, 'right']);
    }

    this._tm.addPause(0.15);
  }

  private onMakeCaption = (aX: number, aY: number, aCaption: string, aAlign: string): Label =>
    this.makeLabel(aX, aY, aCaption, 'font04', aAlign);

  /** The buttons that were made (for the tests). */
  get buttons(): readonly Button[] {
    return this._buttons;
  }
}
