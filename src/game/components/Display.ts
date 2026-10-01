// Port of ru/alientransporter/components/Display.as

import type { AntActor } from '../../engine/core/AntActor';
import { asType } from '../../engine/utils/cast';
import { PassengerView } from '../views/PassengerView';
import { ShuttleView } from '../views/ShuttleView';

export class Display {
  static readonly className = 'Display';

  view: AntActor;

  constructor(aView: AntActor) {
    // super();
    this.view = aView;
  }

  destroy(): void {
    this.view.kill();
    this.view = null as unknown as AntActor; // AS3: view = null
  }

  get passenger(): PassengerView | null {
    return asType(this.view, PassengerView);
  }

  get shuttle(): ShuttleView | null {
    return asType(this.view, ShuttleView);
  }
}
