// Port of ru/alientransporter/ai/Schedule.as
//
// The task functions of the subclasses are arrow-function properties (AS3 method closures are bound to `this`).

import type { AnyArgs, AnyFunction } from '../../engine/utils/types';
import { ConditionList } from './ConditionList';

/** AS3 `Object` {taskFunction, taskArguments, instant} of the task list. */
interface ScheduleTask {
  taskFunction: AnyFunction;
  taskArguments: AnyArgs | null;
  instant: boolean;
}

export class Schedule {
  userData: unknown = null; // AS3 `*`

  protected _name: string;
  protected _taskList: ScheduleTask[];
  protected _interruptsList: ConditionList;
  protected _currentTask: ScheduleTask | null = null;
  protected _currentIndex = 0; // int
  protected _previousIndex = 0; // int
  protected _isFinished = false;
  protected _result = false;

  constructor(aName: string) {
    // super();
    this._name = aName;
    this._taskList = [];
    this._interruptsList = new ConditionList();
  }

  reset(aUserData: unknown = null): void {
    this.userData = aUserData;
    this._currentTask = null;
    this._previousIndex = -1;
    this._currentIndex = 0;
    this._isFinished = false;
  }

  addTask(aFunction: AnyFunction, aArguments: AnyArgs | null = null): void {
    this._taskList.push({
      taskFunction: aFunction,
      taskArguments: aArguments,
      instant: false,
    });
  }

  addInstantTask(aFunction: AnyFunction, aArguments: AnyArgs | null = null): void {
    this._taskList.push({
      taskFunction: aFunction,
      taskArguments: aArguments,
      instant: true,
    });
  }

  addInterrupt(aCondition: string): void {
    this._interruptsList.add(aCondition);
  }

  update(): void {
    if (!this._isFinished) {
      if (this._currentIndex != this._previousIndex) {
        this._currentTask = this._taskList[this._currentIndex] as ScheduleTask;
        this._previousIndex = this._currentIndex;
      }

      if (this._currentTask != null) {
        // `_result:Boolean`: the result of the task function is coerced to Boolean.
        this._result = !!this._currentTask.taskFunction.apply(this, this._currentTask.taskArguments ?? []);
        if (this._result || Boolean(this._currentTask.instant)) {
          ++this._currentIndex;
          if (this._currentIndex >= this._taskList.length) {
            this.complete();
          }
        }
      } else {
        this.complete();
      }
    }
  }

  isFinished(aConditions: ConditionList): boolean {
    if (this._isFinished || this._interruptsList.overlap(aConditions)) {
      this.reset();
      return true;
    }

    return false;
  }

  protected complete(): void {
    this._isFinished = true;
  }

  get name(): string {
    return this._name;
  }
}
