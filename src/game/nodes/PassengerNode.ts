// Port of ru/alientransporter/nodes/PassengerNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { AIBehavior } from '../components/AIBehavior';
import { Display } from '../components/Display';
import { Info } from '../components/Info';
import { PassengerMediator } from '../components/PassengerMediator';
import { WaitingTimer } from '../components/WaitingTimer';
import { PassengerModel } from '../models/PassengerModel';

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class PassengerNode extends AntNode {
  static readonly className = 'PassengerNode';
  static override readonly components = {
    info: Info,
    display: Display,
    model: PassengerModel,
    behavior: AIBehavior,
    mediator: PassengerMediator,
    timer: WaitingTimer,
  } as const;

  info!: Info;
  display!: Display;
  model!: PassengerModel;
  behavior!: AIBehavior;
  mediator!: PassengerMediator;
  timer!: WaitingTimer;

  constructor() {
    super();
  }
}
