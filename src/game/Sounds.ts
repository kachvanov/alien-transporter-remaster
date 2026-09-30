// Port of ru/alientransporter/Sounds.as
//
// DEVIATION: the original keeps the embedded `Sounds_SndXxx` classes and registers them in AntG.sounds under a
// name. A class is here the name of the sound in the catalog (assets/sounds.json: `SndXxx`), see
// AntSoundManager.addEmbedded(). The table EMBEDDED is the alias table: the first five sounds are played
// under the names `CollisionGround01_snd`, `EngineGas_snd`, ..., the rest under their own names.
// Config.STREAM_SOUNDS (initStream) is false and has no port: the sounds are never loaded by URL.

import { AntG } from '../engine/core/AntG';

/** [class (catalog name), name the game plays it under] in the order of Sounds.initEmbedded(). */
export const EMBEDDED_SOUNDS: readonly (readonly [string, string])[] = [
  ['SndCollisionGround01', 'CollisionGround01_snd'],
  ['SndCollisionGround02', 'CollisionGround02_snd'],
  ['SndEngineLost', 'EngineLost_snd'],
  ['SndEngineGas', 'EngineGas_snd'],
  ['SndHitHero', 'HitHero_snd'],
  ['SndPassengerComeIn', 'SndPassengerComeIn'],
  ['SndPassengerComeOut', 'SndPassengerComeOut'],
  ['SndPassengerHello01', 'SndPassengerHello01'],
  ['SndPassengerHello02', 'SndPassengerHello02'],
  ['SndPassengerHello03', 'SndPassengerHello03'],
  ['SndPickupCoin01', 'SndPickupCoin01'],
  ['SndPickupCoin02', 'SndPickupCoin02'],
  ['SndPickupCoin03', 'SndPickupCoin03'],
  ['SndSpawnCoin01', 'SndSpawnCoin01'],
  ['SndSpawnCoin02', 'SndSpawnCoin02'],
  ['SndSpawnCoin03', 'SndSpawnCoin03'],
  ['SndHitBox01', 'SndHitBox01'],
  ['SndHitBox02', 'SndHitBox02'],
  ['SndHitBox03', 'SndHitBox03'],
  ['SndHitBarrel01', 'SndHitBarrel01'],
  ['SndHitBarrel02', 'SndHitBarrel02'],
  ['SndHitBarrel03', 'SndHitBarrel03'],
  ['SndHitRock', 'SndHitRock'],
  ['SndKillObject01', 'SndKillObject01'],
  ['SndKillObject02', 'SndKillObject02'],
  ['SndKillObject03', 'SndKillObject03'],
  ['SndKillRock', 'SndKillRock'],
  ['SndBarrelExplosion', 'SndBarrelExplosion'],
  ['SndLoadPassenger', 'SndLoadPassenger'],
  ['SndLowFuelAlarm', 'SndLowFuelAlarm'],
  ['SndFuelRefill', 'SndFuelRefill'],
  ['SndPortalOpen', 'SndPortalOpen'],
  ['SndPortalIdle', 'SndPortalIdle'],
  ['SndPortalAction', 'SndPortalAction'],
  ['SndShuttleSpawn', 'SndShuttleSpawn'],
  ['SndShuttleExplosion01', 'SndShuttleExplosion01'],
  ['SndSensorAlarm', 'SndSensorAlarm'],
  ['SndMissileExplosion', 'SndMissileExplosion'],
  ['SndMissileShot', 'SndMissileShot'],
  ['SndShowButton', 'SndShowButton'],
  ['SndClickButton', 'SndClickButton'],
  ['SndOverButton', 'SndOverButton'],
  ['SndHideScreen', 'SndHideScreen'],
  ['SndShowScreen', 'SndShowScreen'],
  ['SndNotifyCompleted', 'SndNotifyCompleted'],
  ['SndNotifyStars', 'SndNotifyStars'],
  ['SndGameOver', 'SndGameOver'],
  ['SndBonusRepair', 'SndBonusRepair'],
  ['SndBonusFuel', 'SndBonusFuel'],
  ['SndBonusHeart', 'SndBonusHeart'],
  ['SndBonusTrophy', 'SndBonusTrophy'],
  ['SndMissionCompleted', 'SndMissionCompleted'],
];

export class Sounds {
  //---------------------------------------
  // CLASS METHODS
  //---------------------------------------

  static init(): void {
    Sounds.initEmbedded();
  }

  private static initEmbedded(): void {
    for (const [cls, name] of EMBEDDED_SOUNDS) {
      AntG.sounds.addEmbedded(cls, name);
    }
  }
}
