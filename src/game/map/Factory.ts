// STUB(T1.9b): stand-in for ru/alientransporter/map/Factory.as.
// T1.9b ports the real Factory (all make* functions) and replaces this file. Only the functions the
// components of T1.9a call are declared; they only create an AntObject so that the callers run (makeCoin
// gives it a Display with an empty actor, as the real coin has).

import { AntObject } from '../../engine/ants/AntObject';
import { AntActor } from '../../engine/core/AntActor';
import { Display } from '../components/Display';

export class Factory {
  /** AS3 `makeCoin(aX:int, aY:int):AntObject`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeCoin(_aX: number, _aY: number): AntObject {
    return new AntObject().add(new Display(new AntActor()));
  }

  /** AS3 `makeShuttle(aX:int, aY:int, aPlayer:String):AntObject`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeShuttle(_aX: number, _aY: number, _aPlayer: string): AntObject {
    return new AntObject();
  }

  /** AS3 `makeMissile(aX:int, aY:int, aAngle:Number, aCallback:Function = null):AntObject`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeMissile(_aX: number, _aY: number, _aAngle: number, _aCallback: (() => void) | null = null): AntObject {
    return new AntObject();
  }
}
