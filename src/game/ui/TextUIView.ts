// Port of ru/alientransporter/ui/TextUIView.as
//
// The lines are AntLabel (the TextField "system" of the original, a bitmap font here, see fonts/AntLabel.ts).
// DEVIATION: a word that is wider than `_maxWidth` on an empty line makes the loop of the original run for ever
// (the word is taken off, a new empty line is added, the same word is tried again); with the bitmap font the
// widths differ from the TextField ones, so such a word is put on the line as it is.

import { AntEntity } from '../../engine/core/AntEntity';
import { AntLabel } from '../fonts/AntLabel';

export class TextUIView extends AntEntity {
  static readonly className = 'TextUIView';

  private _lines: (AntLabel | null)[];
  private _text: string;
  private _maxWidth: number; // int
  private _lineInterval: number; // int
  private _textColor: number; // uint
  private _highlightText: string;
  private _size: number; // int

  constructor() {
    super();
    this._lines = [];
    this._text = '';
    this._maxWidth = 150;
    this._lineInterval = 10;
    this._textColor = 16757086;
    this._highlightText = '';
    this._size = 8;
  }

  override kill(): void {
    super.kill();
    this.clear();
  }

  private updateVisual(): void {
    let line: AntLabel | null = null;
    this.clear();
    const words = this._text.split(' ');
    let wordIndex = 0; // :int
    while (wordIndex < words.length) {
      line = line == null ? this.addLine() : line;
      const previousText = line.text;
      line.text += words[wordIndex] as string;
      if (line.width > this._maxWidth && previousText != '') {
        line.text = previousText;
        line = this.addLine();
      } else {
        line.text += ' ';
        wordIndex++;
      }
    }

    let i = 0; // :int
    while (i < this._lines.length) {
      line = this._lines[i++] as AntLabel;
      line.reset(-line.width * 0.5, i * this._lineInterval);
    }
  }

  private addLine(): AntLabel {
    const line = new AntLabel('system', this._size, this._textColor);
    line.align = 'center';
    line.setStroke(4281212206);
    this._lines.push(line);
    this.add(line);
    return line;
  }

  private clear(): void {
    let i = 0; // :int
    const n = this._lines.length | 0; // :int
    while (i < n) {
      (this._lines[i] as AntLabel).destroy();
      this._lines[i++] = null;
    }

    this._lines.length = 0;
  }

  get text(): string {
    return this._text;
  }
  set text(value: string) {
    this._text = value;
    this.updateVisual();
  }

  /** The getter of the original returns the text, not the highlighted part. */
  get highlightText(): string {
    return this._text;
  }
  set highlightText(value: string) {
    this._highlightText = value;
    let i = 0; // :int
    const n = this._lines.length | 0; // :int
    while (i < n) {
      (this._lines[i++] as AntLabel).highlightText(this._highlightText, 16273231);
    }
  }

  get textHeight(): number {
    return (this._lineInterval * this._lines.length) | 0;
  }

  get textColor(): number {
    return this._textColor;
  }
  set textColor(value: number) {
    this._textColor = value >>> 0;
    this.updateVisual();
  }

  get size(): number {
    return this._size;
  }
  set size(value: number) {
    this._size = value | 0;
    this.updateVisual();
  }
}
