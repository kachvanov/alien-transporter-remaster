// Port of ru/alientransporter/ai/ConditionList.as

export class ConditionList {
  static readonly MAX_CONDITIONS = 10; // int

  private _conditions: (string | null)[];

  constructor() {
    // super();
    // new Vector.<String>(MAX_CONDITIONS, true): fixed length, the elements are null
    this._conditions = new Array<string | null>(ConditionList.MAX_CONDITIONS).fill(null);
  }

  add(aCondition: string): void {
    if (!this.contains(aCondition)) {
      let i = 0; // :int
      while (i < ConditionList.MAX_CONDITIONS) {
        if (this._conditions[i] == null) {
          this._conditions[i] = aCondition;
          return;
        }

        i++;
      }
    }
  }

  contains(aCondition: string): boolean {
    const index = this._conditions.indexOf(aCondition); // :int
    return index >= 0 && index < ConditionList.MAX_CONDITIONS;
  }

  overlap(aList: ConditionList): boolean {
    const conditions = aList.conditions;
    let i = 0;
    while (i < ConditionList.MAX_CONDITIONS) {
      const condition = conditions[i++];
      if (condition != null && this.contains(condition)) {
        return true;
      }
    }

    return false;
  }

  remove(aCondition: string): void {
    const index = this._conditions.indexOf(aCondition); // :int
    if (index >= 0 && index < ConditionList.MAX_CONDITIONS) {
      this._conditions[index] = null;
    }
  }

  clear(): void {
    let i = 0;
    while (i < ConditionList.MAX_CONDITIONS) {
      this._conditions[i++] = null;
    }
  }

  copyTo(aResult: ConditionList | null = null): ConditionList {
    if (aResult == null) {
      aResult = new ConditionList();
    }

    aResult.clear();
    let i = 0; // :int
    while (i < ConditionList.MAX_CONDITIONS) {
      if (this._conditions[i] != null) {
        aResult.add(this._conditions[i] as string);
      }

      i++;
    }

    return aResult;
  }

  get conditions(): (string | null)[] {
    return this._conditions;
  }

  toString(): string {
    let result = '';
    let i = 0; // :int
    while (i < ConditionList.MAX_CONDITIONS) {
      if (this._conditions[i] != null) {
        result += i > 0 ? ', ' + this._conditions[i] : this._conditions[i];
      }

      i++;
    }

    return result;
  }
}
