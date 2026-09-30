// STUB(T2.1): stand-in for ru/alientransporter/views/TutorialView.as.
// The owner task ports the real view and replaces this file. Declared: the animations of the constructor of the
// original (map/Factory.makeTutorial switches them) and what components/Tutorial.ts calls.

import { AntActor } from '../../engine/core/AntActor';

export class TutorialView extends AntActor {
  static readonly className = 'TutorialView';

  constructor() {
    super();
    this.addAnimationFromCache('Tutorial01_mc');
    this.addAnimationFromCache('Tutorial02_mc');
    this.addAnimationFromCache('Tutorial03_mc');
    this.addAnimationFromCache('Tutorial04_mc');
    this.addAnimationFromCache('Tutorial05_mc');
    this.addAnimationFromCache('Tutorial06_mc');
  }

  /** AS3 `addLabel(aX:int, aY:int, aText:String)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addLabel(_aX: number, _aY: number, _aText: string): void {}
}
