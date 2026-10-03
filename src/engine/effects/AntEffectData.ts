// Port of ru/antkarlov/anthill/extensions/effects/AntEffectData.as
//
// DEVIATION: `export()` (XML of the effect editor) is not ported.

import type { AntEffectProperty } from './AntEffectProperty';

export class AntEffectData {
  private _name: string | null;
  private _properties: (AntEffectProperty | null)[] | null;
  private _numProperties: number; // int

  constructor(aName: string) {
    // super();
    this._name = aName;
    this._properties = [];
    this._numProperties = 0;
  }

  destroy(): void {
    const properties = this._properties as (AntEffectProperty | null)[];
    let i = 0;
    const n = properties.length | 0;
    while (i < n) {
      (properties[i] as AntEffectProperty).destroy();
      properties[i++] = null;
    }

    properties.length = 0;
    this._properties = null;
    this._numProperties = 0;
    this._name = null;
  }

  addProperty(aProperty: AntEffectProperty): void {
    (this._properties as (AntEffectProperty | null)[]).push(aProperty);
    ++this._numProperties;
  }

  getProperty(aName: string): AntEffectProperty | null {
    let i = 0;
    while (i < this._numProperties) {
      const property = (this._properties as AntEffectProperty[])[i++] as AntEffectProperty;
      if (property.name == aName) {
        return property;
      }
    }

    return null;
  }

  getPropertyAt(aIndex: number): AntEffectProperty | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._numProperties
      ? ((this._properties as AntEffectProperty[])[aIndex] as AntEffectProperty)
      : null;
  }

  get numProperties(): number {
    return this._numProperties;
  }

  get name(): string {
    return this._name as string;
  }
}
