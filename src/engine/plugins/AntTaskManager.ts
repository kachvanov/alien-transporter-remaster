// Port of ru/antkarlov/anthill/plugins/AntTaskManager.as

import type { AntCamera } from '../core/AntGStub'; // STUB(T1.2): becomes ../core/AntCamera
import { AntG } from '../core/AntGStub'; // STUB(T1.2): becomes ../core/AntG
import { AntSignal } from '../signals/AntSignal';
import { AntList } from '../utils/AntList';
import type { AnyArgs, AnyFunction } from '../utils/types';
import type { IPlugin } from './IPlugin';

interface TaskRecord {
  func: AnyFunction;
  args: AnyArgs | null;
  ignoreCycle: boolean;
  instant: boolean;
}

export class AntTaskManager implements IPlugin {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventComplete: AntSignal<[AntTaskManager]>;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _task: AntList | null = null;
  protected _isStarted = false;
  protected _isPaused = false;
  protected _result = false;
  protected _cycle = false;
  protected _delay = NaN;
  protected _tag: string | null = null;
  protected _priority = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aCycle = false) {
    this._task = null;
    this._isStarted = false;
    this._isPaused = false;
    this._result = false;
    this._cycle = aCycle;
    this._delay = 0;
    this._tag = null;

    this.eventComplete = new AntSignal<[AntTaskManager]>(AntTaskManager);
  }

  destroy(): void {
    this.clear();
    this.eventComplete.destroy();
    this.eventComplete = null as unknown as AntSignal<[AntTaskManager]>;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  addTask(aFunc: AnyFunction, aArgs: AnyArgs | null = null, aIgnoreCycle = false): void {
    this.push({ func: aFunc, args: aArgs, ignoreCycle: aIgnoreCycle, instant: false });
    this.start();
  }

  addInstantTask(aFunc: AnyFunction, aArgs: AnyArgs | null = null, aIgnoreCycle = false): void {
    this.push({ func: aFunc, args: aArgs, ignoreCycle: aIgnoreCycle, instant: true });
    this.start();
  }

  addUrgentTask(aFunc: AnyFunction, aArgs: AnyArgs | null = null, aIgnoreCycle = false): void {
    this.unshift({ func: aFunc, args: aArgs, ignoreCycle: aIgnoreCycle, instant: false });
    this.start();
  }

  addUrgentInstantTask(aFunc: AnyFunction, aArgs: AnyArgs | null = null, aIgnoreCycle = false): void {
    this.unshift({ func: aFunc, args: aArgs, ignoreCycle: aIgnoreCycle, instant: true });
    this.start();
  }

  addPause(aDelay: number, aIgnoreCycle = false): void {
    this.addTask(this.taskPause, [aDelay], aIgnoreCycle);
  }

  clear(): void {
    this.stop();
    if (this._task != null) {
      this._task.destroy();
      this._task = null;
    }

    this._delay = 0;
  }

  nextTask(aIgnoreCycle = false): void {
    if (this._cycle && !aIgnoreCycle) {
      this.push(this.shift());
    } else {
      this.shift();
    }
  }

  //---------------------------------------
  // IPlugin Implementation
  //---------------------------------------

  update(): void {
    if (this._task != null && this._isStarted) {
      const task = this._task.data as TaskRecord;
      // (_task.data.func as Function).apply(this, _task.data.args); result is coerced to Boolean.
      this._result = !!(task.func as AnyFunction).apply(this, task.args ?? []);
      // NOTE: the original re-reads `_task.data` here; the task may have been replaced by the call.
      if (this._isStarted && ((this._task.data as TaskRecord).instant || this._result)) {
        this.nextTask((this._task.data as TaskRecord).ignoreCycle);
      }
    } else {
      this.stop();
      this.eventComplete.dispatch(this);
    }
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

  protected start(): void {
    if (!this._isStarted) {
      AntG.plugins.add(this);
      this._isStarted = true;
      this._isPaused = false;
    }
  }

  protected stop(): void {
    if (this._isStarted) {
      AntG.plugins.remove(this);
      this._isStarted = false;
    }
  }

  protected taskPause(aDelay: number): boolean {
    this._delay += AntG.elapsed;
    if (this._delay > aDelay) {
      this._delay = 0;
      return true;
    }

    return false;
  }

  protected push(aObj: TaskRecord | null): TaskRecord | null {
    if (aObj == null) {
      return null;
    }

    if (this._task == null) {
      this._task = new AntList(aObj);
      return aObj;
    }

    const item = new AntList(aObj);
    let cur: AntList = this._task;
    while (cur.next != null) {
      cur = cur.next;
    }

    cur.next = item;
    return aObj;
  }

  protected unshift(aObj: TaskRecord): TaskRecord {
    if (this._task == null) {
      this._task = new AntList(aObj);
      return aObj;
    }

    const item = this._task;
    this._task = new AntList(aObj, item);
    return aObj;
  }

  protected shift(): TaskRecord | null {
    if (this._task != null) {
      const item = this._task;
      const data = item.data as TaskRecord;
      this._task = item.next;
      item.next = null;
      item.destroy();
      return data;
    }

    return null;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  set pause(value: boolean) {
    if (value && !this._isPaused) {
      if (this._isStarted) {
        AntG.plugins.remove(this);
      }

      this._isPaused = true;
    } else {
      if (this._isStarted) {
        AntG.plugins.add(this);
      }

      this._isPaused = false;
    }
  }
  get pause(): boolean {
    return this._isPaused;
  }

  get isStarted(): boolean {
    return this._isStarted;
  }

  get numTasks(): number {
    if (this._task != null) {
      let num = 1; // :int
      let cur: AntList = this._task;
      while (cur.next != null) {
        cur = cur.next;
        num++;
      }

      return num;
    }

    return 0;
  }
}
