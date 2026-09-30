// Port of ru/alientransporter/map/ObjectManager.as
//
// DEVIATION (docs/04-porting-guide.md section 4): `createFrom(param1: Sprite)` takes a ClipProxy;
// `getQualifiedClassName(clip)` is `clip.cls` (qualifiedName()).

import type { ClipProxy } from '../../engine/assets/ClipProxy';
import { qualifiedName } from '../../engine/utils/cast';

/** A factory function of the object manager: `(clip, className)`; the return value is ignored. */
export type ObjectFactoryFunction = (aClip: ClipProxy, aClassName: string) => unknown;

export class ObjectManager {
  static readonly className = 'ObjectManager';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly BASIC = 'basic';
  static readonly JOINT = 'joint';

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _componentList: Record<string, ObjectFactoryFunction>;
  private _basicList: string[];
  private _jointList: string[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this._componentList = {};
    this._basicList = [];
    this._jointList = [];
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** Bound to the instance (the original passes `this._objectManager.add` around as a method closure). */
  add = (aClassNames: string[], aFunction: ObjectFactoryFunction, aKind: string = ObjectManager.BASIC): void => {
    let i = 0; // :int
    const n = aClassNames.length | 0; // :int
    while (i < n) {
      const className = aClassNames[i++] as string;
      this._componentList[className] = aFunction;
      this.addToList(className, aKind);
    }
  };

  createFrom(aClip: ClipProxy): boolean {
    const className = qualifiedName(aClip);
    const factory = Object.hasOwn(this._componentList, className) ? this._componentList[className] : undefined;
    if (factory != null) {
      factory(aClip, className);
      return true;
    }

    return false;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private addToList(aClassName: string, aKind: string): void {
    switch (aKind) {
      case ObjectManager.BASIC:
        this._basicList.push(aClassName);
        break;
      case ObjectManager.JOINT:
        this._jointList.push(aClassName);
    }
  }
}
