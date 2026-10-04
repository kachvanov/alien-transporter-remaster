// Not a port. DEVIATION: remaster settings (card T2.8): the F2 overlay. The original has no place for these settings, so
// the renderer draws a panel over the game (not through the simulation; the keys do not go to the game while it is open)
// in the style of the game UI: the glyphs of its bitmap fonts (`Font:fontNN#<charCode>` frames of the atlas) and the
// buttons BtnBasic_mc. The logic (rows, keys, port editing) is RemasterSettingsModel.ts.

import { Container, Sprite, Texture } from 'pixi.js';
import type { AssetSource } from '../engine/assets/AssetSource';
import { FontSchema } from '../engine/assets/schemas';
import type { FontData, Manifest } from '../engine/assets/schemas';
import type { AtlasLoader } from './AtlasLoader';
import { windowToLogical } from './Letterbox';
import type { Letterbox } from './Letterbox';
import type { SettingsMenuModel } from './RemasterSettingsModel';

/** Panel in the logical stage (800x600). */
const PANEL = { x: 80, y: 90, w: 640, h: 420 };
const ROW_TOP = 200;
const ROW_STEP = 62;
const LABEL_X = 112;
const VALUE_X = 560;
const ARROW_DX = 90;
const BUTTON = 26;

const COLOR_TEXT = 0xffffff;
const COLOR_SELECTED = 0xffd23c;
const COLOR_NOTE = 0xa8b8c8;

/** A bitmap font of the game as the overlay needs it: advance widths and the frames of the glyphs. */
interface GlyphFont {
  name: string;
  charInterval: number;
  widths: Map<string, number>;
}

type HitAction = { kind: 'row'; index: number } | { kind: 'arrow'; index: number; dir: -1 | 1 } | { kind: 'close' };

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  action: HitAction;
}

export interface OverlayOptions {
  /** The stage of the Pixi application: the overlay is its last child. */
  stage: Container;
  atlas: AtlasLoader;
  manifest: Manifest;
  /** Where `data/fonts/<name>.json` comes from. */
  assets: AssetSource;
  model: SettingsMenuModel;
  /** The panel asks to be closed (Esc, F2, the close button). */
  onClose: () => void;
}

function hitKey(a: HitAction): string {
  return a.kind === 'row' ? 'row' + a.index : a.kind === 'arrow' ? 'arrow' + a.index + ':' + a.dir : 'close';
}

export class RemasterSettingsOverlay {
  private readonly _opts: OverlayOptions;
  private readonly _view = new Container();
  private readonly _content = new Container();
  private readonly _texIds = new Map<string, number>();
  private readonly _fonts = new Map<string, GlyphFont>();
  private _hits: Hit[] = [];
  private _hover: string | null = null;
  private _pressed: string | null = null;
  private _drawnVersion = -1;
  private _drawnState = '';
  private _incomplete = false;
  private _letterbox: Letterbox | null = null;
  private _open = false;

  private constructor(aOpts: OverlayOptions) {
    this._opts = aOpts;
    const frames = aOpts.manifest.frames as unknown as readonly { key: string }[];
    for (let i = 0; i < frames.length; i++) this._texIds.set((frames[i] as { key: string }).key, i);
    this._view.visible = false;
    this._view.addChild(this._content);
    aOpts.stage.addChild(this._view);
  }

  /** Reads the two fonts of the panel (font01 for the text, font02 for the small lines). */
  static async create(aOpts: OverlayOptions): Promise<RemasterSettingsOverlay> {
    const overlay = new RemasterSettingsOverlay(aOpts);
    for (const name of ['font01', 'font02']) {
      const data: FontData = FontSchema.parse(JSON.parse(await aOpts.assets.readText('data/fonts/' + name + '.json')));
      const widths = new Map<string, number>();
      for (const c of data.chars) widths.set(c.name, c.w);
      overlay._fonts.set(name, { name, charInterval: data.charInterval, widths });
    }
    return overlay;
  }

  get isOpen(): boolean {
    return this._open;
  }

  open(): void {
    this._open = true;
    this._view.visible = true;
    this._hover = null;
    this._pressed = null;
    this._drawnVersion = -1;
  }

  close(): void {
    this._open = false;
    this._view.visible = false;
  }

  //---------------------------------------
  // INPUT (called by the app while the panel is open; the coordinates are those of the window)
  //---------------------------------------

  /** A key while the panel is open. Returns true: the key was consumed (always, the game gets none of them). */
  key(aCode: string, aKey: string, aShift: boolean): boolean {
    if (this._opts.model.handleKey(aCode, aKey, aShift) === 'close') this._opts.onClose();
    return true;
  }

  pointerMove(aClientX: number, aClientY: number): void {
    const hit = this.hitAt(aClientX, aClientY);
    const key = hit !== null ? hitKey(hit.action) : null;
    if (key !== this._hover) {
      this._hover = key;
      this._drawnVersion = -1;
    }
  }

  pointerDown(aClientX: number, aClientY: number): void {
    const hit = this.hitAt(aClientX, aClientY);
    this._pressed = hit !== null ? hitKey(hit.action) : null;
    this._drawnVersion = -1;
  }

  pointerUp(aClientX: number, aClientY: number): void {
    const hit = this.hitAt(aClientX, aClientY);
    const pressed = this._pressed;
    this._pressed = null;
    this._drawnVersion = -1;
    if (hit === null || pressed !== hitKey(hit.action)) return;
    const model = this._opts.model;
    const a = hit.action;
    if (a.kind === 'close') {
      this._opts.onClose();
    } else if (a.kind === 'row') {
      model.select(a.index);
    } else {
      model.select(a.index);
      model.change(a.index, a.dir);
    }
  }

  //---------------------------------------
  // DRAWING
  //---------------------------------------

  /** Once per displayed frame while the panel is open: places it in the letterbox and redraws it when something changed. */
  update(aLetterbox: Letterbox): void {
    if (!this._open) return;
    this._letterbox = aLetterbox;
    this._view.scale.set(aLetterbox.scale);
    this._view.position.set(aLetterbox.x, aLetterbox.y);
    const model = this._opts.model;
    const state = this._hover + '|' + this._pressed + '|' + model.selected;
    if (model.version !== this._drawnVersion || state !== this._drawnState || this._incomplete) {
      this._drawnVersion = model.version;
      this._drawnState = state;
      this.redraw();
    }
  }

  private redraw(): void {
    for (const child of this._content.removeChildren()) child.destroy();
    this._hits = [];
    this._incomplete = false;
    const model = this._opts.model;

    // dim the game, the panel with a frame
    this.rect(0, 0, 800, 600, 0x000000, 0.55);
    this.rect(PANEL.x - 3, PANEL.y - 3, PANEL.w + 6, PANEL.h + 6, 0x5f86a8, 1);
    this.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 0x0b1622, 0.96);

    this.text('font01', 'REMASTER SETTINGS', 400, PANEL.y + 22, COLOR_TEXT, 'center');
    this.text('font02', 'Not in the original game', 400, PANEL.y + 56, COLOR_NOTE, 'center');
    this.button(PANEL.x + PANEL.w - 30, PANEL.y + 30, 'x', { kind: 'close' });

    const rows = model.rows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const cy = ROW_TOP + i * ROW_STEP;
      const selected = i === model.selected;
      const color = selected ? COLOR_SELECTED : COLOR_TEXT;
      this.hit(PANEL.x + 10, cy - 28, PANEL.w - 20, 56, { kind: 'row', index: i });
      if (selected) this.rect(PANEL.x + 10, cy - 28, PANEL.w - 20, 56, 0x1d3a56, 0.9);
      this.text('font01', row.label, LABEL_X, cy - 18, color, 'left');
      if (row.note !== '') this.text('font02', row.note, LABEL_X, cy + 10, COLOR_NOTE, 'left');
      this.button(VALUE_X - ARROW_DX, cy, '<', { kind: 'arrow', index: i, dir: -1 });
      this.button(VALUE_X + ARROW_DX, cy, '>', { kind: 'arrow', index: i, dir: 1 });
      this.text('font01', row.value, VALUE_X, cy - 12, color, 'center');
    }

    this.text('font02', 'Up/Down: select    Left/Right: change    Esc or F2: close', 400, PANEL.y + PANEL.h - 36, COLOR_NOTE, 'center');
  }

  /** A filled rectangle (a white pixel, stretched). */
  private rect(aX: number, aY: number, aW: number, aH: number, aColor: number, aAlpha: number): void {
    const s = new Sprite(Texture.WHITE);
    s.position.set(aX, aY);
    s.setSize(aW, aH);
    s.tint = aColor;
    s.alpha = aAlpha;
    this._content.addChild(s);
  }

  private hit(aX: number, aY: number, aW: number, aH: number, aAction: HitAction): void {
    this._hits.push({ x: aX, y: aY, w: aW, h: aH, action: aAction });
  }

  /** BtnBasic_mc (frames: up, over, down) with a glyph on it. */
  private button(aCx: number, aCy: number, aGlyph: string, aAction: HitAction): void {
    const key = hitKey(aAction);
    const state = this._pressed === key ? 2 : this._hover === key ? 1 : 0;
    this.hit(aCx - BUTTON / 2, aCy - BUTTON / 2, BUTTON, BUTTON, aAction);
    this.frame('BtnBasic_mc#' + state, aCx, aCy, COLOR_TEXT);
    this.text('font01', aGlyph, aCx, aCy - 12, COLOR_TEXT, 'center');
  }

  /** A frame of the atlas by its manifest key, placed by its own origin at (aX, aY). */
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
    this._content.addChild(s);
  }

  /** The text in glyphs of a bitmap font: `aX` is the left edge, the centre or the right edge, `aY` the top. */
  private text(aFont: string, aText: string, aX: number, aY: number, aTint: number, aAlign: 'left' | 'center' | 'right'): void {
    const font = this._fonts.get(aFont);
    if (font === undefined) return;
    let width = 0;
    for (const ch of aText) width += (font.widths.get(ch) ?? 0) + font.charInterval;
    width -= font.charInterval;
    let x = aAlign === 'left' ? aX : aAlign === 'center' ? aX - width / 2 : aX - width;
    x = Math.round(x);
    for (const ch of aText) {
      const w = font.widths.get(ch);
      if (w === undefined) continue; // a char the font does not have
      this.glyphFrame(font, ch, x, aY, aTint);
      x += w + font.charInterval;
    }
  }

  private glyphFrame(aFont: GlyphFont, aChar: string, aX: number, aY: number, aTint: number): void {
    // (the origin of a glyph frame is its top-left corner, so the frame is placed by its corner)
    this.frame('Font:' + aFont.name + '#' + aChar.charCodeAt(0), aX, aY, aTint);
  }

  private hitAt(aClientX: number, aClientY: number): Hit | null {
    const lb = this._letterbox;
    if (lb === null) return null;
    const p = windowToLogical(aClientX, aClientY, lb);
    // the buttons first (they lie over the rows)
    for (let i = this._hits.length - 1; i >= 0; i--) {
      const h = this._hits[i]!;
      if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) return h;
    }
    return null;
  }

  destroy(): void {
    this._view.destroy({ children: true });
  }
}
