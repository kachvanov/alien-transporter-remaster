// Port of ru/alientransporter/views/TutorialView.as

import { AntActor } from '../../engine/core/AntActor';
import { Label } from '../fonts/Label';

export class TutorialView extends AntActor {
  static readonly className = 'TutorialView';

  private _labels: Label[] | null = null;

  constructor() {
    super();
    this.addAnimationFromCache('Tutorial01_mc');
    this.addAnimationFromCache('Tutorial02_mc');
    this.addAnimationFromCache('Tutorial03_mc');
    this.addAnimationFromCache('Tutorial04_mc');
    this.addAnimationFromCache('Tutorial05_mc');
    this.addAnimationFromCache('Tutorial06_mc');
  }

  addLabel(aX: number, aY: number, aText: string): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    if (this._labels == null) {
      this._labels = [];
    }

    // (the original never puts the label into `_labels`: kill() below frees nothing)
    const label = this.recycle(Label) as Label;
    label.fontName = 'font05';
    label.text = aText;
    label.reset(aX - label.width * 0.5, aY - label.height * 0.5);
    label.revive();
  }

  override kill(): void {
    super.kill();
    if (this._labels != null) {
      let i = 0; // :* (an int in practice)
      const n = this._labels.length | 0;
      while (i < n) {
        this._labels[i]!.kill();
        this._labels[i++] = null as unknown as Label; // AS3: _labels[i++] = null
      }

      this._labels.length = 0;
      this._labels = null;
    }
  }
}
