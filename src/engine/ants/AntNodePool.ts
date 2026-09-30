// Port of ru/antkarlov/anthill/ants/AntNodePool.as

import type { Ctor } from '../utils/types';
import type { AntNode, AntNodeClass } from './AntNode';

export class AntNodePool {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _nodeClass: AntNodeClass;
  /** Dictionary: component Class -> node field name (shared with AntFamily). */
  private _components: Map<Ctor, string>;
  private _freeNodes: AntNode[];
  private _cacheNodes: AntNode[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aNodeClass: AntNodeClass, aComponents: Map<Ctor, string>) {
    this._nodeClass = aNodeClass;
    this._components = aComponents;
    this._freeNodes = [];
    this._cacheNodes = [];
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** AS3 `get()`. */
  get(): AntNode {
    return this._freeNodes.length > 0 ? this._freeNodes.pop()! : new this._nodeClass();
  }

  /** AS3 `set(node)`: returns the node to the pool (clears the component fields and `object`). */
  set(aNode: AntNode): void {
    for (const fieldName of this._components.values()) {
      (aNode as unknown as Record<string, unknown>)[fieldName] = null;
    }
    aNode.object = null;
    this._freeNodes[this._freeNodes.length] = aNode;
  }

  setToCache(aNode: AntNode): void {
    this._cacheNodes[this._cacheNodes.length] = aNode;
  }

  releaseCache(): void {
    let i = 0; // :int
    const n = this._cacheNodes.length | 0; // :int
    while (i < n) {
      this.set(this._cacheNodes[i++]!);
    }
    this._cacheNodes.length = 0;
  }
}
