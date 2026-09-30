// STUB(T1.8): stand-in for ru/antkarlov/anthill/AntSoundManager.as.
// T1.8 ports the real AntSoundManager (src/engine/sound) and replaces this file; AntG.sounds then gets
// the real type. Declared: update() (once per tick, called by Anthill), and the calls the game code makes
// (play/stop/mute, added by T1.9a) with the signatures of the original. They do nothing.

import type { AntEntity } from './AntEntity';

export class AntSoundManagerStub {
  /** AS3 `mute` (AntSoundManager.mute): stored only. */
  mute = false;

  update(): void {}

  /** AS3 `play(aName:String, aSource:AntEntity = null, aLoop:Boolean = false, aLoops:int = 1, aVolume:Number = 1)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  play(_aName: string, _aSource: AntEntity | object | null = null, _aLoop = false, _aLoops = 1, _aVolume = 1): void {}

  /** AS3 `stop(aName:String, aSource:AntEntity = null)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  stop(_aName: string, _aSource: AntEntity | object | null = null): void {}
}
