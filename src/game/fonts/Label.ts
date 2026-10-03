// Port of ru/alientransporter/fonts/Label.as
//
// DEVIATION (docs/04 §4, BitmapData is not ported): the label keeps no bitmap. `_buffer`/`_colorBuffer`
// are the size of the buffer (`_bufferWidth/_bufferHeight`, `_hasBuffer`) and the glyphs that were copied
// into it (`_bufferGlyphs`: glyph and its x), and `calcText/drawText/calcColor/calcAlpha/calcHighlights`
// keep the logic of the original (when the buffer is made, cleared and filled, which glyphs, the width and
// the height of the entity, the alignment) without touching pixels. The pixels are made by the renderer:
//  - the colour of the label (`_color`, which replaces the white pixels of the bitmap) is the tint of the glyph
//    nodes (the font bitmaps are white glyphs with a dark outline, a multiply is the same picture);
//  - the alpha of the label (`_colorTransform.alphaMultiplier`) is the alpha of the nodes;
//  - `highlight(text, color)` (the pixels equal to `_color` in the columns of the text) is the tint of the
//    glyphs of the text (DEVIATION: whole glyphs, the original includes the first column of the next glyph).
// `draw()` (updateBounds + drawLabel) is `writeFrame(sink)`: the FrameWriter calls it at the point where
// AntEntity.draw would draw the entity itself, before its children; the nodes are the glyphs, uid =
// entityId << 8 | index of the glyph.
//
// DEVIATION: a char that the font does not have gives a null glyph in the original, and `_loc3_.width` of
// calcText throws a TypeError. Here such a glyph is skipped (no width, nothing drawn).
//
// Kept on purpose: with an empty text the old buffer is not cleared, the label keeps showing its last text.

import { AntBasic } from '../../engine/core/AntBasic';
import { AntEntity } from '../../engine/core/AntEntity';
import { blendCode, makeUid } from '../../frame/FrameWriter';
import type { FrameSink, IFrameWritable } from '../../frame/types';
import { Font } from './Font';
import type { FontGlyph } from './Font';

/** A glyph that was copied into the buffer: where and in which colour. */
interface BufferGlyph {
  glyph: FontGlyph;
  /** x in the buffer. */
  x: number;
  /** null: the colour of the label. */
  tint: number | null;
}

export class Label extends AntEntity implements IFrameWritable {
  static readonly className: string = 'Label';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly ALIGN_LEFT = 'left';
  static readonly ALIGN_CENTER = 'center';
  static readonly ALIGN_RIGHT = 'right';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  blend: string | null;
  smoothing: boolean;
  quickDraw: boolean;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _text: string;
  protected _oldText: string;
  protected _font: Font | null = null;
  protected _color: number; // uint
  protected _textColor: number; // uint
  protected _alpha: number;
  /** `_buffer != null`. */
  protected _hasBuffer = false;
  /** `_buffer.width` / `_buffer.height` (BitmapData sizes are ints). */
  protected _bufferWidth = 0; // int
  protected _bufferHeight = 0; // int
  /** What `drawText` copied into the buffer since it was last cleared. */
  protected _bufferGlyphs: BufferGlyph[];
  protected _frames: (FontGlyph | null)[];
  protected _align: string;
  protected _highlightText: string[];
  protected _highlightColor: number[]; // uint
  /** `_colorTransform != null`. */
  protected _hasColorTransform = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.blend = null;
    this.smoothing = true;
    this.quickDraw = true;
    this._text = '';
    this._oldText = '';
    this._color = 4294967295;
    this._textColor = 16777215;
    this._alpha = 1;
    this._frames = [];
    this._bufferGlyphs = [];
    this._align = Label.ALIGN_LEFT;
    this._highlightText = [];
    this._highlightColor = [];
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override update(): void {
    super.update();
  }

  /**
   * `draw(aCamera)` of the original without the drawing: `updateBounds(); drawLabel(aCamera);` (the
   * `super.draw` of the original draws the children, the FrameWriter does that after this call). The glyphs
   * are not culled by the screen (the FrameWriter does not cull anything).
   */
  writeFrame(aSink: FrameSink): void {
    this.updateBounds();
    this.drawLabel(aSink);
  }

  drawLabel(aSink: FrameSink): void {
    ++AntBasic.NUM_OF_VISIBLE;
    if (!this._hasBuffer) {
      return;
    }

    ++AntBasic.NUM_ON_SCREEN;
    const screenX = aSink.screenX(this, this.globalX);
    const screenY = aSink.screenY(this, this.globalY);
    const angle = Math.PI * 2 * (this.globalAngle / 360);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const alpha = Math.max(0, Math.min(255, Math.round(this._alpha * 255)));
    // The colour of the label replaces the white pixels (`calcColor`): 0xFFFFFFFF (the default) and white leave them.
    const labelTint = this._color & 0xffffff;
    const mode = blendCode(this.blend);
    // matrix of the original: translate(origin), scale, rotate, translate(screen): the pixel p of the buffer
    // lands at screen + R * S * (origin + p).
    let i = 0;
    const n = this._bufferGlyphs.length;
    while (i < n) {
      const item = this._bufferGlyphs[i] as BufferGlyph;
      const lx = (this.origin.x + item.x) * this.scaleX;
      const ly = this.origin.y * this.scaleY;
      aSink.node(
        makeUid(this.entityId, i),
        item.glyph.texId,
        screenX + lx * cos - ly * sin,
        screenY + lx * sin + ly * cos,
        angle,
        this.scaleX,
        this.scaleY,
        alpha,
        item.tint != null ? item.tint : labelTint,
        mode,
        this.justReset,
      );
      i++;
    }
  }

  highlightText(aText: string, aColor: number): void {
    this._highlightText.push(aText);
    this._highlightColor.push(aColor >>> 0);
    this.calcFrame();
  }

  resetHighlight(): void {
    this._highlightText.length = 0;
    this._highlightColor.length = 0;
    this.calcFrame();
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected calcFrame(): void {
    if (this._font != null) {
      this.calcText();
      this.updateAlign();
      this.drawText();
      this.calcColor();
      this.calcHighlights();
      this.calcAlpha();
    }
  }

  protected calcText(): void {
    const font = this._font as Font;
    if (this._oldText != this._text) {
      this._frames.length = 0;
      font.getFrames(this._text, this._frames);
      this.width = 0;
      this.height = -2147483648; // int.MIN_VALUE
      let i = 0; // :int
      const n = this._frames.length | 0; // :int
      while (i < n) {
        const glyph = this._frames[i++];
        if (glyph == null) {
          continue; // DEVIATION: the original dereferences the null glyph and throws
        }

        this.width += glyph.width;
        this.height = glyph.height > this.height ? glyph.height : this.height;
      }

      this.width += font.charInterval * (this._frames.length - 1);
      this._oldText = this._text;
    }

    if (this._text != null && this._text != '') {
      if (!this._hasBuffer || this._bufferWidth != this.width || this._bufferHeight != this.height) {
        // new BitmapData(width, height, true, 16777215): the old one is disposed (an invalid size throws in
        // the original; here the buffer is just not made)
        this._hasBuffer = this.width >= 1 && this.height >= 1;
        this._bufferWidth = this._hasBuffer ? this.width | 0 : 0;
        this._bufferHeight = this._hasBuffer ? this.height | 0 : 0;
        // `_alpha = 1; this.alpha = old`: the same alpha again
      }

      // new buffer or fillRect: the buffer is empty
      this._bufferGlyphs.length = 0;
    }
  }

  protected calcHighlights(): void {
    const n = this._highlightText.length | 0; // :int
    let i = 0; // :int
    while (i < n) {
      this.highlight(this._highlightText[i] as string, this._highlightColor[i] as number);
      i++;
    }
  }

  protected highlight(aText: string, aColor: number): void {
    const index = this._text.indexOf(aText) | 0; // :int
    if (index == -1) {
      return;
    }

    // The pixels that have the colour of the label (`getPixel(x, y) == _color`, 24 bits) get the new colour.
    if (this._color > 0xffffff) {
      return;
    }

    const end = (index + aText.length) | 0; // :int
    let i = 0; // :int
    const n = this._bufferGlyphs.length | 0; // :int
    while (i < n) {
      if (i >= index && i < end) {
        (this._bufferGlyphs[i] as BufferGlyph).tint = aColor & 0xffffff;
      }

      i++;
    }
  }

  protected drawText(): void {
    let x = 0;
    let i = 0; // :int
    const n = this._frames.length | 0; // :int
    while (i < n) {
      const glyph = this._frames[i++];
      if (glyph == null) {
        continue; // DEVIATION: see the header
      }

      this._bufferGlyphs.push({ glyph, x, tint: null });
      x += glyph.width + (this._font as Font).charInterval;
    }
  }

  protected calcColor(): void {
    // The white pixels of the buffer take `_color`: the tint of the nodes, see writeFrame().
  }

  protected updateAlign(): void {
    if (this._text != '' && this._text != null) {
      if (!this._hasBuffer) {
        return; // the original dereferences the missing buffer (the font was not set yet)
      }

      switch (this._align) {
        case Label.ALIGN_LEFT:
          this.origin.x = 0;
          break;
        case Label.ALIGN_CENTER:
          this.origin.x = -this._bufferWidth * 0.5;
          break;
        case Label.ALIGN_RIGHT:
          this.origin.x = -this._bufferWidth;
      }
    }
  }

  protected calcAlpha(): void {
    // `_colorBuffer` is the buffer with the colour transform of the alpha: the alpha of the nodes.
  }

  //---------------------------------------
  // PROPERTIES
  //---------------------------------------

  get text(): string {
    return this._text;
  }
  set text(value: string) {
    this._text = value;
    this.calcFrame();
  }

  get color(): number {
    return this._color;
  }
  set color(value: number) {
    this._color = value >>> 0;
    this.calcFrame();
  }

  get alpha(): number {
    return this._alpha;
  }
  set alpha(value: number) {
    value = value > 1 ? 1 : value < 0 ? 0 : value;
    if (this._alpha != value) {
      this._alpha = value;
      this._hasColorTransform = this._alpha != 1 || this._textColor != 16777215;
      this.calcFrame();
    }
  }

  get font(): Font | null {
    return this._font;
  }
  set font(value: Font | null) {
    this._font = value;
    this.calcFrame();
  }

  get fontName(): string {
    return (this._font as Font).name;
  }
  set fontName(value: string) {
    this._font = Font.fromCache(value);
    this.calcFrame();
  }

  get align(): string {
    return this._align;
  }
  set align(value: string) {
    this._align = value;
    this.updateAlign();
  }

  /** `buffer != null` of the original: the size of the bitmap that the label shows (0 when it has none). */
  get bufferWidth(): number {
    return this._bufferWidth;
  }
  get bufferHeight(): number {
    return this._bufferHeight;
  }
}
