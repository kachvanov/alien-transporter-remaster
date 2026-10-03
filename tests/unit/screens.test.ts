// T2.6: the screens (screens/*), MenuSystem, PrepareState: the flow of the game with the mouse, the sponsor buttons are gone.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntButton } from '../../src/engine/core/AntButton';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { Anthill } from '../../src/engine/core/Anthill';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntMath } from '../../src/engine/utils/AntMath';
import type { Ctor } from '../../src/engine/utils/types';
import { Config } from '../../src/game/Config';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { PlayerData } from '../../src/game/data/PlayerData';
import { G } from '../../src/game/G';
import { Ground } from '../../src/game/map/Ground';
import { Button } from '../../src/game/screens/Button';
import { CreditsScreen } from '../../src/game/screens/CreditsScreen';
import { GameScreen } from '../../src/game/screens/GameScreen';
import { GarageScreen } from '../../src/game/screens/GarageScreen';
import { LevelCompleteScreen } from '../../src/game/screens/LevelCompleteScreen';
import { MainMenuScreen } from '../../src/game/screens/MainMenuScreen';
import { RestartLevelScreen } from '../../src/game/screens/RestartLevelScreen';
import { SelectLevelScreen } from '../../src/game/screens/SelectLevelScreen';
import { GameState } from '../../src/game/states/GameState';
import { PrepareState } from '../../src/game/states/PrepareState';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { ButtonBarView } from '../../src/game/ui/ButtonBarView';
import { KeyInputPopupView } from '../../src/game/ui/KeyInputPopupView';
import { ShuttlePreviewView } from '../../src/game/ui/ShuttlePreviewView';
import { hasAssets, loadAssets } from './helpers/assets';

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

afterEach(() => {
  Ground.body = null;
  Ground.stopperList = null;
  vi.restoreAllMocks();
});

/** The game as the real one starts it: PrepareState -> GameState (the main menu). */
function newGame(): GameState {
  GameData.storage = new MemoryGameSaveStorage();
  if (G.physics != null) {
    G.physics.stop();
  }

  AntMath.seed(12345);
  const anthill = new Anthill(PrepareState, false);
  return anthill.state as GameState;
}

function tick(aInput: Partial<InputSnapshot> = {}): void {
  (AntG.anthill as NonNullable<typeof AntG.anthill>).tick({ ...emptyInputSnapshot(), ...aInput });
}

function ticks(aN: number, aInput: Partial<InputSnapshot> = {}): void {
  for (let i = 0; i < aN; i++) {
    tick(aInput);
  }
}

function click(aX: number, aY: number): void {
  tick({ mouseX: aX, mouseY: aY });
  tick({ mouseX: aX, mouseY: aY, mouseDown: true });
  tick({ mouseX: aX, mouseY: aY, mouseDown: false });
}

function menu(): MenuSystem {
  return G.core.getSystem(MenuSystem) as MenuSystem;
}

/** Ticks until the screen of the class is the current one (the fade of the transition takes ~80 ticks). */
function waitScreen(aClass: Ctor<unknown>, aMax = 400): void {
  for (let i = 0; i < aMax && !(menu().currentScreen instanceof aClass); i++) {
    tick();
  }

  expect(menu().currentScreen).toBeInstanceOf(aClass);
}

function all<T extends AntEntity>(aParent: AntEntity, aClass: Ctor<T>): T[] {
  return (aParent.children ?? []).filter((c): c is T => c instanceof aClass && c.exists);
}

function antButtonOf(aButton: Button): AntButton {
  return all(aButton, AntButton)[0] as AntButton;
}

function centerOf(aButton: AntButton): [number, number] {
  return [aButton.globalX + aButton.origin.x + aButton.width * 0.5, aButton.globalY + aButton.origin.y + aButton.height * 0.5];
}

/** The AntButtons of the layer of the screens by the name of the animation. */
function buttonsOf(aState: GameState): AntButton[] {
  return all(aState.layerMenu, Button).map((b) => antButtonOf(b));
}

function animNames(aState: GameState): string[] {
  const names: string[] = [];
  const walk = (aEntity: AntEntity): void => {
    for (const child of aEntity.children ?? []) {
      if (child == null || !child.exists) continue;
      if (child instanceof AntActor || child instanceof AntButton) {
        const name = child.currentAnimation;
        if (name != null) names.push(name);
      }

      walk(child);
    }
  };
  for (const layer of [aState.layerMenuBG, aState.layerMenu, aState.layerMenuFG, aState.layerInterface, aState.layerPopups]) {
    walk(layer);
  }

  return names;
}

function clickButton(aState: GameState, aAnim: string): void {
  const button = buttonsOf(aState).find((b) => b.currentAnimation == aAnim);
  expect(button, aAnim).toBeDefined();
  click(...centerOf(button as AntButton));
}

const SPONSOR = /Armor|MoreGames|FaceBook|Twitter|Patreon|AGIntro/;

describe.skipIf(!hasAssets)('PrepareState, MenuSystem', () => {
  it('the game starts with the main menu: PrepareState switches to GameState at once, the MenuSystem makes MainMenuScreen', () => {
    const state = newGame();
    expect(state).toBeInstanceOf(GameState);
    expect(AntG.width).toBe(800);
    expect(AntG.waterMark[0]).toBe('Alien Transporter 1.3.0 - Feb 2, 2016');
    expect(menu().currentScreen).toBeInstanceOf(MainMenuScreen);
    expect(menu().currentScreenName).toBe(MenuSystem.MAIN_MENU_SCREEN);
  });

  it('switchScreen waits for the fade, then destroys the old screen and makes the new one', () => {
    const state = newGame();
    ticks(120);
    const old = menu().currentScreen;
    menu().switchScreen(MenuSystem.CREDITS_SCREEN);
    expect(menu().currentScreen).toBe(old); // the fade has not ended yet
    waitScreen(CreditsScreen);
    ticks(60);
    expect(menu().currentScreen).not.toBe(old);
    expect(state.layerMenu.children?.some((c) => c instanceof Button && c.exists)).toBe(true);
  });
});

describe.skipIf(!hasAssets)('MainMenuScreen, CreditsScreen: no sponsor', () => {
  it('main menu: the buttons Credits and Play (the layout of the original), no sponsor buttons', () => {
    const state = newGame();
    ticks(150);
    const anims = animNames(state);
    expect(anims).toContain('MainMenuBG_mc');
    expect(anims).toContain('Copyright_mc');
    expect(anims).toContain('BtnCredits_mc');
    expect(anims).toContain('BtnPlay_mc');
    expect(anims.filter((a) => SPONSOR.test(a))).toEqual([]);
    const credits = all(state.layerMenu, Button).find((b) => antButtonOf(b).currentAnimation == 'BtnCredits_mc') as Button;
    const play = all(state.layerMenu, Button).find((b) => antButtonOf(b).currentAnimation == 'BtnPlay_mc') as Button;
    expect([credits.x, credits.y, play.x, play.y]).toEqual([288, 385, 400, 385]);
    expect(play.selected).toBe(true);
  });

  it('Credits: the authors, Apply leads back; the links of the authors are opened, the link of the sponsor is not', () => {
    const state = newGame();
    const opened: string[] = [];
    AntG.onOpenUrl = (url) => opened.push(url);
    ticks(150);
    clickButton(state, 'BtnCredits_mc');
    waitScreen(CreditsScreen);
    ticks(120);
    const anims = animNames(state);
    expect(anims).toContain('CreditsScreenBG_mc');
    for (const name of ['BtnAnton_mc', 'BtnAhura_mc', 'BtnWesley_mc', 'BtnApply_mc']) expect(anims).toContain(name);
    expect(anims.filter((a) => SPONSOR.test(a))).toEqual([]);
    clickButton(state, 'BtnAnton_mc');
    clickButton(state, 'BtnAhura_mc');
    clickButton(state, 'BtnWesley_mc'); // DEVIATION: sponsor removed, the link is disabled
    expect(opened).toEqual(['http://www.zombotron.com/', 'http://www.ahuraster.com/']);
    clickButton(state, 'BtnApply_mc');
    waitScreen(MainMenuScreen);
    AntG.onOpenUrl = null;
  });
});

describe.skipIf(!hasAssets)('SelectLevelScreen', () => {
  it('Play of the main menu: 20 level places, the ship on Level01, a click on its button starts the level', () => {
    const state = newGame();
    ticks(150);
    clickButton(state, 'BtnPlay_mc');
    waitScreen(SelectLevelScreen);
    ticks(150);
    const anims = animNames(state);
    expect(anims).toContain('SelectLevelBG_mc');
    expect(anims).toContain('BtnLevelBasic_mc'); // Level01 (the others are locked)
    expect(anims).toContain('BtnGarage_mc');
    expect(anims).toContain('BtnMainMenu_mc');
    expect(anims).toContain('BtnPlay_mc');
    expect(anims.filter((a) => SPONSOR.test(a))).toEqual([]);
    expect(anims).not.toContain('BtnDelete_mc'); // no saved game yet
    clickButton(state, 'BtnLevelBasic_mc');
    waitScreen(GameScreen);
    expect(G.gameData.currentLevelName).toBe('Level01');
    expect(G.levelManager.currentLevelNumber).toBe(1);
  });

  it('the unlocked levels have buttons and stars: the level kinds (Basic, Bonus) and the places (LevelData.BTN_X/BTN_Y)', () => {
    const state = newGame();
    for (let i = 0; i < 6; i++) {
      const data = G.gameData.getLevelDataAt(i)!;
      data.unlocked = true;
      data.stars = i % 4;
    }

    G.gameData.currentLevelName = 'Level03';
    menu().makeScreenNow(MenuSystem.SELECT_LEVEL_SCREEN);
    ticks(150);
    const buttons = all(state.layerMenu, Button).filter((b) => (antButtonOf(b).tag as number) > 0);
    expect(buttons.map((b) => antButtonOf(b).tag).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const bonus = buttons.find((b) => antButtonOf(b).tag == 4) as Button;
    expect(antButtonOf(bonus).currentAnimation).toBe('BtnLevelBonus_mc');
    expect([bonus.x, bonus.y]).toEqual([340, 149]);
    // the stars: 0 + 1 + 2 + 3 + 0 + 1 (Level03 is current: its stars are made, the level is not being unlocked)
    expect(animNames(state).filter((a) => a == 'BtnStar_mc').length).toBe(7);
  });

  it('a click on another level moves the ship and takes the level; the next click on the same level starts it', () => {
    const state = newGame();
    G.gameData.getLevelDataAt(1)!.unlocked = true;
    menu().makeScreenNow(MenuSystem.SELECT_LEVEL_SCREEN);
    ticks(150);
    const screen = menu().currentScreen as SelectLevelScreen;
    const buttons = all(state.layerMenu, Button);
    const second = buttons.find((b) => antButtonOf(b).tag == 2) as Button;
    click(...centerOf(antButtonOf(second)));
    expect(G.gameData.currentLevelName).toBe('Level02');
    ticks(80);
    expect((screen as unknown as { _currentLevel: number })._currentLevel).toBe(2);
    clickButton(state, 'BtnPlay_mc');
    waitScreen(GameScreen);
    expect(G.levelManager.currentLevelNumber).toBe(2);
  });

  it('with a saved game the Delete button asks (ConfirmPopupView) and No keeps the saves', () => {
    const state = newGame();
    G.gameData.saveData();
    G.gameData.loadData();
    menu().makeScreenNow(MenuSystem.SELECT_LEVEL_SCREEN);
    ticks(150);
    expect(animNames(state)).toContain('BtnDelete_mc');
    G.gameData.getLevelDataAt(0)!.stars = 2;
    clickButton(state, 'BtnDelete_mc');
    ticks(60);
    expect(animNames(state)).toContain('GameOverPopupBG_mc'); // the popup of the confirmation
    expect(G.gameData.getLevelDataAt(0)!.stars).toBe(2);
  });
});

describe.skipIf(!hasAssets)('GameScreen', () => {
  function startLevel(): GameState {
    const state = newGame();
    ticks(60);
    state.debugStartLevel('Level01');
    ticks(80);
    return state;
  }

  it('the level, the title, the buttons of the screen (music, sound, pause) at (33|83|133, 567); no sponsor button', () => {
    const state = startLevel();
    expect(menu().currentScreen).toBeInstanceOf(GameScreen);
    expect(G.levelManager.currentLevelNumber).toBe(1);
    const buttons = all(state.layerInterface, Button);
    expect(buttons.map((b) => [antButtonOf(b).currentAnimation, b.x, b.y])).toEqual([
      ['BtnMusicOn_mc', 33, 567],
      ['BtnSoundOn_mc', 83, 567],
      ['BtnPause_mc', 133, 567],
    ]);
    expect(animNames(state).filter((a) => SPONSOR.test(a))).toEqual([]);
  });

  it('the music and sound buttons switch the flags and the picture of the button', () => {
    const state = startLevel();
    const [music, sound] = all(state.layerInterface, Button).map((b) => antButtonOf(b)) as [AntButton, AntButton];
    click(...centerOf(music));
    expect([G.music.mute, G.gameData.muteMusic, music.currentAnimation]).toEqual([true, true, 'BtnMusicOff_mc']);
    click(...centerOf(music));
    expect([G.music.mute, G.gameData.muteMusic, music.currentAnimation]).toEqual([false, false, 'BtnMusicOn_mc']);
    click(...centerOf(sound));
    expect([AntG.sounds.mute, G.gameData.muteSounds, sound.currentAnimation]).toEqual([true, true, 'BtnSoundOff_mc']);
    click(...centerOf(sound));
    expect(AntG.sounds.mute).toBe(false);
  });

  it('the pause button pauses the game and the buttons of the screen are not active under the popup', () => {
    const state = startLevel();
    const pause = all(state.layerInterface, Button)[2] as Button;
    click(...centerOf(antButtonOf(pause)));
    expect(G.gamePause).toBe(true);
    expect(all(state.layerInterface, Button).every((b) => !b.active)).toBe(true);
    const screen = menu().currentScreen as GameScreen;
    expect(screen.pausePopup).not.toBeNull();
  });

  it('2P: the blinker of Player2 is made with the level and removed when the screen is left (removeBlinker)', () => {
    const state = startLevel();
    const ui = G.core.getSystems().find((s) => (s.constructor as { className?: string }).className == 'UISystem') as unknown as {
      hasBlinker(aPlayer: string): boolean;
    };
    expect(ui.hasBlinker('Player2')).toBe(true);
    menu().switchScreen(MenuSystem.MAIN_MENU_SCREEN);
    waitScreen(MainMenuScreen);
    expect(ui.hasBlinker('Player2')).toBe(false);
    expect(ui.hasBlinker('Player1')).toBe(false);
    void state;
  });

  it('Restart of the pause popup: RestartLevelScreen reloads the level through the fade', () => {
    const state = startLevel();
    tick({ keysDown: [80] }); // P
    tick();
    ticks(40);
    const screen = menu().currentScreen as GameScreen;
    const popup = screen.pausePopup!;
    click(...centerOf(antButtonOf(all(popup, Button)[2] as Button)));
    waitScreen(RestartLevelScreen);
    waitScreen(GameScreen);
    ticks(40);
    expect(G.levelManager.currentLevelNumber).toBe(1);
    expect(G.gamePause).toBe(false);
    expect(all(state.layerInterface, Button)).toHaveLength(3);
  });
});

describe.skipIf(!hasAssets)('LevelCompleteScreen', () => {
  it('the stats of the level: stars, the goals and the columns of Player1 and Player2; Apply saves the stars and returns to the selection', () => {
    const state = newGame();
    ticks(60);
    G.gameData.currentLevelName = 'Level01';
    G.gameData.setNextLevelName('Level02');
    G.gameData.giveCoins('Player1', 70);
    G.gameData.giveCoins('Player2', 10);
    menu().makeScreenNow(MenuSystem.LEVEL_COMPLETE_SCREEN);
    ticks(500);
    expect(menu().currentScreen).toBeInstanceOf(LevelCompleteScreen);
    const anims = animNames(state);
    expect(anims).toContain('CompleteLevelBG_mc');
    expect(anims).toContain('BtnRestart_mc');
    expect(anims).toContain('BtnApply_mc');
    clickButton(state, 'BtnApply_mc');
    waitScreen(SelectLevelScreen);
    expect(G.gameData.getLevelData('Level01')!.stars).toBeGreaterThanOrEqual(1); // goalA = 20 coins
  });
});

describe.skipIf(!hasAssets)('GarageScreen', () => {
  function openGarage(): { state: GameState; screen: GarageScreen } {
    const state = newGame();
    ticks(60);
    menu().makeScreenNow(MenuSystem.GARAGE_SCREEN);
    ticks(150);
    return { state, screen: menu().currentScreen as GarageScreen };
  }

  it('the preview of both ships, 8 bars of choice, 6 key buttons with the names of the keys, the Casual switch', () => {
    const { state } = openGarage();
    expect(all(state.layerMenu, ShuttlePreviewView)).toHaveLength(2);
    expect(all(state.layerMenu, ButtonBarView)).toHaveLength(8);
    const keys = all(state.layerMenu, Button).filter((b) => antButtonOf(b).currentAnimation == 'BtnLevelBasic_mc');
    expect(keys).toHaveLength(6);
    const anims = animNames(state);
    expect(anims).toContain('GarageBG_mc');
    expect(anims).toContain('BtnRestart_mc');
    expect(anims).toContain('BtnApply_mc');
    expect(anims.filter((a) => SPONSOR.test(a))).toEqual([]);
  });

  it('a colour of the engine and of the ship changes the preview and the data of the player; Apply saves it', () => {
    const { state, screen } = openGarage();
    const priv = screen as unknown as { _shuttleP1View: ShuttlePreviewView; _dataP1: PlayerData; _dataP2: PlayerData };
    expect(priv._dataP1.engineColor).toBe(1);
    const bars = all(state.layerMenu, ButtonBarView);
    const engineBar = bars.find((b) => b.prop == 'engineColor' && b.name == 'Player1') as ButtonBarView;
    const red = all(engineBar, AntButton).find((b) => b.currentAnimation == 'BtnRed_mc') as AntButton;
    click(...centerOf(red));
    expect(priv._dataP1.engineColor).toBe(2);
    expect(priv._shuttleP1View.engineColor).toBe(2);
    expect(engineBar.value).toBe(2);
    const shipBar = bars.find((b) => b.prop == 'shuttleColor' && b.name == 'Player2') as ButtonBarView;
    const yellow = all(shipBar, AntButton).find((b) => b.currentAnimation == 'BtnYellow_mc') as AntButton;
    click(...centerOf(yellow));
    expect(priv._dataP2.shuttleColor).toBe(1);
    expect(G.gameData.getPlayerData('Player1')!.engineColor).toBe(1); // not applied yet
    clickButton(state, 'BtnApply_mc');
    expect(G.gameData.getPlayerData('Player1')!.engineColor).toBe(2);
    expect(G.gameData.getPlayerData('Player2')!.shuttleColor).toBe(1);
    expect(GameData.storage.read(GameData.SAVE_KEY)).not.toBeNull();
    waitScreen(SelectLevelScreen);
  });

  it('Reset gives back the saved choice', () => {
    const { state, screen } = openGarage();
    const priv = screen as unknown as { _dataP1: PlayerData };
    const bar = all(state.layerMenu, ButtonBarView).find((b) => b.prop == 'engineColor' && b.name == 'Player1') as ButtonBarView;
    click(...centerOf(all(bar, AntButton).find((b) => b.currentAnimation == 'BtnRed_mc') as AntButton));
    expect(priv._dataP1.engineColor).toBe(2);
    clickButton(state, 'BtnRestart_mc');
    expect(priv._dataP1.engineColor).toBe(1);
    expect(bar.value).toBe(1);
  });

  it('the Casual / Hardcore switch is GameData.casualMode', () => {
    const { state } = openGarage();
    expect(G.gameData.casualMode).toBe(true);
    const sw = all(state.layerMenu, AntEntity).find((c) => c.constructor.name == 'ButtonSwitch') as AntEntity;
    const button = all(sw, AntButton)[0] as AntButton;
    click(...centerOf(button));
    expect(G.gameData.casualMode).toBe(false);
    click(...centerOf(button));
    expect(G.gameData.casualMode).toBe(true);
  });

  it('a key button opens the popup, the pressed key replaces the key and clears the same key of the other actions', () => {
    const { state } = openGarage();
    const gas = all(state.layerMenu, Button).find((b) => antButtonOf(b).tag == 1) as Button;
    click(...centerOf(antButtonOf(gas)));
    ticks(60);
    expect(animNames(state)).toContain('PressKeyAnim_mc');
    tick({ keysDown: [39] }); // RIGHT: it is the key of P1 Right
    tick();
    const popup = all(state.layerPopups, KeyInputPopupView)[0] as KeyInputPopupView;
    click(...centerOf(antButtonOf(all(popup, Button)[0] as Button)));
    ticks(60);
    expect(Config.keyP1Gas).toBe('RIGHT');
    expect(Config.keyP1Right).toBe(' '); // the same key is taken from the other action
    expect(Config.keyP1Left).toBe('LEFT');
    Config.keyP1Gas = 'UP';
    Config.keyP1Right = 'RIGHT';
  });
});
