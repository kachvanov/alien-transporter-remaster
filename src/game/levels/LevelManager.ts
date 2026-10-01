// Port of ru/alientransporter/levels/LevelManager.as
//
// DEVIATION: the level classes Level01..Level20 of the original (empty subclasses of LevelCore that only set
// the clip classes) are one class per number made by levelClass(n) (levels/Level.ts): `new LevelCore(n)`.

import { AntSignal } from '../../engine/signals/AntSignal';
import { asType } from '../../engine/utils/cast';
import type { Ctor } from '../../engine/utils/types';
import { Config } from '../Config';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';
import { LevelCore } from '../map/LevelCore';
import { UISystem } from '../systems/UISystem';
import { levelClass } from './Level';
import { TOTAL_LEVELS } from './TotalLevels';

/** One registered level (`{num, key, instance}` of the original). */
export interface LevelRecord {
  num: number; // int
  key: string;
  instance: Ctor<LevelCore>;
}

export class LevelManager {
  static readonly className = 'LevelManager';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly TOTAL_LEVELS = TOTAL_LEVELS; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventLevelLoaded: AntSignal<[LevelManager]>;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _levels: LevelRecord[] | null = null;
  private _currentLevel: LevelCore | null;
  private _currentLevelName: string | null = null;
  private _isLoading: boolean;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this.eventLevelLoaded = new AntSignal<[LevelManager]>(LevelManager);
    this._currentLevel = null;
    this._isLoading = false;
    this.register(1, 'Level01', levelClass(1));
    this.register(2, 'Level02', levelClass(2));
    this.register(3, 'Level03', levelClass(3));
    this.register(4, 'Level04', levelClass(4));
    this.register(5, 'Level05', levelClass(5));
    this.register(6, 'Level06', levelClass(6));
    this.register(7, 'Level07', levelClass(7));
    this.register(8, 'Level08', levelClass(8));
    this.register(9, 'Level09', levelClass(9));
    this.register(10, 'Level10', levelClass(10));
    this.register(11, 'Level11', levelClass(11));
    this.register(12, 'Level12', levelClass(12));
    this.register(13, 'Level13', levelClass(13));
    this.register(14, 'Level14', levelClass(14));
    this.register(15, 'Level15', levelClass(15));
    this.register(16, 'Level16', levelClass(16));
    this.register(17, 'Level17', levelClass(17));
    this.register(18, 'Level18', levelClass(18));
    this.register(19, 'Level19', levelClass(19));
    this.register(20, 'Level20', levelClass(20));
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  register(aLevel: number, aName: string, aClass: Ctor<LevelCore>): void {
    if (this._levels == null) {
      this._levels = [];
    }

    this._levels.push({ num: aLevel | 0, key: aName, instance: aClass });
  }

  clear(): void {
    if (this._currentLevel != null) {
      this._currentLevel.clear();
      this._currentLevel = null;
    }
  }

  loadLevel(aName: string): void {
    if (!this._isLoading) {
      this._isLoading = true;
      this.clear();
      G.gameData.resetCoins(PlayerData.PLAYER1);
      G.gameData.resetCoins(PlayerData.PLAYER2);
      G.gameData.resetLives(PlayerData.PLAYER1, Config.defLives);
      G.gameData.resetLives(PlayerData.PLAYER2, Config.defLives);
      if (this.hasLevel(aName)) {
        this._currentLevel = this.createLevel(aName);
        const level = this._currentLevel as LevelCore;
        level.eventLoadingProgress.add(this.onLevelLoading);
        level.eventLoadingComplete.add(this.onLevelLoaded);
        level.name = aName;
        level.create();
      }
    }
  }

  restartLevel(): void {
    if (this._currentLevel != null) {
      this.loadLevel(this._currentLevel.name as string);
    }
  }

  hasLevel(aName: string): boolean {
    return this.getLevelByKey(aName) != null;
  }

  createLevel(aName: string): LevelCore | null {
    const record = this.getLevelByKey(aName);
    return record != null ? asType(new record.instance(), LevelCore) : null;
  }

  getLevelByKey(aKey: string): LevelRecord | null {
    let i = 0; // :int
    const n = (this._levels as LevelRecord[]).length | 0; // :int
    while (i < n) {
      const record = (this._levels as LevelRecord[])[i++] as LevelRecord;
      if (record.key == aKey) {
        return record;
      }
    }

    return null;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  /**
   * Not in the original (T1.9e): the number (1..20) of the level that is loaded, 0 when there is none. The sim
   * puts it into the Frame header, the renderer loads the atlas group of the level by it.
   */
  get currentLevelNumber(): number {
    if (this._currentLevel == null) {
      return 0;
    }

    const record = this.getLevelByKey(this._currentLevel.name as string);
    return record != null ? record.num : 0;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private onLevelLoading = (_aProgress: number): void => {
    void _aProgress;
  };

  private onLevelLoaded = (): void => {
    this._isLoading = false;
    this.eventLevelLoaded.dispatch(this);
    const uiSystem = G.core.getSystem(UISystem) as UISystem;
    uiSystem.isGameOver = false;
    uiSystem.spawnShuttle('Player1');
    uiSystem.addBlinker('Player2');
  };
}

// Registration for G.init() (see G.levelManagerClass).
G.levelManagerClass = LevelManager;
