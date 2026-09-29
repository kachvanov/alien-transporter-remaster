// Port of ru/antkarlov/anthill/utils/AntColor.as

export class AntColor {
  //---------------------------------------
  // CLASS CONSTANTS (uint)
  //---------------------------------------

  static readonly WHITE = 0xffffff;
  static readonly SILVER = 0xc0c0c0;
  static readonly GRAY = 0x808080;
  static readonly BLACK = 0x000000;
  static readonly RED = 0xff0000;
  static readonly MAROON = 0x800000;
  static readonly YELLOW = 0xffff00;
  static readonly OLIVE = 0x808000;
  static readonly LIME = 0x00ff00;
  static readonly GREEN = 0x008000;
  static readonly AQUA = 0x00ffff;
  static readonly TEAL = 0x008080;
  static readonly BLUE = 0x0000ff;
  static readonly NAVY = 0x000080;
  static readonly FUCHSIA = 0xff00ff;
  static readonly PURPLE = 0x800080;

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  static extractAlpha(aColor: number): number {
    aColor = aColor >>> 0; // aColor:uint
    return ((aColor >> 24) & 0xff) | 0; // :int
  }

  static extractRed(aColor: number): number {
    aColor = aColor >>> 0; // aColor:uint
    return ((aColor >> 16) & 0xff) | 0; // :int
  }

  static extractGreen(aColor: number): number {
    aColor = aColor >>> 0; // aColor:uint
    return ((aColor >> 8) & 0xff) | 0; // :int
  }

  static extractBlue(aColor: number): number {
    aColor = aColor >>> 0; // aColor:uint
    return (aColor & 0xff) | 0; // :int
  }

  static combineRGB(aRed: number, aGreen: number, aBlue: number): number {
    aRed = aRed | 0; // :int
    aGreen = aGreen | 0; // :int
    aBlue = aBlue | 0; // :int
    return ((aRed << 16) | (aGreen << 8) | aBlue) >>> 0; // :uint
  }

  static combineARGB(aAlpha: number, aRed: number, aGreen: number, aBlue: number): number {
    aAlpha = aAlpha | 0; // :int
    aRed = aRed | 0; // :int
    aGreen = aGreen | 0; // :int
    aBlue = aBlue | 0; // :int
    return ((aAlpha << 24) | (aRed << 16) | (aGreen << 8) | aBlue) >>> 0; // :uint
  }
}
