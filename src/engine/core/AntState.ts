// Port of ru/antkarlov/anthill/AntState.as
//
// The original extends flash.display.Sprite (a container of the camera sprites); there is no display
// list here. debugDraw() is not ported.

import type { AntCamera } from './AntCamera';
import { AntEntity } from './AntEntity';

export class AntState {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  defGroup: AntEntity | null;
  /** `add = defGroup.add` (a bound method closure in AS3). */
  add: (aChild: AntEntity) => AntEntity;
  /** `remove = defGroup.remove` (a bound method closure in AS3). */
  remove: (aChild: AntEntity, aSplice?: boolean) => AntEntity;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this.defGroup = new AntEntity();
    const group = this.defGroup;
    this.add = (aChild) => group.add(aChild);
    this.remove = (aChild, aSplice = false) => group.remove(aChild, aSplice);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  create(): void {}

  destroy(): void {}

  preUpdate(): void {}

  update(): void {
    if (this.defGroup != null && this.defGroup.exists && this.defGroup.active) {
      this.defGroup.preUpdate();
      this.defGroup.update();
      this.defGroup.postUpdate();
    }
  }

  postUpdate(): void {}

  draw(aCamera: AntCamera): void {
    if (this.defGroup != null && this.defGroup.exists && this.defGroup.visible) {
      this.defGroup.draw(aCamera);
    }
  }
}
