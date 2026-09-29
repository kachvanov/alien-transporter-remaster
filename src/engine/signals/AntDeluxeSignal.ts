// Port of ru/antkarlov/anthill/signals/AntDeluxeSignal.as

import { isIBubbleEventHandler } from '../events/IBubbleEventHandler';
import { isIEvent } from '../events/IEvent';
import type { IEvent } from '../events/IEvent';
import type { AnyArgs } from '../utils/types';
import { AntSignal } from './AntSignal';
import { AntSignalBinding } from './AntSignalBinding';
import { AntSignalBindingList } from './AntSignalBindingList';

export class AntDeluxeSignal<A extends AnyArgs = AnyArgs> extends AntSignal<A> {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _target: unknown = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aTarget: unknown = null, ...aValueClasses: unknown[]) {
    // AS3 assigns _target and valueClasses before the (explicit, last) super() call; the resulting
    // state is the same as super() first.
    super(...aValueClasses);
    this._target = aTarget;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override add(aListener: (...args: A) => void): AntSignalBinding<A> | null {
    return this.addWithPriority(aListener);
  }

  override addInstant(aListener: (...args: A) => void): AntSignalBinding<A> | null {
    return this.addInstantWithPriority(aListener);
  }

  addWithPriority(aListener: (...args: A) => void, aPriority = 0): AntSignalBinding<A> | null {
    aPriority = aPriority | 0; // aPriority:int
    return this.registerListenerWithPriority(aListener, false, aPriority);
  }

  addInstantWithPriority(aListener: (...args: A) => void, aPriority = 0): AntSignalBinding<A> | null {
    aPriority = aPriority | 0; // aPriority:int
    return this.registerListenerWithPriority(aListener, true, aPriority);
  }

  override dispatch(...aValueObjects: A): void {
    // Если список типов данных пустой, значит проверка не осуществляется.
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

    // The per-argument `is valueClass` check is dropped (see AntSignal).

    // Извлекаем и клонируем событие если необходимо.
    let event: IEvent | null = isIEvent(aValueObjects[0]) ? aValueObjects[0] : null;
    if (event != null) {
      if (event.target != null) {
        event = event.clone();
        (aValueObjects as unknown[])[0] = event;
      }

      event.target = this.target;
      event.currentTarget = this.target;
      event.signal = this;
    }

    // Рассылка слушателям.
    let bindingsToProcess = this._bindings;
    if (!bindingsToProcess.isEmpty) {
      while (!bindingsToProcess.isEmpty) {
        (bindingsToProcess.head as AntSignalBinding<A>).execute(aValueObjects);
        bindingsToProcess = bindingsToProcess.tail as AntSignalBindingList<A>;
      }
    }

    // Реализуем всплывающее событие если это возможно.
    // DEVIATION: the original calls `(target as IBubbleEventHandler).onEventBubbled(event)` without a null
    // check, i.e. throws a TypeError (#1009) when target is not an IBubbleEventHandler. Any code that
    // reached that path crashed in the original, so the guard changes no working behaviour.
    const target = this.target;
    if (isIBubbleEventHandler(target)) {
      target.onEventBubbled(event);
    }

    if (event != null && event.bubbles) {
      let currentTarget: unknown = target;
      // AS3 hasOwnProperty("parent") is true for declared class members (getters included), so the TS
      // equivalent is the `in` operator rather than Object.prototype.hasOwnProperty.
      while (
        currentTarget != null &&
        (typeof currentTarget === 'object' || typeof currentTarget === 'function') &&
        'parent' in currentTarget
      ) {
        currentTarget = (currentTarget as Record<string, unknown>)['parent'];
        if (isIBubbleEventHandler(currentTarget)) {
          event.currentTarget = currentTarget;
          if (currentTarget.onEventBubbled(event) === false) {
            break;
          }
        }
      }
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected override registerListener(aListener: (...args: A) => void, aInstant = false): AntSignalBinding<A> | null {
    return this.registerListenerWithPriority(aListener, aInstant);
  }

  protected registerListenerWithPriority(
    aListener: (...args: A) => void,
    aInstant = false,
    aPriority = 0,
  ): AntSignalBinding<A> | null {
    aPriority = aPriority | 0; // aPriority:int
    if (this.registrationPossible(aListener, aInstant)) {
      const binding = new AntSignalBinding<A>(aListener, aInstant, this, aPriority);
      this._bindings = this._bindings.insertWithPriority(binding);
      return binding;
    }

    return this._bindings.get(aListener);
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get target(): unknown {
    return this._target;
  }
  set target(value: unknown) {
    if (value != this._target) {
      this.clear();
      this._target = value;
    }
  }
}
