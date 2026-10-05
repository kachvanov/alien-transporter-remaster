// Port of ru/antkarlov/anthill/signals/AntSignal.as

import type { AnyArgs } from '../utils/types';
import { AntSignalBinding } from './AntSignalBinding';
import { AntSignalBindingList } from './AntSignalBindingList';

/**
 * Signal with typed arguments: `AntSignal<[Foo, number]>`. The AS3 constructor takes the argument classes
 * (`new AntSignal(Foo, Number)`); the same call is accepted here for a 1:1 port of call sites, but the
 * classes are only used for the "at least N arguments" check in dispatch(): argument types are checked
 * by TypeScript, not at run time (DEVIATION from AntSignal.dispatch, which verified `is valueClass`).
 */
export class AntSignal<A extends AnyArgs = AnyArgs> {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  strict = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _valueClasses: unknown[] = [];
  protected _bindings: AntSignalBindingList<A>;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(...aValueClasses: unknown[]) {
    this.strict = true;
    this._bindings = AntSignalBindingList.NIL;
    this.valueClasses = aValueClasses.length == 1 && Array.isArray(aValueClasses[0]) ? aValueClasses[0] : aValueClasses;
  }

  destroy(): void {
    this._bindings.destroy();
    this._valueClasses = null as unknown as unknown[];
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  add(aListener: (...args: A) => void): AntSignalBinding<A> | null {
    return this.registerListener(aListener);
  }

  addInstant(aListener: (...args: A) => void): AntSignalBinding<A> | null {
    return this.registerListener(aListener, true);
  }

  remove(aListener: (...args: A) => void): AntSignalBinding<A> | null {
    const binding = this._bindings.get(aListener);
    if (binding == null) {
      return null;
    }

    this._bindings = this._bindings.remove(aListener);
    return binding;
  }

  clear(): void {
    this._bindings = AntSignalBindingList.NIL;
  }

  dispatch(...aValueObjects: A): void {
    // If the list of data types is empty, no check is performed.
    const numValueClasses = this._valueClasses.length | 0; // :int
    const numValueObjects = aValueObjects.length | 0; // :int

    if (numValueObjects < numValueClasses) {
      throw new TypeError(
        'Incorrect number of arguments. Expected at least ' +
          numValueClasses +
          ' but received ' +
          numValueObjects +
          '.',
      ); // ArgumentError
    }

    // The per-argument `is valueClass` check is dropped (see class comment).

    // Dispatch to the listeners. The binding list is immutable: add/remove inside a listener creates a new list
    // and does not affect the current dispatch.
    let bindingsToProcess = this._bindings;
    if (!bindingsToProcess.isEmpty) {
      while (!bindingsToProcess.isEmpty) {
        (bindingsToProcess.head as AntSignalBinding<A>).execute(aValueObjects);
        bindingsToProcess = bindingsToProcess.tail as AntSignalBindingList<A>;
      }
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected registerListener(aListener: (...args: A) => void, aInstant = false): AntSignalBinding<A> | null {
    if (this.registrationPossible(aListener, aInstant)) {
      const binding = new AntSignalBinding<A>(aListener, aInstant, this);
      this._bindings = new AntSignalBindingList<A>(binding, this._bindings);
      return binding;
    }

    return this._bindings.get(aListener);
  }

  protected registrationPossible(aListener: (...args: A) => void, aInstant: boolean): boolean {
    if (this._bindings.isEmpty) {
      return true;
    }

    const existingBinding = this._bindings.get(aListener);
    if (existingBinding == null) {
      return true;
    }

    if (existingBinding.instant != aInstant) {
      // If the listener has already been added, we do not add it again.
      // The only exception is one-time listeners.
      throw new Error(
        'You cannot addOnce() then add() the same listener without removing the relationship first.',
      ); // IllegalOperationError
    }

    // The listener is already registered.
    return false;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get valueClasses(): unknown[] {
    return this._valueClasses;
  }
  set valueClasses(value: unknown[]) {
    // Clone, because the array cannot be modified from outside.
    // DEVIATION: the original also verifies that every item is a Class; in TS the entries are opaque
    // (they may be built-in constructors, `Number`, `String`, ... or omitted), so it is not checked.
    this._valueClasses = value ? value.slice() : [];
  }

  get numListeners(): number {
    return this._bindings.length >>> 0; // :uint
  }
}
