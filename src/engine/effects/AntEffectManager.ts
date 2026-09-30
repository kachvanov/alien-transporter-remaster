// STUB(T2.3): stand-in for ru/antkarlov/anthill/extensions/effects/{AntEffectManager,AntEffectEmitter}.as.
// T2.3 ports the effect system into src/engine/effects and replaces this file. Only what the data and
// component classes of T1.9a call is declared, with the signatures of the original.

import { AntEntity } from '../core/AntEntity';

export class AntEffectEmitter extends AntEntity {
  name: string | null = null;
  target: AntEntity | null = null;
}

export class AntEffectManager {
  private static _instance: AntEffectManager | null = null;

  lowQuality = false;

  static getInstance(): AntEffectManager {
    if (AntEffectManager._instance == null) {
      AntEffectManager._instance = new AntEffectManager();
    }
    return AntEffectManager._instance;
  }

  /** AS3 `makeEffect(aX:int, aY:int, aName:String, aLayer:AntEntity):AntEffectEmitter`. */
  static makeEffect(aX: number, aY: number, aName: string, aLayer: AntEntity): AntEffectEmitter {
    const emitter = new AntEffectEmitter();
    emitter.name = aName;
    emitter.x = aX | 0;
    emitter.y = aY | 0;
    aLayer.add(emitter);
    return emitter;
  }
}
