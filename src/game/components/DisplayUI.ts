// Port of ru/alientransporter/components/DisplayUI.as

import type { ShuttleUIView } from '../ui/ShuttleUIView'; // STUB(T1.9e)

export class DisplayUI {
  static readonly className = 'DisplayUI';

  view: ShuttleUIView;

  constructor(aView: ShuttleUIView) {
    // super();
    this.view = aView;
  }

  destroy(): void {
    this.view.kill();
    this.view = null as unknown as ShuttleUIView; // AS3: view = null
  }
}
