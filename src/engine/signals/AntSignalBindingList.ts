// Port of ru/antkarlov/anthill/signals/AntSignalBindingList.as

import type { AnyArgs } from '../utils/types';
import type { AntSignalBinding } from './AntSignalBinding';

/**
 * Immutable-style singly linked list of bindings. `insert`/`remove` copy the list, so a dispatch that
 * is iterating over an older list is not affected by add/remove calls made from inside a listener.
 */
export class AntSignalBindingList<A extends AnyArgs = AnyArgs> {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static readonly NIL: AntSignalBindingList<any> = new AntSignalBindingList<any>(null, null);

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  head: AntSignalBinding<A> | null = null;
  tail: AntSignalBindingList<A> | null = null;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _isEmpty = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aHead: AntSignalBinding<A> | null, aTail: AntSignalBindingList<A> | null) {
    if (aHead == null && aTail == null) {
      // While NIL itself is being created AntSignalBindingList.NIL is still undefined (AS3: null).
      if (AntSignalBindingList.NIL != null) {
        throw new TypeError('Parameters head and tail are null. Use the NIL element instead.'); // ArgumentError
      }

      this._isEmpty = true;
    } else {
      if (aTail == null) {
        throw new TypeError('Tail must not be null.'); // ArgumentError
      }

      this.head = aHead;
      this.tail = aTail;
      this._isEmpty = false;
    }
  }

  destroy(): void {
    if (this.head != null) {
      this.head.destroy();
      this.head = null;
    }

    if (this.tail != null) {
      this.tail.destroy();
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  insert(aSignalBinding: AntSignalBinding<A>): AntSignalBindingList<A> {
    return new AntSignalBindingList<A>(aSignalBinding, this);
  }

  insertWithPriority(aSignalBinding: AntSignalBinding<A>): AntSignalBindingList<A> {
    // If the list is empty, add to the beginning.
    if (this.isEmpty) {
      return new AntSignalBindingList<A>(aSignalBinding, this);
    }

    // If the priority is higher than that of the first element of the list, add to the beginning.
    const priority = aSignalBinding.priority; // :int
    if (priority > (this.head as AntSignalBinding<A>).priority) {
      return new AntSignalBindingList<A>(aSignalBinding, this);
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let p: AntSignalBindingList<A> = this;
    let q: AntSignalBindingList<A>;
    let first: AntSignalBindingList<A> | null = null;
    let last: AntSignalBindingList<A> | null = null;

    // Iterate over the whole list of bindings.
    while (!p.isEmpty) {
      if (priority > (p.head as AntSignalBinding<A>).priority) {
        q = new AntSignalBindingList<A>(aSignalBinding, p);
        if (last != null) {
          last.tail = q;
        }
        // NOTE: bug of the original, kept on purpose (1:1): `return q` (not `first`) drops every binding
        // in front of the insertion point when a binding is inserted in the middle of the list.
        return q;
      } else {
        q = new AntSignalBindingList<A>(p.head, AntSignalBindingList.NIL);
        if (last != null) {
          last.tail = q;
        }

        if (first == null) {
          first = q;
        }
        last = q;
      }

      p = p.tail as AntSignalBindingList<A>;
    }

    if (first == null || last == null) {
      throw new Error('Internal error.');
    }

    last.tail = new AntSignalBindingList<A>(aSignalBinding, AntSignalBindingList.NIL);
    return first;
  }

  remove(aListener: ((...args: A) => void) | null): AntSignalBindingList<A> {
    if (this.isEmpty || aListener == null) {
      return this;
    }

    if (aListener == (this.head as AntSignalBinding<A>).listener) {
      return this.tail as AntSignalBindingList<A>;
    }

    const first = new AntSignalBindingList<A>(this.head, AntSignalBindingList.NIL);
    let current = this.tail as AntSignalBindingList<A>;
    let previous = first;

    while (!current.isEmpty) {
      if ((current.head as AntSignalBinding<A>).listener == aListener) {
        previous.tail = current.tail;
        return first;
      }

      previous = previous.tail = new AntSignalBindingList<A>(current.head, AntSignalBindingList.NIL);
      current = current.tail as AntSignalBindingList<A>;
    }

    return this;
  }

  contains(aListener: ((...args: A) => void) | null): boolean {
    if (this.isEmpty) {
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let p: AntSignalBindingList<A> = this;
    while (!p.isEmpty) {
      if ((p.head as AntSignalBinding<A>).listener == aListener) {
        return true;
      }
      p = p.tail as AntSignalBindingList<A>;
    }

    return false;
  }

  get(aListener: ((...args: A) => void) | null): AntSignalBinding<A> | null {
    if (this.isEmpty) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let p: AntSignalBindingList<A> = this;
    while (!p.isEmpty) {
      if ((p.head as AntSignalBinding<A>).listener == aListener) {
        return p.head;
      }
      p = p.tail as AntSignalBindingList<A>;
    }

    return null;
  }

  toString(): string {
    let buffer = '';
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let p: AntSignalBindingList<A> = this;
    while (!p.isEmpty) {
      buffer += String(p.head) + ' -> ';
      p = p.tail as AntSignalBindingList<A>;
    }

    buffer += 'Nil';
    return '[List ' + buffer + ']';
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isEmpty(): boolean {
    return this._isEmpty;
  }

  get length(): number {
    if (this.isEmpty) {
      return 0;
    }

    let res = 0; // uint
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let p: AntSignalBindingList<A> = this;
    while (!p.isEmpty) {
      res++;
      p = p.tail as AntSignalBindingList<A>;
    }

    return res >>> 0;
  }
}
