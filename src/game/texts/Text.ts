// Port of ru/alientransporter/texts/Text.as
//
// DEVIATION: `loadText(XmlTextEN)` reads the embedded XML class; here the same XML is assets/data/texts.json
// of the data step (`{lang, SubText: [{id, value}]}`), taken from AssetRegistry.current. `loadXML(XML)` takes that
// object. A game without texts.json (a test that did not load it) gets an empty table: extract() then returns
// the "%id%" placeholder of the original for every id.
//
// The `*_visual` texts hold the name of a clip with the image of the text (`PauseTextEN_mc`), the others are
// the text itself.

import { AssetRegistry } from '../../engine/assets/AssetRegistry';
import type { TextsData } from '../../engine/assets/schemas';

export class Text {
  static lang: string | null = null;

  private static _data: Record<string, string> = {};

  static init(): void {
    Text._data = {};
    Text.loadText();
  }

  /** AS3 `loadText(aClass:Class)`: the embedded XmlTextEN, here the texts.json of the registry. */
  static loadText(): void {
    const registry = AssetRegistry.current;
    if (registry == null) {
      return;
    }

    let texts: TextsData;
    try {
      texts = registry.getTexts() as unknown as TextsData;
    } catch {
      return; // texts.json is not loaded: see the header
    }

    Text.loadXML(texts);
  }

  /** AS3 `loadXML(aXml:XML)`. */
  static loadXML(aXml: TextsData): void {
    Text.lang = aXml.lang;
    for (const subText of aXml.SubText) {
      Text._data[subText.id] = subText.value;
    }
  }

  static extract(aId: string): string {
    return Object.prototype.hasOwnProperty.call(Text._data, aId) ? (Text._data[aId] as string) : '%' + aId + '%';
  }
}
