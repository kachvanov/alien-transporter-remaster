// Port of ru/antkarlov/anthill/ants/AntFamily.as

import type { Ctor } from '../utils/types';
import type { AntCore } from './AntCore';
import type { AntNode, AntNodeClass } from './AntNode';
import { AntNodeList } from './AntNodeList';
import { AntNodePool } from './AntNodePool';
import type { AntObject } from './AntObject';
import type { IFamily } from './IFamily';

export class AntFamily implements IFamily {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _nodes!: AntNodeList;
  private _nodeClass: AntNodeClass;
  /** Dictionary: AntObject -> AntNode. */
  private _objects!: Map<AntObject, AntNode>;
  /** Dictionary: component Class -> node field name. */
  private _components!: Map<Ctor, string>;
  private _pool!: AntNodePool;
  private _core: AntCore;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aNodeClass: AntNodeClass, aCore: AntCore) {
    // super();
    this._nodeClass = aNodeClass;
    this._core = aCore;
    this.init();
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private init(): void {
    this._nodes = new AntNodeList();
    this._objects = new Map();
    this._components = new Map();
    this._pool = new AntNodePool(this._nodeClass, this._components);
    this._pool.set(this._pool.get());

    // DEVIATION: describeType(nodeClass).factory.variable -> `static components` of the node class
    // (see AntNode). The `object` field is never a component.
    const components = this._nodeClass.components;
    if (components == null) {
      throw new Error(
        'Node class must declare "static components" (fieldName -> component class).',
      );
    }
    for (const fieldName of Object.keys(components)) {
      if (fieldName != 'object') {
        this._components.set(components[fieldName]!, fieldName);
      }
    }
  }

  private add(aObject: AntObject): void {
    if (!this._objects.has(aObject)) {
      for (const componentClass of this._components.keys()) {
        if (!aObject.has(componentClass)) {
          return;
        }
      }

      const node = this._pool.get();
      node.object = aObject;
      for (const [componentClass, fieldName] of this._components) {
        (node as unknown as Record<string, unknown>)[fieldName] = aObject.get(componentClass);
      }

      this._objects.set(aObject, node);
      this._nodes.add(node);
    }
  }

  private remove(aObject: AntObject): void {
    const node = this._objects.get(aObject);
    if (node != null) {
      this._objects.delete(aObject);
      this._nodes.remove(node);
      if (this._core.isLocked) {
        // The node may still be referenced by the running system: release it after update() completes.
        this._pool.setToCache(node);
        this._core.eventUpdateComplete.add(this.onCoreUpdateCompleted);
      } else {
        this._pool.set(node);
      }
    }
  }

  /** AS3 method closure: a stable reference is needed for signal.remove(). */
  private onCoreUpdateCompleted = (): void => {
    this._core.eventUpdateComplete.remove(this.onCoreUpdateCompleted);
    this._pool.releaseCache();
  };

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  addObject(aObject: AntObject): void {
    this.add(aObject);
  }

  removeObject(aObject: AntObject): void {
    this.remove(aObject);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  componentAdded(aObject: AntObject, _aComponentClass: Ctor): void {
    this.add(aObject);
  }

  componentRemoved(aObject: AntObject, aComponentClass: Ctor): void {
    if (this._components.has(aComponentClass)) {
      this.remove(aObject);
    }
  }

  clear(): void {
    let i = 0; // :int
    while (i < this._nodes.numNodes) {
      const node = this._nodes.get(i++)!;
      this._objects.delete(node.object!);
    }

    this._nodes.removeAll();
    this._nodes = null as unknown as AntNodeList; // AS3: this._nodes = null
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get nodes(): AntNodeList {
    return this._nodes;
  }
}
