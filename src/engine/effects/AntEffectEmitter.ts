// Port of ru/antkarlov/anthill/extensions/effects/AntEffectEmitter.as

import { AntEntity } from '../core/AntEntity';
import { AntG } from '../core/AntG';
import type { AntEffectData } from './AntEffectData';
import { AntEffectManager } from './AntEffectManager';
import { AntEffectParticle } from './AntEffectParticle';
import type { AntEffectProperty } from './AntEffectProperty';

export class AntEffectEmitter extends AntEntity {
  name: string | null = null;
  target: AntEntity | null = null;

  private _properties: (AntEffectProperty | null)[];
  private _numProperties: number; // int
  private _explosionInterval: number;

  constructor() {
    super();
    this._properties = [];
    this._numProperties = 0;
    this._explosionInterval = 0;
  }

  applyData(aData: AntEffectData): void {
    this.removeAllProperties();
    let i = 0;
    while (i < aData.numProperties) {
      this.addProperty((aData.getPropertyAt(i++) as AntEffectProperty).clone());
    }
  }

  override kill(): void {
    this.target = null;
    super.kill();
  }

  override destroy(): void {
    super.destroy();
    this.removeAllProperties();
  }

  clone(): AntEffectEmitter {
    const emitter = new AntEffectEmitter();
    let i = 0;
    while (i < this._numProperties) {
      emitter.addProperty((this._properties[i++] as AntEffectProperty).clone());
    }

    return emitter;
  }

  override update(): void {
    let property: AntEffectProperty;
    let allExploded: boolean;
    let i = 0;
    let needSort = false;
    if (this._explosionInterval <= 0) {
      while (i < this._numProperties) {
        property = this._properties[i++] as AntEffectProperty;
        if (property.newParticleIsReady()) {
          this.makeParticles(property);
          property.explode();
          if (property.enableSorting) {
            needSort = true;
          }
        }
      }

      if (needSort) {
        (this.parent as AntEntity).sort('z');
      }

      i = 0;
      allExploded = true;
      while (i < this._numProperties) {
        if (!(this._properties[i++] as AntEffectProperty).isExploded) {
          allExploded = false;
          break;
        }
      }

      if (allExploded) {
        if (AntEffectManager.EDITOR_MODE) {
          this.resetExplosion();
        } else {
          this.kill();
        }
      }
    } else {
      this._explosionInterval -= 2 * AntG.elapsed;
    }

    if (this.target != null) {
      this.x = this.target.x;
      this.y = this.target.y;
      if (!this.target.exists) {
        this.kill();
      }
    }

    super.update();
  }

  addProperty(aProperty: AntEffectProperty): void {
    this._properties.push(aProperty);
    ++this._numProperties;
  }

  removeProperty(aProperty: AntEffectProperty): void {
    const i = this._properties.indexOf(aProperty) | 0;
    if (i >= 0 && i < this._numProperties) {
      (this._properties[i] as AntEffectProperty).destroy();
      this._properties.splice(i, 1);
      --this._numProperties;
    }
  }

  removePropertyByName(aName: string): void {
    const property = this.getProperty(aName);
    if (property != null) {
      this.removeProperty(property);
    }
  }

  removeAllProperties(): void {
    let i = 0;
    while (i < this._numProperties) {
      (this._properties[i] as AntEffectProperty).destroy();
      this._properties[i++] = null;
    }

    this._properties.length = 0;
    this._numProperties = 0;
  }

  getProperty(aName: string): AntEffectProperty | null {
    let i = 0;
    while (i < this._numProperties) {
      const property = this._properties[i++] as AntEffectProperty;
      if (property.name == aName) {
        return property;
      }
    }

    return null;
  }

  containsProperty(aName: string): boolean {
    return this.getProperty(aName) != null;
  }

  getPropertyAt(aIndex: number): AntEffectProperty | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._numProperties ? (this._properties[aIndex] as AntEffectProperty) : null;
  }

  get numProperties(): number {
    return this._numProperties;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private resetExplosion(): void {
    let i = 0;
    while (i < this._numProperties) {
      (this._properties[i++] as AntEffectProperty).isExploded = false;
    }

    this._explosionInterval = 5;
  }

  private makeParticles(aProperty: AntEffectProperty): void {
    const parent = this.parent as AntEntity;
    if ((aProperty.sprites as string[]).length > 0) {
      let i = 0;
      const n = aProperty.numParticles | 0; // :int
      while (i < n) {
        const particle = parent.recycle(AntEffectParticle) as AntEffectParticle;
        particle.activate(this, aProperty);
        if (!particle.exists) {
          parent.remove(particle, true);
          parent.add(particle);
        }

        particle.revive();
        i++;
      }
    }
  }
}
