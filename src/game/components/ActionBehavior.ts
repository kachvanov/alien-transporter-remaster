// Port of ru/alientransporter/components/ActionBehavior.as

import type { IActionComponent } from './IActionComponent';

export class ActionBehavior {
  static readonly className = 'ActionBehavior';

  action: IActionComponent;

  constructor(aAction: IActionComponent) {
    // super();
    this.action = aAction;
  }

  destroy(): void {
    this.action = null as unknown as IActionComponent; // AS3: action = null
  }

  call(aName: string): void {
    this.action.call(aName);
  }
}
