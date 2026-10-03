// Port of ru/alientransporter/components/Tutorial.as

import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { Config } from '../Config';
import type { TutorialView } from '../views/TutorialView';
import type { IActionComponent } from './IActionComponent';

export class Tutorial implements IActionComponent {
  static readonly className = 'Tutorial';

  view: TutorialView;
  private _isActive: boolean;
  private _tween: AntTween;

  constructor(aView: TutorialView) {
    // super();
    this.view = aView;
    this._isActive = true;
    this._tween = new AntTween(this.view, 0.5, AntTransition.LINEAR);
    this._tween.autocaching = false;
  }

  destroy(): void {
    this.view.kill();
    this.view = null as unknown as TutorialView; // AS3: view = null
    this._tween = null as unknown as AntTween; // AS3: _tween = null
  }

  get animation(): string | null {
    return this.view.currentAnimation;
  }
  set animation(value: string | null) {
    this.view.switchAnimation(value as string);
    switch (value) {
      case 'Tutorial01_mc':
        this.view.addLabel(0, 0, Config.availKeys.getString(Config.keyP1Gas));
        this.view.addLabel(-29, 28, Config.availKeys.getString(Config.keyP1Left));
        this.view.addLabel(29, 28, Config.availKeys.getString(Config.keyP1Right));
        break;
      case 'Tutorial06_mc':
        this.view.addLabel(0, 0, Config.availKeys.getString(Config.keyP2Gas));
        this.view.addLabel(-29, 28, Config.availKeys.getString(Config.keyP2Left));
        this.view.addLabel(29, 28, Config.availKeys.getString(Config.keyP2Right));
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }
  set visible(value: boolean) {
    if (!this.view.visible && value) {
      this.view.visible = true;
      this.view.alpha = 0;
      this._tween.reset(this.view, 0.5, AntTransition.LINEAR);
      this._tween.animate('alpha', 1);
      this._tween.start();
    } else if (this.view.visible && !value) {
      this.view.alpha = 1;
      this._tween.reset(this.view, 0.5, AntTransition.LINEAR);
      this._tween.animate('alpha', 0);
      this._tween.eventComplete.add(this.onHideCompleted);
      this._tween.start();
    }
  }

  private onHideCompleted = (): void => {
    this._tween.eventComplete.remove(this.onHideCompleted);
    this.view.visible = false;
  };

  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(value: boolean) {
    this._isActive = value;
  }

  // AS3 param1:String (unused)
  call(): void {
    this.visible = !this.visible;
  }
}
