// Port of ru/antkarlov/anthill/AntLabel.as
//
// DEVIATION (docs/04 §4: AntLabel is a TextField and "is not used in the game"; four ui views do use it:
// LevelStatsColumn, LevelStatsGoalView, MissionPopupView, TextUIView): the original draws a TextField with the
// embedded font "system" (the TTF "iFlash 706", 8 px, which the extraction does not export) into a BitmapData.
// Here the text is drawn by the glyphs of a bitmap font of the game, like Label: size < 16 -> `font03` (10 px),
// size >= 16 -> `font02` (13 px). So the widths and heights differ from the TextField ones (no 2 px gutter
// of the TextField, no "system" metrics); the API of the original is kept.
//  - `setStroke()` / `applyFilters()` (GlowFilter) do nothing: the glyphs of the bitmap fonts have their outline.
//  - `align` is only stored: the TextField is `autoSize = LEFT`, it is as wide as its text, so the alignment
//    does not move a single line (Label.align would move the origin).
//  - `bold`, `wordWrap`, `autoSize`, `setSize()` are stored (a single line is drawn).
//  - An empty text clears the label (a TextField shows nothing), unlike Label, which keeps the last buffer.

import { Label } from './Label';

export class AntLabel extends Label {
  static override readonly className: string = 'AntLabel';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly LEFT = 'left';
  static readonly RIGHT = 'right';
  static readonly CENTER = 'center';
  static readonly JUSTIFY = 'justify';

  /** `new TextField().width` / `.height` before any text. */
  private static readonly DEFAULT_SIZE = 100;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _antAlign: string;
  protected _autoSize: boolean;
  protected _bold = false;
  protected _wordWrap = false;
  protected _fontFamily: string;
  protected _size: number; // int
  protected _textColor24: number; // uint

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  /** AS3 `AntLabel(aFont:String, aSize:int = 8, aColor:uint = 0xFFFFFF, aEmbedFonts:Boolean = true)`. */
  constructor(aFont: string, aSize = 8, aColor = 16777215, aEmbedFonts = true) {
    super();
    void aEmbedFonts;
    this._fontFamily = aFont;
    this._size = aSize | 0;
    this._textColor24 = aColor >>> 0;
    this._autoSize = true;
    this.width = AntLabel.DEFAULT_SIZE;
    this.height = AntLabel.DEFAULT_SIZE;
    this._antAlign = AntLabel.LEFT;
    // `Label.fontName` / `Label.color` make the glyph list: the font of the size, the colour of the format.
    this.fontName = this._size >= 16 ? 'font02' : 'font03';
    this.color = aColor;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** AS3 `setColor(aColor, aBeginIndex = -1, aEndIndex = -1)`: the format of the text (or of a range of it). */
  setColor(aColor: number, aBeginIndex = -1, aEndIndex = -1): void {
    aBeginIndex = aBeginIndex | 0;
    aEndIndex = aEndIndex | 0;
    if (aBeginIndex < 0 && aEndIndex < 0) {
      this.color = aColor;
      return;
    }

    // setTextFormat(format, begin, end): the glyphs [begin, end) take the colour.
    const glyphs = this._bufferGlyphs;
    const end = aEndIndex < 0 ? glyphs.length : Math.min(aEndIndex, glyphs.length);
    for (let i = Math.max(aBeginIndex, 0); i < end; i++) {
      glyphs[i]!.tint = aColor & 0xffffff;
    }
  }

  setSize(aWidth: number, aHeight: number): void {
    this.width = aWidth | 0;
    this.height = aHeight | 0;
  }

  /** `applyFilters([GlowFilter])`: see the header. */
  applyFilters(_aFilters: unknown[]): void {
    void _aFilters;
  }

  /** `setStroke(aColor:uint = 0xFF000000)`: see the header. */
  setStroke(_aColor = 4278190080): void {
    void _aColor;
  }

  beginChange(): void {}

  endChange(): void {}

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get bold(): boolean {
    return this._bold;
  }
  set bold(value: boolean) {
    this._bold = value;
  }

  override get text(): string {
    return this._text;
  }
  override set text(value: string) {
    if (this._text != value) {
      if (value == '') {
        // a TextField without text: nothing is drawn, the field is as wide as its gutter
        this._text = '';
        this._oldText = '';
        this._frames.length = 0;
        this._bufferGlyphs.length = 0;
        this.width = 0;
      } else {
        super.text = value;
      }
    }
  }

  get autoSize(): boolean {
    return this._autoSize;
  }
  set autoSize(value: boolean) {
    this._autoSize = value;
  }

  get wordWrap(): boolean {
    return this._wordWrap;
  }
  set wordWrap(value: boolean) {
    this._wordWrap = value;
  }

  override get align(): string {
    return this._antAlign;
  }
  override set align(value: string) {
    this._antAlign = value;
  }

  override get color(): number {
    return this._textColor24;
  }
  override set color(value: number) {
    value = (value & 16777215) >>> 0;
    this._textColor24 = value;
    super.color = value;
  }

  get numChars(): number {
    return this._text.length | 0;
  }

  get numLines(): number {
    return 1;
  }

  get memSize(): number {
    return 0;
  }
}
