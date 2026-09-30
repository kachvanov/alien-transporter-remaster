// Port of ru/antkarlov/anthill/ants/AntObject.as

import { AntSignal } from '../signals/AntSignal';
import type { Ctor } from '../utils/types';

export class AntObject {
  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  private static _nameIndex = 0; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventComponentAdded: AntSignal<[AntObject, Ctor]>;
  eventComponentRemoved: AntSignal<[AntObject, Ctor]>;
  eventNameChanged: AntSignal<[AntObject, string]>;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _name: string;
  /**
   * AS3 `Dictionary` keyed by Class. A Map keeps the insertion order; the order of `for each` over an
   * AS3 Dictionary is not specified, so nothing may depend on the order of getComponents().
   */
  private _components: Map<Ctor, object>;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aName: string | null = null) {
    // super();
    this.eventComponentAdded = new AntSignal<[AntObject, Ctor]>(AntObject, Function);
    this.eventComponentRemoved = new AntSignal<[AntObject, Ctor]>(AntObject, Function);
    this.eventNameChanged = new AntSignal<[AntObject, string]>(AntObject, String);
    this._name = aName == null ? 'Object' + ++AntObject._nameIndex : aName;
    this._components = new Map();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** The key is the class of the component (`constructor`) unless `aClass` is given explicitly. */
  add(aComponent: object, aClass: Ctor | null = null): AntObject {
    if (aClass == null) {
      aClass = aComponent.constructor as Ctor;
    }

    if (this._components.get(aClass) != null) {
      this.remove(aClass);
    }

    this._components.set(aClass, aComponent);
    this.eventComponentAdded.dispatch(this, aClass);
    return this;
  }

  /** Returns the removed component or null. */
  remove<T = object>(aClass: Ctor<T>): T | null {
    const component = this._components.get(aClass);
    if (component != null) {
      this._components.delete(aClass);
      this.eventComponentRemoved.dispatch(this, aClass);
      return component as T;
    }

    return null;
  }

  /** AS3 return type is `*`: `undefined` when there is no such component. */
  get<T = object>(aClass: Ctor<T>): T {
    return this._components.get(aClass) as T;
  }

  has(aClass: Ctor): boolean {
    return this._components.get(aClass) != null;
  }

  getComponents(aComponents: object[] | null = null): object[] {
    if (aComponents == null) {
      aComponents = [];
    }

    for (const component of this._components.values()) {
      aComponents[aComponents.length] = component;
    }

    return aComponents;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get name(): string {
    return this._name;
  }
  set name(value: string) {
    if (this._name != value) {
      const oldName = this._name;
      this._name = value;
      this.eventNameChanged.dispatch(this, oldName);
    }
  }
}
