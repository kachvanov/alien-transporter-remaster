// Port of ru/antkarlov/anthill/extensions/effects/AntEffectProperty.as
//
// DEVIATION: `importFrom(XML)` reads the JSON object of effects.json (`{name, SubProp: [{name, value}]}`, the values are
// strings as in the XML attributes). `export()` (the XML of the effect editor) is not ported: the editor is not part
// of the game (AntEffectManager.EDITOR_MODE = false).

import { AntG } from '../core/AntG';
import { AntMath } from '../utils/AntMath';

/** AS3 `FIELDS`: the fields that clone() copies and the editor exports. */
const FIELDS: readonly string[] = [
  'spawnX', 'spawnY', 'lowerSpawnX', 'upperSpawnX', 'lowerSpawnY', 'upperSpawnY',
  'scaleX', 'scaleY', 'lowerScaleX', 'upperScaleX', 'lowerScaleY', 'upperScaleY', 'proportional',
  'angle', 'lowerAngle', 'upperAngle', 'angleBasedOnSpeed',
  'interval', 'lowerInterval', 'upperInterval', 'isExplosion', 'sortIndex', 'enableSorting',
  'velocityX', 'velocityY', 'lowerVelocityX', 'upperVelocityX', 'lowerVelocityY', 'upperVelocityY',
  'maxVelocityX', 'maxVelocityY', 'minVelocityX', 'minVelocityY',
  'accelX', 'accelY', 'dragX', 'dragY',
  'velocity', 'lowerVelocity', 'upperVelocity', 'velocityAngle', 'lowerVelocityAngle', 'upperVelocityAngle',
  'initializeAsVectorVelocity', 'rotateVector', 'lowerRotateVector', 'upperRotateVector',
  'accelCoef', 'dragCoef', 'enableVectorVelocity',
  'animationSpeed', 'lowerAnimationSpeed', 'upperAnimationSpeed', 'numParticles', 'blend', 'allowQualityControl',
];

/** What `hasOwnProperty(name)` of the AS3 instance is true for among the public members that the data can name. */
const SETTABLE: ReadonlySet<string> = new Set<string>([...FIELDS, 'name', 'sprite', 'sprites']);

export interface EffectSubProp {
  name: string;
  value: string;
}

export interface EffectPropertyJson {
  name: string;
  SubProp?: readonly EffectSubProp[];
}

export class AntEffectProperty {
  static get FIELDS(): readonly string[] {
    return FIELDS;
  }

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  name: string | null;
  spawnX = 0;
  spawnY = 0;
  lowerSpawnX = 0;
  upperSpawnX = 0;
  lowerSpawnY = 0;
  upperSpawnY = 0;
  scaleX = 1;
  scaleY = 1;
  lowerScaleX = 0;
  upperScaleX = 0;
  lowerScaleY = 0;
  upperScaleY = 0;
  proportional = true;
  angle = 0;
  lowerAngle = 0;
  upperAngle = 0;
  angleBasedOnSpeed = false;
  animationSpeed = 1;
  lowerAnimationSpeed = 0;
  upperAnimationSpeed = 0;
  numParticles = 1;
  interval = 5;
  lowerInterval = 0;
  upperInterval = 0;
  isExplosion = false;
  sortIndex = 0;
  enableSorting = false;
  velocityX = 0;
  velocityY = -50;
  lowerVelocityX = 0;
  upperVelocityX = 0;
  lowerVelocityY = 0;
  upperVelocityY = 0;
  maxVelocityX = 999;
  maxVelocityY = 999;
  minVelocityX = -999;
  minVelocityY = -999;
  accelX = 0;
  accelY = 0;
  dragX = 1;
  dragY = 1;
  velocity = 0;
  lowerVelocity = 0;
  upperVelocity = 0;
  velocityAngle = 0;
  lowerVelocityAngle = 0;
  upperVelocityAngle = 0;
  initializeAsVectorVelocity = false;
  rotateVector = 0;
  lowerRotateVector = 0;
  upperRotateVector = 0;
  accelCoef = 1;
  dragCoef = 1;
  enableVectorVelocity = false;
  sprites: string[] | null = [];
  allowQualityControl = true;
  blend: string | null = null;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _isExploded = false;
  private _interval = 0;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aName: string | null = null) {
    // super();
    this.name = aName;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {
    (this.sprites as string[]).length = 0;
    this.sprites = null;
  }

  clone(): AntEffectProperty {
    const copy = new AntEffectProperty();
    copy.name = this.name;
    const self = this as unknown as Record<string, unknown>;
    const dest = copy as unknown as Record<string, unknown>;
    let i = 0;
    const n = FIELDS.length | 0;
    while (i < n) {
      const field = FIELDS[i++] as string;
      dest[field] = self[field];
    }

    const sprites = this.sprites as string[];
    i = 0;
    const m = sprites.length | 0;
    while (i < m) {
      (copy.sprites as string[]).push(sprites[i++] as string);
    }

    return copy;
  }

  newParticleIsReady(): boolean {
    this._interval -= 35 * AntG.elapsed;
    if (this._interval <= 0 && !this._isExploded) {
      this._interval = this.interval + AntMath.randomRangeNumber(this.lowerInterval, this.upperInterval);
      return true;
    }

    return false;
  }

  explode(): void {
    if (this.isExplosion) {
      this._isExploded = true;
    }
  }

  /** AS3 `importFrom(aXml:XML)`: the SubProp values are strings; the type is guessed from the text as the original does. */
  importFrom(aData: EffectPropertyJson): void {
    this.name = aData.name;
    const dest = this as unknown as Record<string, unknown>;
    for (const subProp of aData.SubProp ?? []) {
      const propName = subProp.name;
      const value = subProp.value;
      if (SETTABLE.has(propName)) {
        if (value.indexOf('null') > -1) {
          dest[propName] = null;
        } else if (value.indexOf('false') > -1) {
          dest[propName] = false;
        } else if (value.indexOf('true') > -1) {
          dest[propName] = true;
        } else if (isNaN(Number(value))) {
          dest[propName] = value;
        } else {
          dest[propName] = parseFloat(value);
        }
      }
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isExploded(): boolean {
    return this._isExploded;
  }
  set isExploded(value: boolean) {
    this._isExploded = value;
  }

  /** A random one of the sprites. */
  get sprite(): string {
    const sprites = this.sprites as string[];
    return sprites[AntMath.randomRangeInt(0, sprites.length - 1)] as string;
  }
  /** Adds the sprite to the list. */
  set sprite(value: string) {
    (this.sprites as string[]).push(value);
  }
}
