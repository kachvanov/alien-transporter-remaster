// Port of ru/antkarlov/anthill/ants/AntCore.as

import type { AntCamera } from '../core/AntCamera';
import type { IPlugin } from '../plugins/IPlugin';
import { AntSignal } from '../signals/AntSignal';
import { sortAS3 } from '../utils/as3array';
import type { Ctor } from '../utils/types';
import { AntFamily } from './AntFamily';
import type { AntNode, AntNodeClass } from './AntNode';
import type { AntNodeList } from './AntNodeList';
import type { AntObject } from './AntObject';
import type { AntSystem } from './AntSystem';
import type { IFamily } from './IFamily';

export class AntCore implements IPlugin {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventSystemAdded: AntSignal<[AntSystem]>;
  eventSystemRemoved: AntSignal<[AntSystem]>;
  eventUpdateComplete: AntSignal<[]>;

  familyClass: new (aNodeClass: AntNodeClass, aCore: AntCore) => IFamily = AntFamily;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _objects: (AntObject | null)[];
  private _numObjects: number; // int
  private _systems: (AntSystem | null)[];
  private _numSystems: number; // int
  /**
   * AS3 `Dictionary` (Class -> IFamily). The AS3 `for each` order over a Dictionary is unspecified;
   * a Map iterates in insertion order. Nothing in the families depends on this order.
   */
  private _families: Map<AntNodeClass, IFamily>;
  /** Dictionary: object name -> AntObject. */
  private _objectNames: Map<string, AntObject>;
  private _isLocked: boolean;
  private _priority = 0; // int
  // AS3 declares `_sortOrder:int` without an initializer: it is 0 until the first updatePriority() ends.
  private _sortOrder = 0; // int
  private _tag: string | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this.eventSystemAdded = new AntSignal<[AntSystem]>(Object); // AntSystem
    this.eventSystemRemoved = new AntSignal<[AntSystem]>(Object); // AntSystem
    this.eventUpdateComplete = new AntSignal<[]>();
    this._objects = [];
    this._numObjects = 0;
    this._systems = [];
    this._numSystems = 0;
    this._families = new Map();
    this._objectNames = new Map();
    this._isLocked = false;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  addObject(aObject: AntObject): void {
    if (!this.containsObject(aObject)) {
      if (this._objectNames.get(aObject.name) != null) {
        throw new Error('Object with name "' + aObject.name + '" is already uses by other object.');
      }

      this._objectNames.set(aObject.name, aObject);
      this._objects[this._objects.length] = aObject;
      ++this._numObjects;
      aObject.eventComponentAdded.add(this.onComponentAdded);
      aObject.eventComponentRemoved.add(this.onComponentRemoved);
      aObject.eventNameChanged.add(this.onObjectNameChanged);
      for (const family of this._families.values()) {
        family.addObject(aObject);
      }
    }
  }

  removeObject(aObject: AntObject, aDestroyComponents = true): void {
    if (this.containsObject(aObject)) {
      aObject.eventComponentAdded.remove(this.onComponentAdded);
      aObject.eventComponentRemoved.remove(this.onComponentRemoved);
      aObject.eventNameChanged.remove(this.onObjectNameChanged);
      for (const family of this._families.values()) {
        family.removeObject(aObject);
      }

      this._objectNames.delete(aObject.name);
      let i = this._objects.indexOf(aObject) | 0; // :int
      if (i >= 0 && i < this._objects.length) {
        this._objects[i] = null;
        this._objects.splice(i, 1);
        --this._numObjects;
      }

      if (aDestroyComponents) {
        i = 0;
        const components = aObject.getComponents();
        const n = components.length | 0; // :int
        while (i < n) {
          const component = components[i++] as { destroy?: unknown } | null;
          // `hasOwnProperty("destroy") && component["destroy"] is Function`. An AS3 method is a bound
          // closure, so `.apply(this)` (this = AntCore) never changed the receiver: call it on the component.
          if (component != null && typeof component.destroy === 'function') {
            (component.destroy as (this: object) => void).apply(component);
          }
        }
      }
    }
  }

  containsObject(aObject: AntObject): boolean {
    const i = this._objects.indexOf(aObject) | 0; // :int
    return i >= 0 && i < this._numObjects;
  }

  getObjectByName(aName: string): AntObject | null {
    let i = 0; // :int
    while (i < this._numObjects) {
      const object = this._objects[i++] as AntObject | null;
      if (object != null && object.name == aName) {
        return object;
      }
    }

    return null;
  }

  /** Systems are ordered by priority (higher first); see sortHandler(). */
  addSystem(aSystem: AntSystem, aPriority: number): void {
    if (!this.containsSystem(aSystem)) {
      aSystem.priority = aPriority | 0; // :int
      aSystem.addToCore(this);
      this._systems[this._systems.length] = aSystem;
      ++this._numSystems;
      this.updatePriority();
      this.eventSystemAdded.dispatch(aSystem);
    }
  }

  removeSystem(aSystem: AntSystem): void {
    if (this.containsSystem(aSystem)) {
      const i = this._systems.indexOf(aSystem) | 0; // :int
      if (i >= 0 && i < this._numSystems) {
        this._systems[i] = null;
        this._systems.splice(i, 1);
        --this._numSystems;
      }

      aSystem.removeFromCore(this);
      this.eventSystemRemoved.dispatch(aSystem);
    }
  }

  containsSystem(aSystem: AntSystem): boolean {
    const i = this._systems.indexOf(aSystem) | 0; // :int
    return i >= 0 && i <= this._numSystems;
  }

  /** `is Class` -> instanceof. */
  hasSystem(aClass: Ctor): boolean {
    let i = 0; // :int
    while (i < this._numSystems) {
      if (this._systems[i++] instanceof aClass) {
        return true;
      }
    }

    return false;
  }

  getSystem<T extends AntSystem>(aClass: Ctor<T>): T | null {
    let i = 0; // :int
    while (i < this._numSystems) {
      const system = this._systems[i++];
      if (system instanceof aClass) {
        return system;
      }
    }

    return null;
  }

  clearSystems(): void {
    let i = (this._numSystems - 1) | 0; // :int
    while (i >= 0) {
      this.removeSystem(this._systems[i--]!);
    }
  }

  getSystems(aSystems: AntSystem[] | null = null): AntSystem[] {
    if (aSystems == null) {
      aSystems = [];
    }

    let i = 0; // :int
    while (i < this._numSystems) {
      aSystems[aSystems.length] = this._systems[i++]!;
    }

    return aSystems;
  }

  pauseSystem(aClass: Ctor<AntSystem>): void {
    const system = this.getSystem(aClass);
    if (system != null) {
      system.pause();
    }
  }

  resumeSystem(aClass: Ctor<AntSystem>): void {
    const system = this.getSystem(aClass);
    if (system != null) {
      system.resume();
    }
  }

  /** Returns the same AntNodeList for the same node class every time (until releaseNodes()). */
  getNodes<T extends AntNode>(aNodeClass: AntNodeClass<T>): AntNodeList<T> {
    const existing = this._families.get(aNodeClass);
    if (existing != null) {
      return existing.nodes as unknown as AntNodeList<T>;
    }

    const family: IFamily = new this.familyClass(aNodeClass, this);
    this._families.set(aNodeClass, family);
    let i = 0; // :int
    while (i < this._numObjects) {
      family.addObject(this._objects[i++]!);
    }

    return family.nodes as unknown as AntNodeList<T>;
  }

  releaseNodes(aNodeClass: AntNodeClass): void {
    const family = this._families.get(aNodeClass);
    if (family != null) {
      family.clear();
    }

    this._families.delete(aNodeClass);
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  // AS3 method closures (stable references for AntSignal.add()/remove()).

  private onComponentAdded = (aObject: AntObject, aComponentClass: Ctor): void => {
    for (const family of this._families.values()) {
      family.componentAdded(aObject, aComponentClass);
    }
  };

  private onComponentRemoved = (aObject: AntObject, aComponentClass: Ctor): void => {
    for (const family of this._families.values()) {
      family.componentRemoved(aObject, aComponentClass);
    }
  };

  private onObjectNameChanged = (aObject: AntObject, aOldName: string): void => {
    if (this._objectNames.get(aOldName) == aObject) {
      this._objectNames.delete(aOldName);
      this._objectNames.set(aObject.name, aObject);
    }
  };

  private updatePriority(): void {
    // Array.sort of AS3 is not stable: sortAS3 reproduces the order Flash Player would produce.
    sortAS3(this._systems, this.sortHandlerBound);
    this._sortOrder = 1;
  }

  protected sortHandler(aSystem1: AntSystem | null, aSystem2: AntSystem | null): number {
    if (aSystem1 == null) {
      return this._sortOrder;
    }

    if (aSystem2 == null) {
      return -this._sortOrder;
    }

    if (aSystem1.priority < aSystem2.priority) {
      return this._sortOrder;
    }

    if (aSystem1.priority > aSystem2.priority) {
      return -this._sortOrder;
    }

    return 0;
  }

  /** AS3 method closure: `sort(sortHandler)` passes a function permanently bound to `this`. */
  private sortHandlerBound = (aSystem1: AntSystem | null, aSystem2: AntSystem | null): number =>
    this.sortHandler(aSystem1, aSystem2);

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isLocked(): boolean {
    return this._isLocked;
  }

  get tag(): string | null {
    return this._tag;
  }
  set tag(value: string | null) {
    this._tag = value;
  }

  get priority(): number {
    return this._priority;
  }
  set priority(value: number) {
    this._priority = value | 0; // :int
  }

  //---------------------------------------
  // IPlugin
  //---------------------------------------

  update(): void {
    this._isLocked = true;
    let i = 0; // :int
    while (i < this._numSystems) {
      const system = this._systems[i++] as AntSystem | null;
      if (system != null && !system.isPaused) {
        system.update();
      }
    }

    this._isLocked = false;
    this.eventUpdateComplete.dispatch();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(_aCamera: AntCamera): void {}
}
