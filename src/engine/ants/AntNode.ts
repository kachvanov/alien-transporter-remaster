// Port of ru/antkarlov/anthill/ants/AntNode.as

import type { Ctor } from '../utils/types';
import type { AntObject } from './AntObject';

/**
 * Base class of node classes (component selections).
 *
 * DEVIATION: the original AntFamily learns the node fields and their component classes through
 * `describeType(nodeClass).factory.variable`. TS has no such reflection, so every node class declares
 * a `static components` map { fieldName: ComponentClass } in the order of the `public var` declarations
 * of the AS3 node class (the `object` field is not listed):
 *
 *   class ShuttleNode extends AntNode {
 *     static override readonly components = { info: Info, display: Display } as const;
 *     info!: Info; display!: Display;
 *   }
 */
export class AntNode {
  static readonly components: Readonly<Record<string, Ctor>> = {};

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  object: AntObject | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
  }
}

/** AS3 `Class` of a node: constructor without arguments + the `static components` map. */
export interface AntNodeClass<T extends AntNode = AntNode> {
  new (): T;
  readonly components: Readonly<Record<string, Ctor>>;
}
