import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { AntG } from '../../src/engine/core/AntG';
import { AntEffectManager } from '../../src/engine/effects/AntEffectManager';
import { AntSystem } from '../../src/engine/ants/AntSystem';
import { Assets } from '../../src/game/Assets';
import { AvailKeys } from '../../src/game/AvailKeys';
import { Config } from '../../src/game/Config';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { LevelData } from '../../src/game/data/LevelData';
import { PlayerData } from '../../src/game/data/PlayerData';
import { Fonts } from '../../src/game/Fonts';
import { Font } from '../../src/game/fonts/Font';
import { G } from '../../src/game/G';
import { MODEL_CLIPS, Models } from '../../src/game/Models';
import { GameState } from '../../src/game/states/GameState';
import { ControlSystem } from '../../src/game/systems/ControlSystem';
import { ShuttleSystem } from '../../src/game/systems/ShuttleSystem';

function initGame(): void {
  G.init(new GameState());
}

beforeEach(() => {
  GameData.storage = new MemoryGameSaveStorage();
  Config.keyP1Gas = 'UP';
  Config.keyP1Left = 'LEFT';
  Config.keyP1Right = 'RIGHT';
  Config.keyP2Gas = 'W';
  Config.keyP2Left = 'A';
  Config.keyP2Right = 'D';
  AntG.sounds.mute = false;
  initGame();
});

describe('Config / AvailKeys / DebugSettings / Assets', () => {
  it('Config has the values of the original', () => {
    expect(Config.FRAME_RATE).toBe(35);
    expect(Config.DEBUG_MODE).toBe(false);
    expect(Config.GAME_VERSION).toBe('1.3.0 - Feb 2, 2016');
    expect(Config.defLives).toBe(3);
    expect(Config.keyConfig).toBe('G');
    expect(Config.keyPause1).toBe('P');
    expect(Config.keyPause2).toBe('ESC');
    expect(Config.keyAction1).toBe('SPACEBAR');
    expect(Config.keyAction2).toBe('ENTER');
    expect([Config.keyP1Gas, Config.keyP1Left, Config.keyP1Right]).toEqual(['UP', 'LEFT', 'RIGHT']);
    expect([Config.keyP2Gas, Config.keyP2Left, Config.keyP2Right]).toEqual(['W', 'A', 'D']);
    expect(Config.debugSettings.showParticles).toBe(true);
    expect(Config.debugSettings.showStations).toBe(false);
  });

  it('AvailKeys.getString maps names to characters, unknown names to a space', () => {
    const keys = new AvailKeys();
    expect(keys.getString('A')).toBe('A');
    expect(keys.getString('ZERO')).toBe('0');
    expect(keys.getString('UP')).toBe('^');
    expect(keys.getString('LEFT')).toBe('<');
    expect(keys.getString('RIGHT')).toBe('>');
    expect(keys.getString('DOWN')).toBe('~');
    expect(keys.getString('SPACEBAR')).toBe(' ');
    expect(keys.getString('getString')).toBe(' ');
    expect(Object.keys(keys.keys)).toHaveLength(40);
  });

  it('Assets.getGraphics lists the 413 symbol names of the original', () => {
    const list = Assets.getGraphics();
    expect(list).toHaveLength(413);
    expect(list[0]).toBe('Barrel_mc');
    expect(list[list.length - 1]).toBe('Tutorial06_mc');
    expect(new Set(list).size).toBe(list.length);
  });

  it('Fonts.init caches the ten fonts', () => {
    Fonts.init();
    expect(Font.fromCache('ImgFont01/XmlFont01')).not.toBeNull();
    expect(Font.fromCache('ImgFont05/XmlFont05')).not.toBeNull();
  });
});

describe('G', () => {
  it('init creates everything and registers core and music as plugins (in this order)', () => {
    expect(G.core).toBeDefined();
    expect(G.physics.box2dWorld).toBeDefined();
    expect(G.models.manager).toBeDefined();
    expect(G.levelManager).toBeDefined();
    expect(G.gameData).toBeInstanceOf(GameData);
    expect(G.music).toBeDefined();
    expect(G.missions).toBeDefined();
    expect(G.content).toBeDefined();
    expect(AntG.plugins.contains(G.core)).toBe(true);
    expect(AntG.plugins.contains(G.music)).toBe(true);
    expect(G.gameState).toBeInstanceOf(GameState);
  });

  it('gamePause pauses and resumes the systems that are in the core', () => {
    const control = new ControlSystem();
    const shuttle = new ShuttleSystem();
    const other = new AntSystem();
    G.core.addSystem(control, 0);
    G.core.addSystem(shuttle, 0);
    G.core.addSystem(other, 0);
    expect(G.gamePause).toBe(false);
    G.gamePause = true;
    expect(G.gamePause).toBe(true);
    expect(G.physics.pause).toBe(true);
    expect(control.isPaused).toBe(true);
    expect(shuttle.isPaused).toBe(true);
    expect(other.isPaused).toBe(false);
    G.gamePause = false;
    expect(control.isPaused).toBe(false);
    expect(shuttle.isPaused).toBe(false);
  });

  it('log does nothing while DEBUG_MODE is off', () => {
    expect(() => G.log('x')).not.toThrow();
  });
});

describe('PlayerData / LevelData', () => {
  it('PlayerData defaults per player', () => {
    const p1 = new PlayerData(PlayerData.PLAYER1);
    const p2 = new PlayerData(PlayerData.PLAYER2);
    expect([p1.coins, p1.lives]).toEqual([0, 4]);
    expect([p1.shuttleKind, p1.shuttleColor, p1.engineKind, p1.engineColor]).toEqual([1, 1, 1, 1]);
    expect([p2.shuttleKind, p2.shuttleColor, p2.engineKind, p2.engineColor]).toEqual([1, 2, 1, 2]);
    const unknown = new PlayerData('X');
    expect([unknown.shuttleKind, unknown.engineColor]).toEqual([0, 0]);
  });

  it('PlayerData toObject/fromObject only touch the ship (not coins and lives), fromObject checks the name', () => {
    const a = new PlayerData(PlayerData.PLAYER1);
    a.coins = 7;
    a.lives = 9;
    a.shuttleKind = 3;
    a.engineColor = 4;
    const obj = a.toObject();
    expect(obj).toEqual({ name: 'Player1', shuttleKind: 3, shuttleColor: 1, engineKind: 1, engineColor: 4 });
    const b = new PlayerData(PlayerData.PLAYER1);
    b.fromObject(obj);
    expect([b.shuttleKind, b.engineColor, b.coins, b.lives]).toEqual([3, 4, 0, 4]);
    const c = new PlayerData(PlayerData.PLAYER2);
    c.fromObject(obj);
    expect(c.shuttleKind).toBe(1);
    c.copyFrom(a);
    expect([c.name, c.coins, c.lives, c.shuttleKind]).toEqual(['Player1', 7, 9, 3]);
    c.failure();
    expect(c.coins).toBe(0);
  });

  it('LevelData.BONUS_LEVELS = [4,8,12,16,20]; kind, name and button position follow the level number', () => {
    expect([...LevelData.BONUS_LEVELS]).toEqual([4, 8, 12, 16, 20]);
    const l1 = new LevelData(1);
    expect([l1.name, l1.kind, l1.unlocked, l1.stars, l1.btnX, l1.btnY]).toEqual(['Level01', 'Basic', true, 0, 160, 209]);
    const l4 = new LevelData(4);
    expect([l4.name, l4.kind, l4.unlocked, l4.btnX, l4.btnY]).toEqual(['Level04', 'Bonus', false, 340, 149]);
    const l10 = new LevelData(10);
    expect([l10.name, l10.kind, l10.btnX, l10.btnY]).toEqual(['Level10', 'Basic', 580, 269]);
    const l20 = new LevelData(20);
    expect([l20.name, l20.kind, l20.btnX, l20.btnY]).toEqual(['Level20', 'Bonus', 220, 269]);
    l20.fromObject({ name: 'Level19', unlocked: true, stars: 3 });
    expect([l20.unlocked, l20.stars]).toEqual([false, 0]);
    l20.fromObject({ name: 'Level20', unlocked: true, stars: 2.9 });
    expect([l20.unlocked, l20.stars]).toEqual([true, 2]);
  });
});

describe('GameData', () => {
  it('has 2 players and 20 levels, the defaults of the original', () => {
    const gd = G.gameData;
    expect(gd.currentLevelName).toBe('Level01');
    expect([gd.goalA, gd.goalB, gd.goalC, gd.goalMax, gd.defRecord]).toEqual([20, 40, 60, 80, 25]);
    expect([gd.casualMode, gd.fancyQuality, gd.fancyEffects, gd.muteMusic, gd.muteSounds]).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(gd.getLevelDataAt(0)!.name).toBe('Level01');
    expect(gd.getLevelDataAt(19)!.name).toBe('Level20');
    expect(gd.getLevelDataAt(20)).toBeNull();
    expect(gd.getLevelDataAt(-1)).toBeNull();
    expect(gd.getLevelData('Level05')!.level).toBe(5);
    expect(gd.getLevelData('Nope')).toBeNull();
    expect(gd.getPlayerData(PlayerData.PLAYER2)!.shuttleColor).toBe(2);
    expect(gd.getPlayerData('Nobody')).toBeNull();
    expect(gd.hasSaveData).toBe(false);
    expect(gd.getPrevRecord()).toBe(25);
  });

  it('lives and coins: give, take, get, reset; unknown player gives 0 and changes nothing', () => {
    const gd = G.gameData;
    expect(gd.getLives('Player1')).toBe(4);
    gd.giveLives('Player1', 2);
    gd.takeLives('Player1', 1);
    expect(gd.getLives('Player1')).toBe(5);
    gd.giveCoins('Player2', 10);
    gd.takeCoins('Player2', 3);
    expect(gd.getCoins('Player2')).toBe(7);
    expect(gd.getCoins('Player1')).toBe(0);
    expect(gd.getLives('Nobody')).toBe(0);
    gd.giveCoins('Nobody', 5);
    gd.resetLives('Player1');
    expect(gd.getLives('Player1')).toBe(0);
    gd.resetLives('Player1', 3);
    gd.resetCoins('Player2');
    expect([gd.getLives('Player1'), gd.getCoins('Player2')]).toEqual([3, 0]);
    gd.giveCoins('Player1', 2.9);
    expect(gd.getCoins('Player1')).toBe(2);
  });

  it('success / failure zero the coins and end the two-player mode', () => {
    const gd = G.gameData;
    gd.giveCoins('Player1', 5);
    gd.giveCoins('Player2', 6);
    gd.isTwoPlayerMode = true;
    gd.success();
    expect([gd.getCoins('Player1'), gd.getCoins('Player2'), gd.isTwoPlayerMode]).toEqual([0, 0, false]);
    gd.giveCoins('Player1', 5);
    gd.isTwoPlayerMode = true;
    gd.failure();
    expect([gd.getCoins('Player1'), gd.isTwoPlayerMode]).toEqual([0, false]);
  });

  it('setLevelStars only raises the stars unless forced; next level bookkeeping', () => {
    const gd = G.gameData;
    gd.setLevelStars('Level02', 2);
    gd.setLevelStars('Level02', 1);
    expect(gd.getLevelData('Level02')!.stars).toBe(2);
    gd.setLevelStars('Level02', 1, true);
    expect(gd.getLevelData('Level02')!.stars).toBe(1);
    gd.setNextLevelName('Level02');
    expect([gd.nextLevelName, gd.toUnlockNextLevel]).toEqual(['Level02', true]);
    gd.nextLevel();
    expect([gd.currentLevelName, gd.nextLevelName, gd.toUnlockNextLevel]).toEqual(['Level02', null, false]);
  });

  it('saveData -> a new instance loadData restores levels, ships, settings and keys', () => {
    const gd = G.gameData;
    gd.setLevelStars('Level01', 3);
    gd.getLevelData('Level02')!.unlocked = true;
    gd.setLevelStars('Level02', 1);
    gd.currentLevelName = 'Level02';
    gd.getPlayerData('Player1')!.shuttleKind = 3;
    gd.getPlayerData('Player1')!.shuttleColor = 5;
    gd.getPlayerData('Player2')!.engineKind = 2;
    gd.casualMode = false;
    gd.fancyEffects = true;
    gd.fancyQuality = false;
    gd.muteMusic = true;
    gd.muteSounds = true;
    Config.keyP1Gas = 'Q';
    Config.keyP2Right = 'K';
    gd.saveData();
    expect(gd.hasSaveData).toBe(true);

    // Fresh state, as after a restart of the game.
    Config.keyP1Gas = 'UP';
    Config.keyP2Right = 'D';
    G.music.mute = false;
    AntG.sounds.mute = false;
    const fresh = new GameData();
    expect(fresh.hasSaveData).toBe(false);
    expect(fresh.getLevelData('Level02')!.unlocked).toBe(false);
    fresh.loadData();
    expect(fresh.hasSaveData).toBe(true);
    expect(fresh.getLevelData('Level01')!.stars).toBe(3);
    expect(fresh.getLevelData('Level02')!.unlocked).toBe(true);
    expect(fresh.getLevelData('Level02')!.stars).toBe(1);
    expect(fresh.getLevelData('Level03')!.unlocked).toBe(false);
    expect(fresh.currentLevelName).toBe('Level02');
    expect(fresh.getPlayerData('Player1')!.shuttleKind).toBe(3);
    expect(fresh.getPlayerData('Player1')!.shuttleColor).toBe(5);
    expect(fresh.getPlayerData('Player2')!.engineKind).toBe(2);
    expect(fresh.casualMode).toBe(false);
    expect(fresh.fancyEffects).toBe(true);
    expect(fresh.fancyQuality).toBe(false);
    expect(fresh.muteMusic).toBe(true);
    expect(fresh.muteSounds).toBe(true);
    expect(G.music.mute).toBe(true);
    expect(AntG.sounds.mute).toBe(true);
    expect(Config.keyP1Gas).toBe('Q');
    expect(Config.keyP2Right).toBe('K');
    expect(AntEffectManager.getInstance().lowQuality).toBe(false);
    expect(G.gameState.fancyQuality).toBe(false);
  });

  it('coins and lives are NOT part of the save (the original does not store them)', () => {
    const gd = G.gameData;
    gd.giveCoins('Player1', 40);
    gd.giveLives('Player1', 5);
    gd.saveData();
    const fresh = new GameData();
    fresh.loadData();
    expect(fresh.getCoins('Player1')).toBe(0);
    expect(fresh.getLives('Player1')).toBe(4);
  });

  it('the saved object has the format of the original SharedObject data', () => {
    G.gameData.saveData();
    const saved = GameData.storage.read(GameData.SAVE_KEY)!;
    expect(Object.keys(saved)).toEqual([
      'currentLevelName',
      'muteMusic',
      'muteSounds',
      'fancyEffects',
      'fancyQuality',
      'casualMode',
      'players',
      'levels',
      'missions',
      'content',
      'keyP1Gas',
      'keyP1Left',
      'keyP1Right',
      'keyP2Gas',
      'keyP2Left',
      'keyP2Right',
    ]);
    expect((saved['players'] as unknown[]).length).toBe(2);
    expect((saved['levels'] as unknown[]).length).toBe(20);
    expect((saved['levels'] as Record<string, unknown>[])[0]).toEqual({ name: 'Level01', unlocked: true, stars: 0 });
  });

  it('a save without the optional keys gets the defaults; clearData removes the save', () => {
    GameData.storage.write(GameData.SAVE_KEY, {
      currentLevelName: 'Level05',
      muteMusic: false,
      muteSounds: false,
      players: [],
      levels: [],
      missions: {},
      content: {},
    });
    const gd = new GameData();
    gd.casualMode = false;
    gd.fancyEffects = true;
    gd.loadData();
    expect([gd.currentLevelName, gd.casualMode, gd.fancyEffects, gd.fancyQuality]).toEqual(['Level05', true, false, true]);
    expect([Config.keyP1Gas, Config.keyP2Left]).toEqual(['UP', 'A']);
    gd.getLevelData('Level01')!.stars = 2;
    gd.clearData();
    expect(gd.getLevelData('Level01')!.stars).toBe(0);
    gd.loadData();
    expect(gd.hasSaveData).toBe(false);
  });
});

const assetsRoot = resolve(process.cwd(), 'assets');
const hasModels = existsSync(resolve(assetsRoot, 'data', 'models.json'));

describe('Models', () => {
  it('registers nothing without a model source', () => {
    const models = new Models({});
    expect(models.missing).toHaveLength(MODEL_CLIPS.length);
    expect(MODEL_CLIPS).toHaveLength(53);
    expect(models.manager.isRegisteredShape('RectShape_com')).toBe(true);
    expect(models.manager.isRegisteredShape('CircleShape_com')).toBe(true);
    expect(models.manager.isRegisteredJoint('RevoluteJoint_com')).toBe(true);
    expect(models.manager.isRegisteredJoint('PrismaticJoint_com')).toBe(true);
  });

  it('registers a clip that the source has, in the order of the list', () => {
    const models = new Models({ Shuttle01Model_mc: { objects: [] } });
    expect(models.manager.getModel('Shuttle01Model_mc')).not.toBeNull();
    expect(models.manager.getModel('Shuttle02Model_mc')).toBeNull();
    expect(models.missing).toHaveLength(52);
  });

  it.skipIf(!hasModels)('registers the models of assets/data/models.json', async () => {
    const registry = new AssetRegistry(new FileAssetSource(assetsRoot, (p) => readFile(p)));
    await registry.loadModels();
    const models = new Models(registry.getModels() as never);
    // models.json has 33 of the 53 clips: the 20 Passenger*Ragdoll0N_mc are absent (pipeline gap, see the report).
    expect(models.missing).toHaveLength(20);
    expect(models.missing.every((n) => /^Passenger(Blue|Pink|Green|Orange)Ragdoll0[1-5]_mc$/.test(n))).toBe(true);
    const shuttle = models.manager.getModel('Shuttle01Model_mc')!;
    expect(shuttle).not.toBeNull();
    expect(shuttle.name).toBe('Shuttle01Model_mc');
    expect(models.manager.getModel('Rock07Ragdoll_mc')).not.toBeNull();
  });
});
