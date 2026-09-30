// Port of ru/antkarlov/anthill/ants/AntNodeList.as

import { AntSignal } from '../signals/AntSignal';
import type { AntNode } from './AntNode';

export class AntNodeList<T extends AntNode = AntNode> {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventNodeAdded: AntSignal<[T]>;
  eventNodeRemoved: AntSignal<[T]>;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _nodes: (T | null)[];
  private _numNodes: number; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this.eventNodeAdded = new AntSignal<[T]>(Object); // AntNode
    this.eventNodeRemoved = new AntSignal<[T]>(Object); // AntNode
    this._nodes = [];
    this._numNodes = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** New nodes are appended to the END of the list (this defines the processing order in systems). */
  add(aNode: T): void {
    if (!this.contains(aNode)) {
      this._nodes.push(aNode);
      ++this._numNodes;
      this.eventNodeAdded.dispatch(aNode);
    }
  }

  get(aIndex: number): T | null {
    aIndex = aIndex | 0; // :int
    return aIndex >= 0 && aIndex < this._numNodes ? this._nodes[aIndex]! : null;
  }

  applyForEach(aFunction: (aNode: T) => void): void {
    let i = 0; // :int
    while (i < this._numNodes) {
      aFunction(this._nodes[i++]!);
    }
  }

  remove(aNode: T): void {
    const index = this._nodes.indexOf(aNode) | 0; // :int
    if (index >= 0 && index < this._numNodes) {
      this._nodes[index] = null;
      this._nodes.splice(index, 1);
      --this._numNodes;
      this.eventNodeRemoved.dispatch(aNode);
    }
  }

  contains(aNode: T): boolean {
    const index = this._nodes.indexOf(aNode) | 0; // :int
    return index >= 0 && index < this._numNodes;
  }

  removeAll(): void {
    let i = (this._numNodes - 1) | 0; // :int
    while (i >= 0) {
      this.remove(this._nodes[i--]!);
    }
    this._nodes.length = 0;
    this._numNodes = 0;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isEmpty(): boolean {
    return this._numNodes == 0;
  }

  get numNodes(): number {
    return this._numNodes;
  }
}
