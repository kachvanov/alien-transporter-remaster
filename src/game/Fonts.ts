// Port of ru/alientransporter/Fonts.as
//
// DEVIATION: the original keeps the embedded classes Fonts_ImgFontNN / Fonts_XmlFontNN (a bitmap and its
// XML atlas); here they are the names of the same assets (image "ImgFont01", data "XmlFont01"), the
// pairs in the same order. The Font class is a stub until T1.9e (STUB(T1.9e), see fonts/Font.ts).

import { Font } from './fonts/Font';

export class Fonts {
  private static readonly ImgFont01 = 'ImgFont01';
  private static readonly XmlFont01 = 'XmlFont01';
  private static readonly ImgFont02 = 'ImgFont02';
  private static readonly XmlFont02 = 'XmlFont02';
  private static readonly ImgFont03 = 'ImgFont03';
  private static readonly XmlFont03 = 'XmlFont03';
  private static readonly ImgFont04 = 'ImgFont04';
  private static readonly XmlFont04 = 'XmlFont04';
  private static readonly ImgFont04Green = 'ImgFont04Green';
  private static readonly XmlFont04Green = 'XmlFont04Green';
  private static readonly ImgFont04Red = 'ImgFont04Red';
  private static readonly XmlFont04Red = 'XmlFont04Red';
  private static readonly ImgFont04Blue = 'ImgFont04Blue';
  private static readonly XmlFont04Blue = 'XmlFont04Blue';
  private static readonly ImgFont04Purple = 'ImgFont04Purple';
  private static readonly XmlFont04Purple = 'XmlFont04Purple';
  private static readonly ImgFont04Pink = 'ImgFont04Pink';
  private static readonly XmlFont04Pink = 'XmlFont04Pink';
  private static readonly ImgFont05 = 'ImgFont05';
  private static readonly XmlFont05 = 'XmlFont05';

  constructor() {
    // super();
  }

  static init(): void {
    const images: string[] = [
      Fonts.ImgFont01,
      Fonts.ImgFont02,
      Fonts.ImgFont03,
      Fonts.ImgFont04,
      Fonts.ImgFont04Green,
      Fonts.ImgFont04Red,
      Fonts.ImgFont04Blue,
      Fonts.ImgFont04Purple,
      Fonts.ImgFont04Pink,
      Fonts.ImgFont05,
    ];
    const datas: string[] = [
      Fonts.XmlFont01,
      Fonts.XmlFont02,
      Fonts.XmlFont03,
      Fonts.XmlFont04,
      Fonts.XmlFont04Green,
      Fonts.XmlFont04Red,
      Fonts.XmlFont04Blue,
      Fonts.XmlFont04Purple,
      Fonts.XmlFont04Pink,
      Fonts.XmlFont05,
    ];
    let i = 0; // :int
    while (i < images.length) {
      const font = new Font(images[i]!, datas[i]!);
      Font.toCache(font);
      i++;
    }
  }
}
