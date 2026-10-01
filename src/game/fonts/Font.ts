// Port of ru/alientransporter/fonts/Font.as
//
// DEVIATION (docs/04 §4, BitmapData is not ported): the font bitmap and the glyph bitmaps (`fontBitmap`,
// `frames`, `copyBitmap(s)`) do not exist. The renderer draws the glyphs from the atlas, so a glyph is
// `{width, height, texId}`: its size (the region of the XML) and the frame `Font:<name>#<charCode>` of the
// manifest (appended by the `fontglyphs` extraction step). `regions`, `points`, `chars` and the order of
// the chars are as in the original.
//
// DEVIATION: the XML (`new XML(...)`, `parseAtlasXML`) is assets/data/fonts/<name>.json of the data step
// (the same attributes); the constructor takes the names of the embedded classes of Fonts.as
// (`ImgFont04Blue`, `XmlFont04Blue`) and finds the font `font04Blue` by the name of the data class.

import { AssetRegistry } from '../../engine/assets/AssetRegistry';
import type { FontData } from '../../engine/assets/schemas';
import { AntPoint } from '../../engine/utils/AntPoint';
import { AntRect } from '../../engine/utils/AntRect';
import { AntStorage } from '../../engine/utils/AntStorage';

/** One glyph: the `BitmapData` of `frames` in the original. */
export interface FontGlyph {
  /** The region of the glyph in the font bitmap: `width`/`height` of the bitmap of the original. */
  width: number;
  height: number;
  /** Frame `Font:<font>#<charCode>` of the manifest (index in manifest.frames). */
  texId: number;
}

export class Font {
  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  protected static _fontCache: AntStorage<Font> = new AntStorage<Font>();

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  name: string;
  charInterval = 0; // int
  /** Char name -> region in the font bitmap (`Rectangle`). */
  regions: Record<string, AntRect>;
  /** Char name -> offset (`Point`). */
  points: Record<string, AntPoint>;
  chars: string[];
  /** Glyph of `chars[i]` (`frames` of the original). */
  frames: FontGlyph[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  /**
   * AS3 `Font(aImageClass:Class, aXmlClass:Class)`. `aImage` is the name of the image class (`ImgFont01`) and
   * `aData` that of the XML class (`XmlFont01`); the font data is `assets/data/fonts/font01.json`.
   */
  constructor(aImage: string, aData: string) {
    // super();
    this.regions = {};
    this.points = {};
    this.chars = [];
    this.frames = [];
    void aImage; // `fontBitmap = new aImage().bitmapData`: the bitmap is `Font:<name>#0` of the manifest
    const fileName = 'font' + aData.replace(/^Xml[Ff]ont/, '');
    const registry = AssetRegistry.current;
    if (registry == null) {
      throw new Error("(Font): no AssetRegistry to read the font '" + fileName + "'.");
    }

    this.name = fileName;
    this.parseAtlasXML(registry.getFont(fileName) as unknown as FontData);
    this.copyBitmaps(this.frames);
  }

  //---------------------------------------
  // CLASS METHODS
  //---------------------------------------

  static toCache(aFont: Font, aName: string | null = null): Font {
    Font._fontCache.set(aName == null ? aFont.name : aName, aFont);
    return aFont;
  }

  static fromCache(aName: string): Font {
    if (!Font._fontCache.containsKey(aName)) {
      throw new Error("(Font): Missing font '" + aName + "'.");
    }

    return Font._fontCache.get(aName) as Font;
  }

  static removeFromCache(aName: string): void {
    if (Font._fontCache.containsKey(aName)) {
      (Font._fontCache.get(aName) as Font).destroy();
      Font._fontCache.remove(aName);
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {}

  /** AS3 `parseAtlasXML(aXml:XML)`: the same data as the JSON of the data step (`name`, `charInterval`, `chars`). */
  parseAtlasXML(aData: FontData): void {
    this.name = aData.name;
    this.charInterval = aData.charInterval | 0; // parseFloat(...) into an int field
    for (const c of aData.chars) {
      const offsetX = c.offsetX === undefined ? NaN : c.offsetX;
      const offsetY = c.offsetY === undefined ? NaN : c.offsetY;
      const region = new AntRect(c.x, c.y, c.w, c.h);
      const point = new AntPoint(isNaN(offsetX) ? 0 : offsetX, isNaN(offsetY) ? 0 : offsetY);
      this.regions[c.name] = region;
      this.points[c.name] = point;
      this.chars.push(c.name);
    }
  }

  getPoint(aChar: string, aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (Object.prototype.hasOwnProperty.call(this.points, aChar)) {
      aResult.x = (this.points[aChar] as AntPoint).x;
      aResult.y = (this.points[aChar] as AntPoint).y;
    } else {
      aResult.x = 0;
      aResult.y = 0;
    }

    return aResult;
  }

  getFrame(aChar: string): FontGlyph | null {
    const index = this.chars.indexOf(aChar) | 0;
    if (index >= 0 && index < this.chars.length) {
      return this.frames[index] ?? null;
    }

    return null;
  }

  /** AS3 `getFrames(aText, aResult)`: a glyph per char of the text; null for a char that the font does not have. */
  getFrames(aText: string, aResult: (FontGlyph | null)[] | null = null): (FontGlyph | null)[] {
    if (aResult == null) {
      aResult = [];
    }

    let i = 0; // :int
    const n = aText.length | 0; // :int
    while (i < n) {
      const char = aText.charAt(i++);
      aResult.push(this.getFrame(char));
    }

    return aResult;
  }

  /** AS3 `copyBitmap(aChar)`: the glyph of the region of the char (null when the font has no such region). */
  copyBitmap(aChar: string): FontGlyph | null {
    if (!Object.prototype.hasOwnProperty.call(this.regions, aChar)) {
      return null;
    }

    const region = this.regions[aChar] as AntRect;
    const registry = AssetRegistry.current as AssetRegistry;
    const texId = registry.glyphTexId(this.name, aChar.charCodeAt(0));
    if (texId === undefined) {
      throw new Error(
        "(Font): the manifest has no glyph frame for '" + aChar + "' of the font '" + this.name + "' (run `npm run extract`).",
      );
    }

    return { width: region.width, height: region.height, texId };
  }

  copyBitmaps(aResult: FontGlyph[] | null = null): FontGlyph[] {
    if (aResult == null) {
      aResult = [];
    }

    const n = this.chars.length | 0; // :int
    let i = 0; // :int
    while (i < n) {
      aResult.push(this.copyBitmap(this.chars[i] as string) as FontGlyph);
      i++;
    }

    return aResult;
  }

  clearCache(): void {
    for (const key of Font._fontCache.getAllKeys()) {
      const font = Font._fontCache.get(key);
      if (font != null) {
        Font._fontCache.remove(key);
        font.destroy();
      }
    }
  }
}
