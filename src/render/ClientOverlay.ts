// Not a port. DEVIATION: the overlay of the network client (card T3.3). Drawn by the renderer over the frames of the host
// (the host's game does not know about it): "Disconnect? Yes / No" on Esc, and the message that ends a session
// ("Connection lost", "Different game version on host and client", ...) with OK. Style and drawing as in
// RemasterSettingsOverlay: the glyphs of the bitmap font of the game and flat rectangles. Logic: ClientOverlayModel.ts.

import { Container, Sprite, Texture } from 'pixi.js';
import type { AssetSource } from '../engine/assets/AssetSource';
import { FontSchema } from '../engine/assets/schemas';
import type { FontData, Manifest } from '../engine/assets/schemas';
import type { AtlasLoader } from './AtlasLoader';
import type { ClientOverlayModel, ClientOverlayResult } from './ClientOverlayModel';
import { windowToLogical } from './Letterbox';
import type { Letterbox } from './Letterbox';

const PANEL = { x: 200, y: 215, w: 400, h: 170 };
const BUTTON_W = 120;
const BUTTON_H = 40;
const BUTTON_Y = PANEL.y + PANEL.h - 30 - BUTTON_H;

const COLOR_TEXT = 0xffffff;
const COLOR_SELECTED = 0xffd23c;
const COLOR_HINT = 0xc8d8e8;
const HINT_Y = 575;
const HINT_H = 31;

interface GlyphFont {
  name: string;
  charInterval: number;
  widths: Map<string, number>;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
}

export interface ClientOverlayOptions {
  /** The stage of the Pixi application: the overlay is its last child. */
  stage: Container;
  atlas: AtlasLoader;
  manifest: Manifest;
  /** Where `data/fonts/<name>.json` comes from. */
  assets: AssetSource;
  model: ClientOverlayModel;
  /** A button was clicked (the result of the model). */
  onResult: (aResult: ClientOverlayResult) => void;
}

export class ClientOverlay {
  private readonly _opts: ClientOverlayOptions;
  private readonly _view = new Container();
  private readonly _content = new Container();
  // The hint "WAITING FOR THE HOST" (T5.1): below the overlay of the dialog, which covers it.
  private readonly _hintView = new Container();
  private readonly _hintContent = new Container();
  private _hint: string | null = null;
  private _hintDrawn: string | null = '';
  private readonly _texIds = new Map<string, number>();
  private readonly _fonts = new Map<string, GlyphFont>();
  private _hits: Hit[] = [];
  private _hover = -1;
  private _pressed = -1;
  private _drawn = '';
  private _incomplete = false;
  private _incompleteHint = false;
  private _target: Container;
  private _letterbox: Letterbox | null = null;

  private constructor(aOpts: ClientOverlayOptions) {
    this._opts = aOpts;
    this._target = this._content;
    const frames = aOpts.manifest.frames as unknown as readonly { key: string }[];
    for (let i = 0; i < frames.length; i++) this._texIds.set((frames[i] as { key: string }).key, i);
    this._view.visible = false;
    this._view.addChild(this._content);
    this._hintView.visible = false;
    this._hintView.addChild(this._hintContent);
    aOpts.stage.addChild(this._hintView);
    aOpts.stage.addChild(this._view);
  }

  static async create(aOpts: ClientOverlayOptions): Promise<ClientOverlay> {
    const overlay = new ClientOverlay(aOpts);
    const data: FontData = FontSchema.parse(JSON.parse(await aOpts.assets.readText('data/fonts/font01.json')));
    const widths = new Map<string, number>();
    for (const c of data.chars) widths.set(c.name, c.w);
    overlay._fonts.set('font01', { name: 'font01', charInterval: data.charInterval, widths });
    return overlay;
  }

  pointerMove(aClientX: number, aClientY: number): void {
    const hit = this.hitAt(aClientX, aClientY);
    const index = hit !== null ? hit.index : -1;
    if (index !== this._hover) {
      this._hover = index;
      this._drawn = '';
    }
  }

  pointerDown(aClientX: number, aClientY: number): void {
    const hit = this.hitAt(aClientX, aClientY);
    this._pressed = hit !== null ? hit.index : -1;
    this._drawn = '';
  }

  pointerUp(aClientX: number, aClientY: number): void {
    const hit = this.hitAt(aClientX, aClientY);
    const pressed = this._pressed;
    this._pressed = -1;
    this._drawn = '';
    if (hit !== null && hit.index === pressed) {
      const result = this._opts.model.choose(hit.index);
      if (result !== 'none') this._opts.onResult(result);
    }
  }

  /** The hint of the view-only mode (T5.1): a text, or null for none. Drawn by the next `update`. */
  setHint(aText: string | null): void {
    this._hint = aText;
  }

  get hint(): string | null {
    return this._hint;
  }

  /** Once per displayed frame: places the overlay in the letterbox and redraws it when something changed. */
  update(aLetterbox: Letterbox): void {
    this.updateHint(aLetterbox);
    const model = this._opts.model;
    this._view.visible = model.isOpen;
    if (!model.isOpen) return;
    this._letterbox = aLetterbox;
    this._view.scale.set(aLetterbox.scale);
    this._view.position.set(aLetterbox.x, aLetterbox.y);
    const state = model.version + '|' + this._hover + '|' + this._pressed;
    if (state !== this._drawn || this._incomplete) {
      this._drawn = state;
      this.redraw();
    }
  }

  private updateHint(aLetterbox: Letterbox): void {
    this._hintView.visible = this._hint !== null;
    if (this._hint === null) {
      this._hintDrawn = '';
      return;
    }
    this._letterbox = aLetterbox;
    this._hintView.scale.set(aLetterbox.scale);
    this._hintView.position.set(aLetterbox.x, aLetterbox.y);
    if (this._hint !== this._hintDrawn || this._incompleteHint) {
      this._hintDrawn = this._hint;
      this.redrawHint(this._hint);
    }
  }

  private redrawHint(aText: string): void {
    for (const child of this._hintContent.removeChildren()) child.destroy();
    const dialogIncomplete = this._incomplete; // (the flag is shared with the glyph drawing of the dialog)
    this._incomplete = false;
    this._target = this._hintContent;
    this.rect(0, HINT_Y - 6, 800, HINT_H, 0x000000, 0.6);
    this.text(aText, 400, HINT_Y, COLOR_HINT);
    this._target = this._content;
    this._incompleteHint = this._incomplete; // (a glyph was not loaded: the hint is drawn again at the next update)
    this._incomplete = dialogIncomplete;
  }

  private redraw(): void {
    for (const child of this._content.removeChildren()) child.destroy();
    this._hits = [];
    this._incomplete = false;
    const model = this._opts.model;

    this.rect(0, 0, 800, 600, 0x000000, 0.55);
    this.rect(PANEL.x - 3, PANEL.y - 3, PANEL.w + 6, PANEL.h + 6, 0x5f86a8, 1);
    this.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x0b1622, 0.96);
    this.text(model.text, 400, PANEL.y + 34, COLOR_TEXT);

    if (model.mode === 'confirm') {
      this.button(0, 'Yes', 400 - BUTTON_W - 12, model.selected === 0);
      this.button(1, 'No', 400 + 12, model.selected === 1);
    } else {
      this.button(0, 'OK', 400 - BUTTON_W / 2, true);
    }
  }

  private button(aIndex: number, aLabel: string, aX: number, aSelected: boolean): void {
    this._hits.push({ x: aX, y: BUTTON_Y, w: BUTTON_W, h: BUTTON_H, index: aIndex });
    const down = this._pressed === aIndex;
    const over = this._hover === aIndex;
    this.rect(aX - 2, BUTTON_Y - 2, BUTTON_W + 4, BUTTON_H + 4, aSelected ? COLOR_SELECTED : 0x5f86a8, 1);
    this.rect(aX, BUTTON_Y, BUTTON_W, BUTTON_H, down ? 0x2c557c : over ? 0x1d3a56 : 0x112a40, 1);
    this.text(aLabel, aX + BUTTON_W / 2, BUTTON_Y + 8, aSelected ? COLOR_SELECTED : COLOR_TEXT);
  }

  private rect(aX: number, aY: number, aW: number, aH: number, aColor: number, aAlpha: number): void {
    const s = new Sprite(Texture.WHITE);
    s.position.set(aX, aY);
    s.setSize(aW, aH);
    s.tint = aColor;
    s.alpha = aAlpha;
    this._target.addChild(s);
  }

  /** The text in glyphs of font01, centred at `aCx`; `aY` is the top. */
  private text(aText: string, aCx: number, aY: number, aTint: number): void {
    const font = this._fonts.get('font01');
    if (font === undefined) return;
    let width = 0;
    for (const ch of aText) width += (font.widths.get(ch) ?? 0) + font.charInterval;
    width -= font.charInterval;
    let x = Math.round(aCx - width / 2);
    for (const ch of aText) {
      const w = font.widths.get(ch);
      if (w === undefined) continue;
      this.frame('Font:' + font.name + '#' + ch.charCodeAt(0), x, aY, aTint);
      x += w + font.charInterval;
    }
  }

  private frame(aKey: string, aX: number, aY: number, aTint: number): void {
    const texId = this._texIds.get(aKey);
    const sf = texId !== undefined ? this._opts.atlas.getFrame(texId) : null;
    if (sf === null) {
      this._incomplete = true; // the atlas page is not loaded yet: drawn again at the next update
      return;
    }
    const s = new Sprite(sf.texture);
    s.anchor.set(sf.anchorX, sf.anchorY);
    s.scale.set(sf.baseScale);
    s.position.set(aX, aY);
    s.tint = aTint;
    this._target.addChild(s);
  }

  private hitAt(aClientX: number, aClientY: number): Hit | null {
    const lb = this._letterbox;
    if (lb === null) return null;
    const p = windowToLogical(aClientX, aClientY, lb);
    for (const h of this._hits) {
      if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) return h;
    }
    return null;
  }

  destroy(): void {
    this._view.destroy({ children: true });
  }
}
