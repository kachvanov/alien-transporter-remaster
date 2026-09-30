// Port of ru/antkarlov/anthill/plugins/AntTween.as

import type { AntCamera } from '../core/AntCamera';
import { AntG } from '../core/AntG';
import { AntSignal } from '../signals/AntSignal';
import type { AnyArgs, AnyObject } from '../utils/types';
import { AntTransition } from './AntTransition';
import type { TransitionFunc } from './AntTransition';
import type { IPlugin } from './IPlugin';

export class AntTween implements IPlugin {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly MAX_CACHE_CAPACITY = 30; // int

  //---------------------------------------
  // PUBLIC METHODS (variables)
  //---------------------------------------

  roundToInt = false;
  nextTween: AntTween | null = null;
  autoStartOfNextTween = false;
  // AS3 `public var repeatCount:int`: every write is truncated, hence an accessor (see below).
  protected _repeatCount = 0; // int
  repeatDelay = NaN;
  reverse = false;

  eventStart!: AntSignal;
  eventUpdate!: AntSignal;
  eventRepeat!: AntSignal;
  eventComplete!: AntSignal;

  startArgs: AnyArgs | null = null;
  updateArgs: AnyArgs | null = null;
  repeatArgs: AnyArgs | null = null;
  completeArgs: AnyArgs | null = null;

  autocaching = false;
  autocachingReset = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _target: AnyObject | null = null;
  protected _transitionFunc: TransitionFunc | null = null;
  protected _transitionName: string | null = null;
  protected _properties: string[] | null = null;
  protected _startValues: number[] | null = null;
  protected _endValues: number[] | null = null;
  protected _totalTime = NaN;
  protected _currentTime = NaN;
  protected _delay = NaN;
  protected _currentCycle = 0; // int
  protected _isStarted = false;
  protected _tag: string | null = null;
  protected _priority = 0; // int

  protected static _cache: (AntTween | null)[] | null = null;
  protected static _numCacheItems = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aTarget: AnyObject | null, aTime: number, aTransition: string | TransitionFunc = 'linear', aAutoCaching = false) {
    this._isStarted = false;
    this._tag = null;
    this.autoStartOfNextTween = true;
    this.autocaching = aAutoCaching;
    this.autocachingReset = true;

    this.reset(aTarget, aTime, aTransition);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  reset(aTarget: AnyObject | null, aTime: number, aTransition: string | TransitionFunc = 'linear'): AntTween {
    this.stop();

    this._target = aTarget;
    this._totalTime = aTime;
    this._currentTime = 0;
    this._totalTime = Math.max(0.0001, aTime);
    this._delay = this.repeatDelay = 0.0;
    this.startArgs = this.updateArgs = this.repeatArgs = this.completeArgs = null;
    this.roundToInt = this.reverse = false;
    this.repeatCount = 1;
    this._currentCycle = -1;

    if (typeof aTransition === 'string') {
      this.transition = aTransition;
    } else if (typeof aTransition === 'function') {
      this.transitionFunc = aTransition;
    } else {
      throw new TypeError('Transition must be either a string or a function'); // ArgumentError
    }

    if (this.eventStart == null) this.eventStart = new AntSignal();
    else this.eventStart.clear();
    if (this.eventUpdate == null) this.eventUpdate = new AntSignal();
    else this.eventUpdate.clear();
    if (this.eventRepeat == null) this.eventRepeat = new AntSignal();
    else this.eventRepeat.clear();
    if (this.eventComplete == null) this.eventComplete = new AntSignal();
    else this.eventComplete.clear();

    // Отключение типизации для сигналов
    this.eventStart.strict = false;
    this.eventUpdate.strict = false;
    this.eventRepeat.strict = false;
    this.eventComplete.strict = false;

    if (this._properties == null) this._properties = [];
    else this._properties.length = 0;
    if (this._startValues == null) this._startValues = [];
    else this._startValues.length = 0;
    if (this._endValues == null) this._endValues = [];
    else this._endValues.length = 0;

    return this;
  }

  animate(aProperty: string, aEndValue: number): void {
    if (this._target != null) {
      const props = this._properties as string[];
      const i = props.indexOf(aProperty) | 0; // :int
      if (i == -1) {
        props.push(aProperty);
        (this._startValues as number[]).push(Number.NaN);
        (this._endValues as number[]).push(aEndValue);
      } else {
        (this._startValues as number[])[i] = Number.NaN;
        (this._endValues as number[])[i] = aEndValue;
      }
    }
  }

  scaleTo(aValue: number): void {
    this.animate('scaleX', aValue);
    this.animate('scaleY', aValue);
  }

  moveTo(aX: number, aY: number): void {
    this.animate('x', aX);
    this.animate('y', aY);
  }

  fadeTo(aAlpha: number): void {
    this.animate('alpha', aAlpha);
  }

  start(): void {
    if (!this._isStarted) {
      AntG.plugins.add(this);
      this._isStarted = true;
    }
  }

  stop(): void {
    if (this._isStarted) {
      AntG.plugins.remove(this);
      this._isStarted = false;
    }
  }

  getEndValue(aProperty: string): number {
    const i = (this._properties as string[]).indexOf(aProperty) | 0; // :int
    if (i == -1) {
      throw new TypeError("The property '" + aProperty + "' is not animated."); // ArgumentError
    }

    // AS3: `return _properties[i] as Number;` (sic: returns from _properties, not _endValues). `String as Number`
    // is null, which converts to 0 for the Number return type.
    return 0;
  }

  destroy(): void {
    if (this._isStarted) {
      this.stop();
    }

    this.nextTween = null;

    this.eventStart.destroy();
    this.eventUpdate.destroy();
    this.eventRepeat.destroy();
    this.eventComplete.destroy();
    this.eventStart = null as unknown as AntSignal;
    this.eventUpdate = null as unknown as AntSignal;
    this.eventRepeat = null as unknown as AntSignal;
    this.eventComplete = null as unknown as AntSignal;

    this.startArgs = null;
    this.updateArgs = null;
    this.repeatArgs = null;
    this.completeArgs = null;

    this._target = null;
    this._transitionFunc = null;
    this._properties = null;
    this._startValues = null;
    this._endValues = null;
  }

  //---------------------------------------
  // IPlugin Implementation
  //---------------------------------------

  update(): void {
    this.updateTween(AntG.elapsed);
  }

  draw(aCamera: AntCamera): void {
    void aCamera;
  }

  get tag(): string | null {
    return this._tag;
  }
  set tag(aValue: string | null) {
    this._tag = aValue;
  }

  get priority(): number {
    return this._priority;
  }
  set priority(aValue: number) {
    this._priority = aValue | 0; // aValue:int
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected updateTween(aTime: number): void {
    if (aTime == 0 || (this.repeatCount == 1 && this._currentTime == this._totalTime)) {
      return;
    }

    let i: number; // :int
    const previousTime = this._currentTime;
    const restTime = this._totalTime - this._currentTime;
    const carryOverTime = aTime > restTime ? aTime - restTime : 0.0;

    this._currentTime = Math.min(this._totalTime, this._currentTime + aTime);

    if (this._currentTime <= 0) {
      // Задержка еще не закончилась.
      return;
    }

    if (this._currentCycle < 0 && previousTime <= 0 && this._currentTime > 0) {
      this._currentCycle++;
      this.eventStart.dispatch(...(this.startArgs ?? []));
    }

    const ratio = this._currentTime / this._totalTime;
    const reversed = this.reverse && this._currentCycle % 2 == 1;
    const startValues = this._startValues as number[];
    const endValues = this._endValues as number[];
    const properties = this._properties as string[];
    const target = this._target as AnyObject;
    const transitionFunc = this._transitionFunc as TransitionFunc;
    const numProperties = startValues.length | 0; // :int

    for (i = 0; i < numProperties; ++i) {
      const prop = properties[i] as string;
      if (isNaN(startValues[i] as number)) {
        // `_target[prop] as Number`: non-Number values become null -> 0
        const v: unknown = target[prop];
        startValues[i] = typeof v === 'number' ? v : 0;
      }

      const startValue = startValues[i] as number;
      const endValue = endValues[i] as number;
      const delta = endValue - startValue;

      const transitionValue = reversed ? transitionFunc(1.0 - ratio) : transitionFunc(ratio);
      let currentValue = startValue + transitionValue * delta;

      if (this.roundToInt) {
        currentValue = Math.round(currentValue);
      }

      target[prop] = currentValue;
    }

    if (this.eventUpdate.numListeners > 0) {
      this.eventUpdate.dispatch(...(this.updateArgs ?? []));
    }

    if (previousTime < this._totalTime && this._currentTime >= this._totalTime) {
      if (this.repeatCount == 0 || this.repeatCount > 1) {
        this._currentTime = -this.repeatDelay;
        this._currentCycle++;
        if (this.repeatCount > 1) {
          this.repeatCount--;
        }

        this.eventRepeat.dispatch(...(this.repeatArgs ?? []));
      } else {
        this.stop();

        if (this.eventComplete.numListeners > 0) {
          this.eventComplete.dispatch(...(this.completeArgs ?? []));
        }

        if (this.autoStartOfNextTween && this.nextTween != null) {
          this.nextTween.start();
        }

        // Если включено автоматическое кэширование.
        if (this.autocaching) {
          // Помещаем твин в кэш.
          AntTween.set(this, this.autocachingReset);
        }
      }
    }

    if (carryOverTime) {
      this.updateTween(carryOverTime);
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get repeatCount(): number {
    return this._repeatCount;
  }
  set repeatCount(value: number) {
    this._repeatCount = value | 0; // repeatCount:int
  }

  get isComplete(): boolean {
    return this._currentTime >= this._totalTime && this.repeatCount == 1;
  }

  get target(): AnyObject | null {
    return this._target;
  }

  get transition(): string | null {
    return this._transitionName;
  }
  set transition(value: string) {
    this._transitionName = value;
    this._transitionFunc = AntTransition.getTransition(value);
    if (this._transitionFunc == null) {
      throw new TypeError('Invalid transition: ' + value); // ArgumentError
    }
  }

  get transitionFunc(): TransitionFunc | null {
    return this._transitionFunc;
  }
  set transitionFunc(value: TransitionFunc | null) {
    this._transitionName = 'custom';
    this._transitionFunc = value;
  }

  get totalTime(): number {
    return this._totalTime;
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get delay(): number {
    return this._delay;
  }
  set delay(value: number) {
    this._currentTime = this._currentTime + this._delay - value;
    this._delay = value;
  }

  //---------------------------------------
  // CACHE
  //---------------------------------------

  static get(aTarget: AnyObject | null, aTime: number, aTransition: string | TransitionFunc = 'linear'): AntTween {
    if (AntTween._cache != null) {
      let tween: AntTween | null;
      let i = 0; // :int
      while (i < AntTween.MAX_CACHE_CAPACITY) {
        tween = (AntTween._cache[i] as AntTween | null | undefined) ?? null;
        if (tween != null) {
          AntTween._cache[i] = null;
          AntTween._numCacheItems--;
          tween.reset(aTarget, aTime, aTransition);
          return tween;
        }
        i++;
      }
    }

    return new AntTween(aTarget, aTime, aTransition);
  }

  static set(aTween: AntTween, aResetProperties = true): void {
    if (AntTween._cache == null) {
      AntTween._cache = new Array<AntTween | null>(AntTween.MAX_CACHE_CAPACITY).fill(null); // Vector.<AntTween>(30, true)
    }

    aTween.stop();

    if (aResetProperties) {
      aTween.nextTween = null;

      aTween.eventStart.clear();
      aTween.eventUpdate.clear();
      aTween.eventRepeat.clear();
      aTween.eventComplete.clear();

      aTween.startArgs = null;
      aTween.updateArgs = null;
      aTween.repeatArgs = null;
      aTween.completeArgs = null;

      aTween._target = null;
      aTween._transitionFunc = null;
      aTween._properties = null;
      aTween._startValues = null;
      aTween._endValues = null;
    }

    let i = 0; // :int
    while (i < AntTween.MAX_CACHE_CAPACITY) {
      if (AntTween._cache[i] == null) {
        AntTween._cache[i] = aTween;
        AntTween._numCacheItems++;
        return;
      }
      i++;
    }
  }

  static getNumCacheItems(): number {
    return AntTween._numCacheItems;
  }
}
