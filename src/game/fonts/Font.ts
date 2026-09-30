// STUB(T1.9e): stand-in for ru/alientransporter/fonts/Font.as.
// T1.9e ports the real class (glyph regions from assets/data/fonts/*.json) and replaces this file.
// Declared: the constructor shape used by Fonts.init() and the font cache of the original.

import { AntStorage } from '../../engine/utils/AntStorage';

export class Font {
  protected static _fontCache: AntStorage<Font> = new AntStorage<Font>();

  name: string;
  charInterval = 0; // int

  /** AS3 `Font(aImageClass:Class, aXmlClass:Class)`; here the names of the image and of the XML (data) asset. */
  constructor(aImage: string, aData: string) {
    this.name = aImage + '/' + aData;
  }

  static toCache(aFont: Font, aName: string | null = null): Font {
    Font._fontCache.set(aName == null ? aFont.name : aName, aFont);
    return aFont;
  }

  static fromCache(aName: string): Font | null {
    return Font._fontCache.get(aName) ?? null;
  }
}
