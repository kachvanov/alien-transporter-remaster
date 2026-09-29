// Port of ru/antkarlov/anthill/signals/AntSignalBinding.as

import type { AnyArgs } from '../utils/types';
import type { AntSignal } from './AntSignal';

export class AntSignalBinding<A extends AnyArgs = AnyArgs> {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _signal: AntSignal<A> | null;
  private _enabled = false;
  private _strict = false;
  private _listener: ((...args: A) => void) | null;
  private _instant = false;
  private _priority = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aListener: (...args: A) => void, aInstant = false, aSignal: AntSignal<A> | null = null, aPriority = 0) {
    aPriority = aPriority | 0; // aPriority:int
    this._signal = aSignal;
    this._enabled = true;
    this._strict = (aSignal as AntSignal<A>).strict;
    this._listener = aListener;
    this._instant = aInstant;
    this._priority = aPriority;

    this.verifyListener(aListener);
  }

  destroy(): void {
    this._signal = null;
    this._listener = null;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  execute(aValueObjects: A): void {
    if (!this._enabled) {
      return;
    }

    if (this._instant) {
      this.remove();
    }

    // AS3 calls the listener with 0/2/3 arguments explicitly, otherwise through apply(); with
    // rest arguments all branches are the same call. `strict` only affects arity checks,
    // see verifyListener().
    (this._listener as (...args: A) => void)(...aValueObjects);
  }

  remove(): void {
    (this._signal as AntSignal<A>).remove(this._listener as (...args: A) => void);
  }

  toString(): string {
    return (
      '[SignalBinding listener: ' +
      String(this._listener) +
      ', instant: ' +
      this._instant +
      ', priority: ' +
      this._priority +
      ', enabled: ' +
      this._enabled +
      ']'
    );
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected verifyListener(aListener: ((...args: A) => void) | null): void {
    if (aListener == null) {
      throw new TypeError('Given listener is null.'); // ArgumentError
    }

    if (this._signal == null) {
      throw new Error('Internal signal reference has not been set yet.');
    }

    // DEVIATION: the original checks `aListener.length >= signal.valueClasses.length` in strict
    // mode. Function.length in JS ignores default/rest parameters and differs from AS3, and
    // argument types are enforced by the TS generics of AntSignal<A>, so the check is dropped.
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get listener(): ((...args: A) => void) | null {
    return this._listener;
  }
  set listener(value: ((...args: A) => void) | null) {
    if (value == null) {
      throw new TypeError('Given listener is null. Did you want to set enabled to false instead?'); // ArgumentError
    }

    this.verifyListener(value);
    this._listener = value;
  }

  get instant(): boolean {
    return this._instant;
  }

  get priority(): number {
    return this._priority;
  }

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(value: boolean) {
    this._enabled = value;
  }

  get strict(): boolean {
    return this._strict;
  }
  set strict(value: boolean) {
    this._strict = value;
    this.verifyListener(this.listener);
  }
}
