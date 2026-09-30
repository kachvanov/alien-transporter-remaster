// STUB(T1.9d): stand-in for ru/alientransporter/ai/Schedule.as.
// T1.9d ports the real class (tasks, interrupts) and replaces this file.
// Declared: what components/AIBehavior.ts calls.

import type { ConditionList } from './ConditionList';

export class Schedule {
  userData: unknown = null;

  private _name: string;

  constructor(aName: string) {
    this._name = aName;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reset(_aUserData: unknown = null): void {}

  update(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isFinished(_aConditions: ConditionList): boolean {
    return true;
  }

  get name(): string {
    return this._name;
  }
}
