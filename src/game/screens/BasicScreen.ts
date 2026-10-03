// Port of ru/alientransporter/screens/BasicScreen.as
//
// DEVIATION: the methods that the screens hand to an AntTaskManager or a signal (`onMakeBackground`, `onMakeButton`)
// are arrow-function fields (a bound method in AS3 is a closure of the instance); a subclass overrides them with a
// field of its own (GameScreen.onMakeButton).

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntSignal } from '../../engine/signals/AntSignal';
import { G } from '../G';
import type { MenuSystem } from '../systems/MenuSystem';
import { Button } from './Button';
import { ButtonController } from './ButtonController';

export class BasicScreen {
  menu!: MenuSystem;
  eventInitialized: AntSignal<[BasicScreen]>;

  protected _actors!: AntActor[];
  protected _buttons!: Button[];
  protected _buttonController: ButtonController | null = null;

  constructor() {
    this.eventInitialized = new AntSignal<[BasicScreen]>(BasicScreen);
  }

  init(): void {
    this.eventInitialized.dispatch(this);
  }

  create(): void {
    this._actors = [];
    this._buttons = [];
    this._buttonController = new ButtonController(this._buttons);
    // DEVIATION (ES module cycles, see systems/MenuSystem.ts): `G.core.getSystem(MenuSystem)` is looked up by the
    // class name of the system, BasicScreen does not import MenuSystem as a value.
    this.menu = G.core
      .getSystems()
      .find((aSystem) => (aSystem.constructor as { className?: string }).className == 'MenuSystem') as MenuSystem;
  }

  destroy(): void {
    let i = 0; // :int
    let n = this._actors.length | 0; // :int
    while (i < n) {
      this._actors[i++]!.kill();
    }

    i = 0;
    n = this._buttons.length | 0;
    while (i < n) {
      this._buttons[i++]!.kill();
    }

    this._actors.length = 0;
    this._buttons.length = 0;
    (this._buttonController as ButtonController).destroy();
    this._buttonController = null;
    this.eventInitialized.clear();
  }

  removeListeners(): void {
    let i = (this._buttons.length - 1) | 0; // :int
    while (i >= 0) {
      this._buttons[i--]!.removeButtonListeners();
    }
  }

  update(): void {
    if (this._buttonController != null) {
      this._buttonController.update();
    }
  }

  /** AS3 `onMakeBackground(aX:int, aY:int, aAnimName:String):AntActor`. */
  protected onMakeBackground = (aX: number, aY: number, aAnimName: string): AntActor => {
    aX = aX | 0;
    aY = aY | 0;
    const actor = G.gameState.layerMenuBG.recycle(AntActor) as AntActor;
    actor.clearAnimations();
    actor.addAnimationFromCache(aAnimName);
    actor.reset(aX, aY);
    actor.isScrolled = false;
    actor.revive();
    actor.z = 0;
    G.gameState.layerMenuBG.sort('z');
    this._actors.push(actor);
    return actor;
  };

  /**
   * AS3 `onMakeButton(aX:int, aY:int, aAnimName:String, aShadowName:String, aCallback:Function, aSelected:Boolean =
   * false, aTag:int = 0, aAnimate:Boolean = true, aRadius:Number = 0, aCaption:String = null):Button`.
   */
  protected onMakeButton: (
    aX: number,
    aY: number,
    aAnimName: string,
    aShadowName: string | null,
    aCallback: (aButton: AntButton) => void,
    aSelected?: boolean,
    aTag?: number,
    aAnimate?: boolean,
    aRadius?: number,
    aCaption?: string | null,
  ) => Button = (
    aX,
    aY,
    aAnimName,
    aShadowName,
    aCallback,
    aSelected = false,
    aTag = 0,
    aAnimate = true,
    aRadius = 0,
    aCaption = null,
  ) => {
    aX = aX | 0;
    aY = aY | 0;
    aTag = aTag | 0;
    const button = G.gameState.layerMenu.recycle(Button) as Button;
    button.create(aX, aY, aAnimName, aCallback, aTag);
    button.createShadow(aShadowName);
    button.selected = aSelected;
    button.caption = aCaption;
    button.revive();
    button.show(aAnimate);
    if (aRadius > 0) {
      button.radius = aRadius;
    }

    this._buttons.push(button);
    return button;
  };
}
