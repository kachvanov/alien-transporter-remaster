// Port of ru/alientransporter/data/GameData.as
//
// DEVIATION (docs/04-porting-guide.md section 4): AntCookie (SharedObject) is replaced by a synchronous
// key/object store, `GameData.storage`. The object the original writes with `cookie.write("data", obj)`
// is stored as is under SAVE_KEY. The simulation reads saves synchronously, so the real store is a cache
// that GameLoop.init fills beforehand (SaveStorage, the files of electron/save.ts); `GameData.storage` is set by the host.
//
// DEVIATION: SAVE_KEY is "alientransporter" (T1.9a card), the original constant is "AlienTransporter".

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import type { AnyObject } from '../../engine/utils/types';
import { Config } from '../Config';
import { G } from '../G';
import { TOTAL_LEVELS } from '../levels/TotalLevels';
import { LevelData } from './LevelData';
import { PlayerData } from './PlayerData';

/** Synchronous view of the save storage: what AntCookie.open(SAVE_KEY) / read / write / clear did. */
export interface GameSaveStorage {
  /** The stored object of the key or null. */
  read(aKey: string): AnyObject | null;
  write(aKey: string, aData: AnyObject): void;
  clear(aKey: string): void;
}

/**
 * The in-memory storage: the default of GameData.storage and the one the tests use. The simulation host installs
 * CachedGameSaveStorage (src/sim/SaveStorage.ts) over the files of userData (electron/save.ts, T2.8) when the loop starts.
 * Objects are kept as a JSON round trip, like a real file would.
 */
export class MemoryGameSaveStorage implements GameSaveStorage {
  private _data = new Map<string, string>();

  read(aKey: string): AnyObject | null {
    const json = this._data.get(aKey);
    return json === undefined ? null : (JSON.parse(json) as AnyObject);
  }

  write(aKey: string, aData: AnyObject): void {
    this._data.set(aKey, JSON.stringify(aData));
  }

  clear(aKey: string): void {
    this._data.delete(aKey);
  }
}

/** The look of a ship (the four uint fields of PlayerData). */
export interface ShipLook {
  shuttleKind: number;
  shuttleColor: number;
  engineKind: number;
  engineColor: number;
}

export class GameData {
  static readonly className = 'GameData';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly SAVE_KEY = 'alientransporter';

  /** DEVIATION: replaces AntCookie, see the header. */
  static storage: GameSaveStorage = new MemoryGameSaveStorage();

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  currentLevelName: string | null;
  nextLevelName: string | null;
  goalA: number;
  goalB: number;
  goalC: number;
  goalMax: number;
  defRecord: number;
  muteMusic: boolean;
  muteSounds: boolean;
  fancyEffects: boolean;
  fancyQuality: boolean;
  casualMode: boolean;
  toUnlockNextLevel: boolean;
  isTwoPlayerMode: boolean;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _playerData!: PlayerData[];
  private _levelData!: LevelData[];
  private _hasSaveData: boolean;
  /** DEVIATION: online (T3.6): the ship of a player that a network player flies for the time of the session. */
  private _shipBackup: Map<string, ShipLook> = new Map();

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this.currentLevelName = 'Level01';
    this.nextLevelName = null;
    this.goalA = 20;
    this.goalB = 40;
    this.goalC = 60;
    this.goalMax = 80;
    this.defRecord = 25;
    this.muteMusic = false;
    this.muteSounds = false;
    this.fancyEffects = false;
    this.fancyQuality = true;
    this.casualMode = true;
    this.toUnlockNextLevel = false;
    this.isTwoPlayerMode = false;
    this.resetData();
    this._hasSaveData = false;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private resetData(): void {
    this._shipBackup.clear();
    this._playerData = [new PlayerData(PlayerData.PLAYER1), new PlayerData(PlayerData.PLAYER2)];
    this._levelData = [];
    let i = 0; // :int
    while (i < TOTAL_LEVELS) {
      this._levelData[this._levelData.length] = new LevelData(i + 1);
      i++;
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  getPrevRecord(): number {
    return this.defRecord;
  }

  success(): void {
    let i = 0;
    const n = this._playerData.length | 0; // :int
    while (i < n) {
      this._playerData[i++]!.success();
    }

    this.isTwoPlayerMode = false;
  }

  failure(): void {
    let i = 0;
    const n = this._playerData.length | 0; // :int
    while (i < n) {
      this._playerData[i++]!.failure();
    }

    this.isTwoPlayerMode = false;
  }

  giveLives(aPlayer: string, aValue: number): void {
    const data = this.getPlayerData(aPlayer);
    if (data != null) {
      data.lives = (data.lives + (aValue | 0)) | 0;
    }
  }

  takeLives(aPlayer: string, aValue: number): void {
    const data = this.getPlayerData(aPlayer);
    if (data != null) {
      data.lives = (data.lives - (aValue | 0)) | 0;
    }
  }

  getLives(aPlayer: string): number {
    const data = this.getPlayerData(aPlayer);
    return data != null ? data.lives : 0;
  }

  resetLives(aPlayer: string, aValue = 0): void {
    const data = this.getPlayerData(aPlayer);
    if (data != null) {
      data.lives = aValue | 0;
    }
  }

  giveCoins(aPlayer: string, aValue: number): void {
    const data = this.getPlayerData(aPlayer);
    if (data != null) {
      data.coins = (data.coins + (aValue | 0)) | 0;
    }
  }

  takeCoins(aPlayer: string, aValue: number): void {
    const data = this.getPlayerData(aPlayer);
    if (data != null) {
      data.coins = (data.coins - (aValue | 0)) | 0;
    }
  }

  getCoins(aPlayer: string): number {
    const data = this.getPlayerData(aPlayer);
    return data != null ? data.coins : 0;
  }

  resetCoins(aPlayer: string, aValue = 0): void {
    const data = this.getPlayerData(aPlayer);
    if (data != null) {
      data.coins = aValue | 0;
    }
  }

  setLevelStars(aLevelName: string, aStars: number, aForce = false): void {
    aStars = aStars | 0;
    const data = this.getLevelData(aLevelName);
    if (data != null) {
      if (data.stars < aStars || aForce) {
        data.stars = aStars;
      }
    }
  }

  setNextLevelName(aName: string): void {
    this.nextLevelName = aName;
    this.toUnlockNextLevel = true;
  }

  nextLevel(): void {
    this.currentLevelName = this.nextLevelName;
    this.nextLevelName = null;
    this.toUnlockNextLevel = false;
  }

  /**
   * DEVIATION: online (T3.6). A network player flies the ship of `aPlayer` with its own look for the time of the session:
   * the ship fields of the PlayerData are replaced, and `saveData()` keeps writing the real ones. Repeated calls
   * replace the look, the real one is remembered by the first call.
   */
  overrideShip(aPlayer: string, aShip: ShipLook): void {
    const data = this.getPlayerData(aPlayer);
    if (data == null) {
      return;
    }

    if (!this._shipBackup.has(aPlayer)) {
      this._shipBackup.set(aPlayer, {
        shuttleKind: data.shuttleKind,
        shuttleColor: data.shuttleColor,
        engineKind: data.engineKind,
        engineColor: data.engineColor,
      });
    }

    data.shuttleKind = aShip.shuttleKind >>> 0;
    data.shuttleColor = aShip.shuttleColor >>> 0;
    data.engineKind = aShip.engineKind >>> 0;
    data.engineColor = aShip.engineColor >>> 0;
  }

  /** DEVIATION: online (T3.6). The real ship of `aPlayer` comes back (nothing happens without an override). */
  restoreShip(aPlayer: string): void {
    const backup = this._shipBackup.get(aPlayer);
    const data = this.getPlayerData(aPlayer);
    this._shipBackup.delete(aPlayer);
    if (backup != null && data != null) {
      data.shuttleKind = backup.shuttleKind;
      data.shuttleColor = backup.shuttleColor;
      data.engineKind = backup.engineKind;
      data.engineColor = backup.engineColor;
    }
  }

  /** DEVIATION: online (T3.6): `aPlayer` flies a ship of a network player. */
  hasShipOverride(aPlayer: string): boolean {
    return this._shipBackup.has(aPlayer);
  }

  getPlayerData(aName: string): PlayerData | null {
    let i = 0; // :int
    const n = this._playerData.length | 0; // :int
    while (i < n) {
      if (this._playerData[i]!.name == aName) {
        return this._playerData[i]!;
      }

      i++;
    }

    return null;
  }

  getLevelData(aName: string): LevelData | null {
    let i = 0; // :int
    const n = this._levelData.length | 0; // :int
    while (i < n) {
      if (this._levelData[i]!.name == aName) {
        return this._levelData[i]!;
      }

      i++;
    }

    return null;
  }

  getLevelDataAt(aIndex: number): LevelData | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._levelData.length ? this._levelData[aIndex]! : null;
  }

  clearData(): void {
    this.resetData();
    GameData.storage.clear(GameData.SAVE_KEY);
  }

  saveData(): void {
    let i = 0; // :int
    const players: AnyObject[] = [];
    while (i < this._playerData.length) {
      const player = this._playerData[i++]!;
      const object = player.toObject();
      const real = this._shipBackup.get(player.name); // DEVIATION: online (T3.6), the override is not saved
      if (real != null) {
        object['shuttleKind'] = real.shuttleKind;
        object['shuttleColor'] = real.shuttleColor;
        object['engineKind'] = real.engineKind;
        object['engineColor'] = real.engineColor;
      }

      players.push(object);
    }

    i = 0;
    const levels: AnyObject[] = [];
    while (i < this._levelData.length) {
      levels.push(this._levelData[i++]!.toObject());
    }

    const data: AnyObject = {
      currentLevelName: this.currentLevelName,
      muteMusic: this.muteMusic,
      muteSounds: this.muteSounds,
      fancyEffects: this.fancyEffects,
      fancyQuality: this.fancyQuality,
      casualMode: this.casualMode,
      players: players,
      levels: levels,
      missions: G.missions.toObject(),
      content: G.content.toObject(),
      keyP1Gas: Config.keyP1Gas,
      keyP1Left: Config.keyP1Left,
      keyP1Right: Config.keyP1Right,
      keyP2Gas: Config.keyP2Gas,
      keyP2Left: Config.keyP2Left,
      keyP2Right: Config.keyP2Right,
    };
    GameData.storage.write(GameData.SAVE_KEY, data);
    this._hasSaveData = true;
  }

  loadData(): void {
    const data = GameData.storage.read(GameData.SAVE_KEY);
    if (data != null) {
      const has = (aKey: string): boolean => Object.prototype.hasOwnProperty.call(data, aKey);
      let i = 0; // :int
      const players = data['players'] as AnyObject[];
      while (i < players.length) {
        this._playerData[i]!.fromObject(players[i]!);
        i++;
      }

      i = 0;
      const levels = data['levels'] as AnyObject[];
      while (i < levels.length) {
        this._levelData[i]!.fromObject(levels[i]!);
        i++;
      }

      G.missions.fromObject(data['missions']);
      G.content.fromObject(data['content']);
      this.currentLevelName = data['currentLevelName'] as string;
      // this.muteMusic = G.music.mute = data.muteMusic;
      G.music.mute = Boolean(data['muteMusic']);
      this.muteMusic = Boolean(data['muteMusic']);
      // this.muteSounds = AntG.sounds.mute = data.muteSounds;
      AntG.sounds.mute = Boolean(data['muteSounds']);
      this.muteSounds = Boolean(data['muteSounds']);
      this.fancyEffects = has('fancyEffects') ? Boolean(data['fancyEffects']) : false;
      this.fancyQuality = has('fancyQuality') ? Boolean(data['fancyQuality']) : true;
      this.casualMode = has('casualMode') ? Boolean(data['casualMode']) : true;
      Config.keyP1Gas = has('keyP1Gas') ? (data['keyP1Gas'] as string) : 'UP';
      Config.keyP1Left = has('keyP1Left') ? (data['keyP1Left'] as string) : 'LEFT';
      Config.keyP1Right = has('keyP1Right') ? (data['keyP1Right'] as string) : 'RIGHT';
      Config.keyP2Gas = has('keyP2Gas') ? (data['keyP2Gas'] as string) : 'W';
      Config.keyP2Left = has('keyP2Left') ? (data['keyP2Left'] as string) : 'A';
      Config.keyP2Right = has('keyP2Right') ? (data['keyP2Right'] as string) : 'D';
      AntEffectManager.getInstance().lowQuality = !this.fancyEffects;
      G.gameState.setFancyQuality(this.fancyQuality);
      this._hasSaveData = true;
    } else {
      this._hasSaveData = false;
    }
  }

  get hasSaveData(): boolean {
    return this._hasSaveData;
  }
}
