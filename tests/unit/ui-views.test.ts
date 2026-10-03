// T2.5: Text, AntButton / Button / ButtonController / ButtonSwitch, AntLabel, TextUIView, the popups (pause, game over,
// confirm, key input, mission), the other views of ui/, and the pause / game over of Level01 (DevGameScreen).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntButton } from '../../src/engine/core/AntButton';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntMath } from '../../src/engine/utils/AntMath';
import type { Ctor } from '../../src/engine/utils/types';
import { BLEND_OVERLAY } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { FrameWriter } from '../../src/frame/FrameWriter';
import { Config } from '../../src/game/Config';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { AntLabel } from '../../src/game/fonts/AntLabel';
import { Font } from '../../src/game/fonts/Font';
import { Label } from '../../src/game/fonts/Label';
import { G } from '../../src/game/G';
import { Ground } from '../../src/game/map/Ground';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { Button } from '../../src/game/screens/Button';
import { ButtonController } from '../../src/game/screens/ButtonController';
import { ButtonSwitch } from '../../src/game/screens/ButtonSwitch';
import { GameState } from '../../src/game/states/GameState';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { UISystem } from '../../src/game/systems/UISystem';
import { Text } from '../../src/game/texts/Text';
import { ButtonBarView } from '../../src/game/ui/ButtonBarView';
import { ConfirmPopupView } from '../../src/game/ui/ConfirmPopupView';
import { FadeEffectView } from '../../src/game/ui/FadeEffectView';
import { GameOverPopupView } from '../../src/game/ui/GameOverPopupView';
import { KeyInputPopupView } from '../../src/game/ui/KeyInputPopupView';
import { LevelStarView } from '../../src/game/ui/LevelStarView';
import { LevelStatsColumn } from '../../src/game/ui/LevelStatsColumn';
import { LevelStatsGoalView } from '../../src/game/ui/LevelStatsGoalView';
import { LevelStatsStarsView } from '../../src/game/ui/LevelStatsStarsView';
import { LevelStatsView } from '../../src/game/ui/LevelStatsView';
import { MissionBarUIView } from '../../src/game/ui/MissionBarUIView';
import { MissionPopupView } from '../../src/game/ui/MissionPopupView';
import { NotifyView } from '../../src/game/ui/NotifyView';
import { PassengerBarUIView } from '../../src/game/ui/PassengerBarUIView';
import { PausePopupView } from '../../src/game/ui/PausePopupView';
import { PopupFadeView } from '../../src/game/ui/PopupFadeView';
import { ScreenFadeView } from '../../src/game/ui/ScreenFadeView';
import { ShipSelectorView } from '../../src/game/ui/ShipSelectorView';
import { ShipSelectorWaveView } from '../../src/game/ui/ShipSelectorWaveView';
import { ShuttlePreviewView } from '../../src/game/ui/ShuttlePreviewView';
import { TextUIView } from '../../src/game/ui/TextUIView';
import { PlayerData } from '../../src/game/data/PlayerData';
import { hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';

const KEY_P = 80;
const KEY_W = 87;
const KEY_SPACE = 32;

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

afterEach(() => {
  Ground.body = null;
  Ground.stopperList = null;
});

function newGame(aSystems = true): GameState {
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(12345);
  return startGame({ systems: aSystems });
}

function tick(aInput: Partial<InputSnapshot> = {}): void {
  (AntG.anthill as NonNullable<typeof AntG.anthill>).tick({ ...emptyInputSnapshot(), ...aInput });
}

function ticks(aN: number, aInput: Partial<InputSnapshot> = {}): void {
  for (let i = 0; i < aN; i++) {
    tick(aInput);
  }
}

/** A click of the left mouse button at the point: move, press, release. */
function click(aX: number, aY: number): void {
  tick({ mouseX: aX, mouseY: aY });
  tick({ mouseX: aX, mouseY: aY, mouseDown: true });
  tick({ mouseX: aX, mouseY: aY, mouseDown: false });
}

function childrenOf<T extends AntEntity>(aParent: AntEntity, aClass: Ctor<T>): T[] {
  return (aParent.children ?? []).filter((c): c is T => c instanceof aClass && c.exists);
}

/** The button that `Button.create` made (its AntButton child). */
function antButtonOf(aButton: Button): AntButton {
  return childrenOf(aButton, AntButton)[0] as AntButton;
}

function center(aButton: AntButton): [number, number] {
  return [aButton.globalX + aButton.origin.x + aButton.width * 0.5, aButton.globalY + aButton.origin.y + aButton.height * 0.5];
}

function shuttles(): ShuttleNode[] {
  const list = G.core.getNodes(ShuttleNode);
  const out: ShuttleNode[] = [];
  for (let i = 0; i < list.numNodes; i++) {
    out.push(list.get(i) as ShuttleNode);
  }

  return out;
}

describe.skipIf(!hasAssets)('Text', () => {
  beforeEach(() => {
    newGame(false);
  });

  it('extract gives the value of texts.json; the *_visual texts are the names of the image clips', () => {
    expect(Text.lang).toBe('ru'); // texts_en.xml has lang="ru" in the original
    expect(Text.extract('PauseText_visual')).toBe('PauseTextEN_mc');
    expect(Text.extract('PressAnyKey_txt')).toBe('Press any key');
    expect(Text.extract('Key_txt')).toBe('Pressed {0} key');
  });

  it('an unknown id gives the placeholder %id%', () => {
    expect(Text.extract('Nope_txt')).toBe('%Nope_txt%');
  });

  it('init clears the table', () => {
    Text.loadXML({ lang: 'xx', SubText: [{ id: 'A', value: 'b' }] });
    expect(Text.extract('A')).toBe('b');
    Text.init();
    expect(Text.extract('A')).toBe('%A%');
    expect(Text.extract('PauseText_visual')).toBe('PauseTextEN_mc');
  });
});

describe.skipIf(!hasAssets)('Label: the width of a line is the sum of the glyph widths and the char intervals', () => {
  it('the width of a text equals the reference computed from assets/data/fonts/*.json', () => {
    newGame(false);
    for (const name of ['font01', 'font02', 'font03', 'font04']) {
      const data = JSON.parse(readFileSync(resolve(process.cwd(), 'assets', 'data', 'fonts', name + '.json'), 'utf8')) as {
        charInterval: number;
        chars: { name: string; w: number; h: number }[];
      };
      const widthOf = (c: string): number => (data.chars.find((x) => x.name == c) as { w: number }).w;
      const text = name == 'font04' ? 'ABab12' : 'Hello 12, World!';
      const expected = [...text].reduce((sum, c) => sum + widthOf(c), 0) + data.charInterval * (text.length - 1);
      const label = new Label();
      label.fontName = name;
      label.text = text;
      expect(label.width, name).toBe(expected);
      expect(label.height, name).toBe(Math.max(...[...text].map((c) => (data.chars.find((x) => x.name == c) as { h: number }).h)));
      expect(label.bufferWidth, name).toBe(expected);
    }
  });

  it('the alignment moves the origin by the width of the buffer', () => {
    newGame(false);
    const label = new Label();
    label.fontName = 'font02';
    label.text = '12345';
    const width = label.width;
    label.align = 'center';
    expect(label.origin.x).toBe(-width * 0.5);
    label.align = 'right';
    expect(label.origin.x).toBe(-width);
    label.align = 'left';
    expect(label.origin.x).toBe(0);
  });
});

describe.skipIf(!hasAssets)('AntLabel (a bitmap font stands for the TextField "system")', () => {
  beforeEach(() => {
    newGame(false);
  });

  it('size < 16 uses font03, size >= 16 uses font02; the width is that of the text in the font', () => {
    const small = new AntLabel('system', 8, 0xffffff);
    small.text = '123';
    const ref = new Label();
    ref.fontName = 'font03';
    ref.text = '123';
    expect(small.width).toBe(ref.width);
    const big = new AntLabel('system', 16, 0xffffff);
    big.text = '123';
    const ref2 = new Label();
    ref2.fontName = 'font02';
    ref2.text = '123';
    expect(big.width).toBe(ref2.width);
    expect(big.width).toBeGreaterThan(small.width);
  });

  it('a TextField is 100x100 before the first text; an empty text clears the label', () => {
    const label = new AntLabel('system');
    expect([label.width, label.height]).toEqual([100, 100]);
    label.text = 'abc';
    expect(label.text).toBe('abc');
    expect(label.bufferWidth).toBeGreaterThan(0);
    label.text = '';
    expect(label.width).toBe(0);
    const writer = new FrameWriter();
    const root = new AntEntity();
    root.add(label);
    expect(readFrame(writer.write({ root, camera: AntG.camera as NonNullable<typeof AntG.camera>, tick: 0 })).nodes).toHaveLength(0);
  });

  it('align does not move a single line (the field is as wide as the text); the colour is 24 bit', () => {
    const label = new AntLabel('system', 8, 0x112233);
    label.text = 'abc';
    label.align = 'center';
    expect(label.align).toBe('center');
    expect(label.origin.x).toBe(0);
    expect(label.color).toBe(0x112233);
    label.color = 0xff445566;
    expect(label.color).toBe(0x445566);
  });
});

describe.skipIf(!hasAssets)('TextUIView', () => {
  beforeEach(() => {
    newGame(false);
  });

  it('breaks the text into lines of at most 150 px (a line is centred, 10 px apart)', () => {
    const view = new TextUIView();
    view.text = 'Deliver 10 passengers to the stations without losing a single ship in the cave.';
    const lines = childrenOf(view, AntLabel);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.width).toBeLessThanOrEqual(150);
    }

    lines.forEach((line, i) => {
      expect(line.y).toBe((i + 1) * 10);
      expect(line.x).toBe(-line.width * 0.5);
    });
    expect(view.textHeight).toBe(lines.length * 10);
    expect(lines.map((l) => l.text).join('').replace(/ /g, '')).toBe(
      'Deliver 10 passengers to the stations without losing a single ship in the cave.'.replace(/ /g, ''),
    );
  });

  it('a word that is wider than the line does not hang the loop', () => {
    const view = new TextUIView();
    view.text = 'Supercalifragilisticexpialidocious_Supercalifragilisticexpialidocious_Supercalifragilisticexpialidocious';
    expect(childrenOf(view, AntLabel)).toHaveLength(1);
  });

  it('textColor and size rebuild the lines; kill destroys them', () => {
    const view = new TextUIView();
    view.text = 'abc';
    view.textColor = 0x123456;
    expect(childrenOf(view, AntLabel)[0]?.color).toBe(0x123456);
    view.size = 16;
    expect(view.size).toBe(16);
    view.kill();
    expect(view.textHeight).toBe(0);
  });
});

describe.skipIf(!hasAssets)('AntButton: the mouse', () => {
  let state: GameState;
  let button: AntButton;

  beforeEach(() => {
    state = newGame(false);
    button = state.layerInterface.recycle(AntButton) as AntButton;
    button.addAnimationFromCache('BtnPlay_mc');
    button.isScrolled = false;
    button.reset(200, 200);
    button.soundClick = 'SndClickButton';
    button.soundOver = 'SndOverButton';
    ticks(2);
  });

  it('the frames of the button are its states: normal, over (the mouse is on it), down (the button is held)', () => {
    expect(button.status).toBe(AntButton.NORMAL);
    const [x, y] = center(button);
    tick({ mouseX: x, mouseY: y });
    expect(button.status).toBe(AntButton.OVER);
    tick({ mouseX: x, mouseY: y, mouseDown: true });
    expect(button.status).toBe(AntButton.DOWN);
    tick({ mouseX: x, mouseY: y, mouseDown: false });
    expect(button.status).toBe(AntButton.OVER);
    tick({ mouseX: 700, mouseY: 500 });
    expect(button.status).toBe(AntButton.NORMAL);
  });

  it('a click (press and release on the button) dispatches eventClick and plays the click sound; over plays the over sound', () => {
    let clicks = 0;
    (button.eventClick as NonNullable<AntButton['eventClick']>).add(() => clicks++);
    AntG.sounds.takeOneShots();
    const [x, y] = center(button);
    tick({ mouseX: x, mouseY: y });
    expect(AntG.sounds.takeOneShots()).toHaveLength(1); // SndOverButton
    tick({ mouseX: x, mouseY: y, mouseDown: true });
    expect(clicks).toBe(0);
    tick({ mouseX: x, mouseY: y, mouseDown: false });
    expect(clicks).toBe(1);
    expect(AntG.sounds.takeOneShots()).toHaveLength(1); // SndClickButton
  });

  it('pressing on the button and releasing outside is not a click; pressing outside and releasing on it is not a click', () => {
    let clicks = 0;
    (button.eventClick as NonNullable<AntButton['eventClick']>).add(() => clicks++);
    const [x, y] = center(button);
    tick({ mouseX: x, mouseY: y });
    tick({ mouseX: x, mouseY: y, mouseDown: true });
    tick({ mouseX: 700, mouseY: 500, mouseDown: true });
    tick({ mouseX: 700, mouseY: 500, mouseDown: false });
    expect(clicks).toBe(0);
    tick({ mouseX: 700, mouseY: 500, mouseDown: true });
    tick({ mouseX: x, mouseY: y, mouseDown: true });
    tick({ mouseX: x, mouseY: y, mouseDown: false });
    expect(clicks).toBe(0);
  });

  it('a disabled or invisible button does not react', () => {
    let clicks = 0;
    (button.eventClick as NonNullable<AntButton['eventClick']>).add(() => clicks++);
    const [x, y] = center(button);
    button.enabled = false;
    click(x, y);
    expect(clicks).toBe(0);
    button.enabled = true;
    state.layerInterface.visible = false;
    click(x, y);
    expect(clicks).toBe(0);
    state.layerInterface.visible = true;
    click(x, y);
    expect(clicks).toBe(1);
  });

  it('switchAnimation to an unknown name throws; toggle keeps the DOWN frame', () => {
    expect(() => button.switchAnimation('nope')).toThrow('Missing button animation "nope".');
    button.selected = true;
    expect(button.selected).toBe(false); // not a toggle button
    button.toggle = true;
    button.selected = true;
    expect(button.status).toBe(AntButton.DOWN);
  });

  it('is drawn as a node of the frame: the texture of the current state, the blend', () => {
    const writer = new FrameWriter();
    const camera = AntG.camera as NonNullable<typeof AntG.camera>;
    const frame = readFrame(writer.write({ root: state.defGroup, camera, tick: 0 }));
    const own = frame.nodes.find((n) => n.uid == ((button.entityId << 8) >>> 0));
    expect(own).toBeDefined();
    expect([own?.x, own?.y]).toEqual([200, 200]);
    expect((button.currentFrameMeta as { texId: number }).texId).toBe(own?.texId);
  });
});

describe.skipIf(!hasAssets)('Button, ButtonController, ButtonSwitch', () => {
  let state: GameState;

  beforeEach(() => {
    state = newGame(false);
  });

  it('Button.create makes the AntButton at (0, 0) of the button with the sounds and the tag; radius is half the width - 2', () => {
    const button = state.layerInterface.recycle(Button) as Button;
    let clicks = 0;
    button.create(100, 120, 'BtnPlay_mc', () => clicks++, 3);
    button.revive();
    const inner = antButtonOf(button);
    expect([button.x, button.y]).toEqual([100, 120]);
    expect(inner.soundClick).toBe('SndClickButton');
    expect(inner.soundOver).toBe('SndOverButton');
    expect(button.buttonTag).toBe(3);
    expect(button.radius).toBe(inner.width * 0.5 - 2);
    button.dispatchClickEvent();
    expect(clicks).toBe(1);
  });

  it('a selected Button throws sparks (FireEffect01_mc, additive) around the rim; they kill themselves at the end', () => {
    const button = state.layerInterface.recycle(Button) as Button;
    button.create(100, 120, 'BtnPlay_mc', () => {}, 0);
    button.selected = true;
    button.revive();
    ticks(40);
    const sparks = childrenOf(button, AntActor).filter((a) => a.currentAnimation == 'FireEffect01_mc');
    expect(sparks.length).toBeGreaterThan(0);
    expect(sparks.every((s) => s.blend == 'add' && s.z == 2)).toBe(true);
    ticks(300);
    expect(childrenOf(button, AntActor).length).toBeLessThan(40);
  });

  it('the caption is a Label (font04, centred) over the button', () => {
    const button = state.layerInterface.recycle(Button) as Button;
    button.create(100, 120, 'BtnPlay_mc', () => {}, 0);
    button.caption = 'Ab';
    const label = childrenOf(antButtonOf(button), Label)[0] as Label;
    expect(label.text).toBe('Ab');
    expect(label.align).toBe('center');
    expect(label.y).toBe(-label.height * 0.5);
  });

  it('ButtonController: LEFT / RIGHT move the selection (wrapping), SPACE or ENTER clicks the selected button on release', () => {
    const clicked: number[] = [];
    const buttons: Button[] = [];
    for (let i = 0; i < 3; i++) {
      const b = state.layerInterface.recycle(Button) as Button;
      b.create(100 + i * 100, 100, 'BtnPlay_mc', () => clicked.push(i), i);
      b.selected = i == 1;
      b.revive();
      buttons.push(b);
    }

    const controller = new ButtonController(buttons);
    const selected = (): number => buttons.findIndex((b) => b.selected);
    expect(selected()).toBe(1);
    const press = (key: number): void => {
      tick({ keysDown: [key] });
      controller.update();
      tick({});
      controller.update();
    };
    const LEFT = 37;
    const RIGHT = 39;
    press(RIGHT);
    expect(selected()).toBe(2);
    press(RIGHT);
    expect(selected()).toBe(0);
    press(LEFT);
    expect(selected()).toBe(2);
    // SPACEBAR: down, then released -> click of the selected button
    tick({ keysDown: [KEY_SPACE] });
    controller.update();
    expect(buttons[2]?.isDown).toBe(true);
    tick({});
    controller.update();
    expect(buttons[2]?.isDown).toBe(false);
    expect(clicked).toEqual([2]);
    // pause(): the buttons are not active, the keys do nothing
    controller.pause();
    expect(buttons.every((b) => !b.active)).toBe(true);
    press(LEFT);
    expect(selected()).toBe(2);
    controller.resume();
    expect(buttons.every((b) => b.active)).toBe(true);
    controller.destroy();
  });

  it('ButtonSwitch: a click switches on/off, dispatches eventSwitch(Boolean), the caption and the status are placed at the button', () => {
    const sw = state.layerInterface.recycle(ButtonSwitch) as ButtonSwitch;
    sw.reset(300, 300);
    sw.addCaption(Text.extract('EffectsText_visual'));
    sw.addStatus(Text.extract('FancyText_visual'), Text.extract('QuickText_visual'));
    const values: boolean[] = [];
    sw.eventSwitch.add((v) => values.push(v));
    const inner = childrenOf(sw, AntButton)[0] as AntButton;
    expect(inner.currentAnimation).toBe('off');
    ticks(2);
    const [x, y] = center(inner);
    click(x, y);
    expect(values).toEqual([true]);
    expect(sw.selected).toBe(true);
    expect(inner.currentAnimation).toBe('on');
    click(x, y);
    expect(values).toEqual([true, false]);
    expect(inner.currentAnimation).toBe('off');
    const actors = childrenOf(sw, AntActor);
    const caption = actors.find((a) => a.currentAnimation == 'EffectsTextEN_mc') as AntActor;
    const status = actors.find((a) => a.currentAnimation == 'off') as AntActor;
    expect(caption.x).toBe(-caption.width * 0.5 - inner.width * 0.5 - 3);
    expect(status.x).toBe(status.width * 0.5 + inner.width * 0.5 + 3);
    expect(status.currentAnimation).toBe('off');
    sw.selected = true;
    expect(status.currentAnimation).toBe('on');
  });
});

describe.skipIf(!hasAssets)('PausePopupView', () => {
  let state: GameState;
  let popup: PausePopupView;

  beforeEach(() => {
    state = newGame(false);
    G.gameData.fancyEffects = true;
    G.gameData.fancyQuality = false;
    popup = state.layerPopups.recycle(PausePopupView) as PausePopupView;
    popup.show();
    ticks(40);
  });

  it('slides in from below to y = 330 and shows the two switches (Effects, Quality) with the state of GameData', () => {
    expect([popup.x, popup.y]).toEqual([400, 330]);
    const switches = childrenOf(popup, ButtonSwitch);
    expect(switches).toHaveLength(2);
    expect(switches.map((s) => s.selected)).toEqual([true, false]);
    expect(switches.map((s) => [s.x, s.y])).toEqual([
      [0, -79],
      [0, -29],
    ]);
    const buttons = childrenOf(popup, Button);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => [b.x, b.y])).toEqual([
      [-113, 73],
      [0, 122],
      [113, 73],
    ]);
    expect(buttons.map((b) => b.selected)).toEqual([false, true, false]); // Play is selected
  });

  it('the switches change GameData.fancyEffects / fancyQuality (and call setFancyQuality)', () => {
    const [effects, quality] = childrenOf(popup, ButtonSwitch) as [ButtonSwitch, ButtonSwitch];
    const effectsButton = childrenOf(effects, AntButton)[0] as AntButton;
    const qualityButton = childrenOf(quality, AntButton)[0] as AntButton;
    click(...center(effectsButton));
    expect(G.gameData.fancyEffects).toBe(false);
    expect(effects.selected).toBe(false);
    click(...center(qualityButton));
    expect(G.gameData.fancyQuality).toBe(true);
    expect(quality.selected).toBe(true);
    click(...center(qualityButton));
    expect(G.gameData.fancyQuality).toBe(false);
  });

  it('the buttons Main menu, Play and Restart dispatch their signals once (the signals are cleared after a click)', () => {
    const log: string[] = [];
    popup.eventClickMenu.add(() => log.push('menu'));
    popup.eventClickResume.add(() => log.push('resume'));
    popup.eventClickRestart.add(() => log.push('restart'));
    const buttons = childrenOf(popup, Button);
    click(...center(antButtonOf(buttons[0] as Button)));
    expect(log).toEqual(['menu']);
    click(...center(antButtonOf(buttons[1] as Button)));
    expect(log).toEqual(['menu']); // the signals were cleared
  });

  it('hide() slides it down and kills it with its buttons', () => {
    popup.hide();
    ticks(40);
    expect(popup.exists).toBe(false);
    expect(childrenOf(popup, Button)).toHaveLength(0);
  });
});

describe.skipIf(!hasAssets)('Pause and game over in Level01 (DevGameScreen)', () => {
  let state: GameState;

  beforeEach(() => {
    state = newGame();
    state.debugStartLevel('Level01');
    ticks(40);
  });

  it('P opens the pause: the world is paused, PopupFadeView is below PausePopupView in layerPopups', () => {
    expect(G.gamePause).toBe(false);
    tick({ keysDown: [KEY_P] });
    expect(G.gamePause).toBe(true);
    const screen = state.devGameScreen as NonNullable<GameState['devGameScreen']>;
    expect(screen.pausePopup).not.toBeNull();
    const popups = (state.layerPopups.children ?? []).filter((c) => c != null && c.exists);
    const fade = popups.findIndex((c) => c instanceof PopupFadeView);
    const pause = popups.findIndex((c) => c instanceof PausePopupView);
    expect(fade).toBeGreaterThanOrEqual(0);
    expect(pause).toBeGreaterThan(fade);
  });

  it('the shuttle does not move while the game is paused', () => {
    const shuttle = (shuttles()[0] as ShuttleNode).display.view as AntEntity;
    tick({ keysDown: [KEY_P] });
    tick({});
    const before = [shuttle.x, shuttle.y];
    ticks(30, { keysDown: [38] });
    expect([shuttle.x, shuttle.y]).toEqual(before);
  });

  it('P again resumes; "Restart" and "Main menu" call the MenuSystem (STUB(T2.6): it remembers the screen)', () => {
    const menu = G.core.getSystem(MenuSystem) as MenuSystem;
    tick({ keysDown: [KEY_P] });
    tick({});
    tick({ keysDown: [KEY_P] });
    expect(G.gamePause).toBe(false);
    ticks(40);
    expect(childrenOf(state.layerPopups, PausePopupView)).toHaveLength(0);

    for (const [index, screenName] of [
      [2, MenuSystem.RESTART_LEVEL_SCREEN],
      [0, MenuSystem.SELECT_LEVEL_SCREEN],
    ] as const) {
      state.devGameScreen!.listenFocusLost = false;
      tick({});
      tick({ keysDown: [KEY_P] });
      tick({});
      ticks(40);
      const popup = state.devGameScreen!.pausePopup as PausePopupView;
      const button = childrenOf(popup, Button)[index] as Button;
      click(...center(antButtonOf(button)));
      expect(menu.currentScreen).toBe(screenName);
      expect(G.gamePause).toBe(false);
      ticks(60);
      // the hotkeys are off after Restart / Main menu (the screen is left)
      tick({ keysDown: [KEY_P] });
      expect(G.gamePause).toBe(false);
      tick({});
      (state.devGameScreen as unknown as { _listenHotkeys: boolean })._listenHotkeys = true;
    }
  });

  it('"Resume" (Play) closes the popup by the mouse', () => {
    tick({ keysDown: [KEY_P] });
    tick({});
    ticks(40);
    const popup = state.devGameScreen!.pausePopup as PausePopupView;
    click(...center(antButtonOf(childrenOf(popup, Button)[1] as Button)));
    expect(G.gamePause).toBe(false);
    expect(state.devGameScreen!.pausePopup).toBeNull();
  });

  it('SPACE on the selected button of the popup (Play) resumes the game', () => {
    tick({ keysDown: [KEY_P] });
    tick({});
    ticks(40);
    tick({ keysDown: [KEY_SPACE] });
    tick({});
    expect(G.gamePause).toBe(false);
  });

  it('the last life is lost: the popup of the original appears (GAME OVER, Main menu and Restart); Restart calls the MenuSystem', () => {
    const logs: string[] = [];
    AntG.log = (m: string) => logs.push(m);
    G.gameData.resetLives('Player1', 0);
    const first = shuttles()[0] as ShuttleNode;
    first.stats.hull = 0.1;
    first.model.hasHit = true;
    ticks(80);
    expect((G.core.getSystem(UISystem) as UISystem).isGameOver).toBe(true);
    const screen = state.devGameScreen as NonNullable<GameState['devGameScreen']>;
    const popup = screen.gameoverPopup as GameOverPopupView;
    expect(popup).not.toBeNull();
    ticks(40);
    expect([popup.x, popup.y]).toEqual([400, 330]);
    expect(popup.currentAnimation).toBe('GameOverPopupBG_mc');
    const title = childrenOf(popup, AntActor).find((a) => a.currentAnimation == 'GameOverTextEN_mc');
    expect(title).toBeDefined();
    const buttons = childrenOf(popup, Button);
    expect(buttons.map((b) => [b.x, b.y, b.selected])).toEqual([
      [-69, 100, false],
      [69, 100, true],
    ]);
    // the pause hotkey is off and the screen does not listen to the focus any more
    tick({ keysDown: [KEY_P] });
    expect(G.gamePause).toBe(false);
    expect(screen.listenFocusLost).toBe(false);
    // Restart
    const menu = G.core.getSystem(MenuSystem) as MenuSystem;
    click(...center(antButtonOf(buttons[1] as Button)));
    expect(menu.currentScreen).toBe(MenuSystem.RESTART_LEVEL_SCREEN);
  });

  it('the frame of the paused game carries the nodes of the popup (the background, the title, the buttons)', () => {
    tick({ keysDown: [KEY_P] });
    tick({});
    ticks(40);
    const writer = new FrameWriter();
    const frame = readFrame(writer.write({ root: state.defGroup, camera: AntG.camera as NonNullable<typeof AntG.camera>, tick: 1 }));
    const popup = (state.devGameScreen as NonNullable<GameState['devGameScreen']>).pausePopup as PausePopupView;
    const uid = (e: AntEntity): number => (e.entityId << 8) >>> 0;
    const uids = new Set(frame.nodes.map((n) => n.uid));
    expect(uids.has(uid(popup))).toBe(true);
    for (const b of childrenOf(popup, Button)) {
      expect(uids.has(uid(antButtonOf(b)))).toBe(true);
    }
    // the popup is drawn after (over) the fade and the HUD: later in the list
    const order = frame.nodes.map((n) => n.uid);
    const fade = childrenOf(state.layerPopups, PopupFadeView)[0] as PopupFadeView;
    expect(order.indexOf(uid(popup))).toBeGreaterThan(order.indexOf(uid(fade)));
    const bar = childrenOf(state.layerInterface, PassengerBarUIView)[0] as PassengerBarUIView; // the HUD
    expect(order.indexOf(uid(bar))).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(uid(fade))).toBeGreaterThan(order.indexOf(uid(bar)));
  });
});

describe.skipIf(!hasAssets)('KeyInputPopupView', () => {
  it('takes the pressed key and returns its name of AvailKeys (the label shows its character)', () => {
    const state = newGame(false);
    const popup = state.layerPopups.recycle(KeyInputPopupView) as KeyInputPopupView;
    popup.show();
    ticks(40);
    expect(popup.keyValue).toBeNull();
    const label = childrenOf(popup, Label)[0] as Label;
    expect(label.text).toBe('Press any key');
    tick({ keysDown: [KEY_W] });
    expect(popup.keyValue).toBe('W');
    expect(label.text).toBe('Pressed W key');
    expect(Object.keys(Config.availKeys.keys)).toContain(popup.keyValue);
    tick({});
    tick({ keysDown: [38] });
    expect(popup.keyValue).toBe('UP');
    expect(label.text).toBe('Pressed ^ key');
    tick({});
    tick({ keysDown: [48] });
    expect(popup.keyValue).toBe('ZERO');
    expect(label.text).toBe('Pressed 0 key');
  });

  it('every key of AvailKeys is a key of AntKeyboard', () => {
    newGame(false);
    for (const name of Object.keys(Config.availKeys.keys)) {
      expect(() => AntG.keys.isPressed(name), name).not.toThrow();
    }
  });

  it('Apply dispatches eventClickApply once', () => {
    const state = newGame(false);
    const popup = state.layerPopups.recycle(KeyInputPopupView) as KeyInputPopupView;
    popup.show();
    ticks(40);
    let n = 0;
    popup.eventClickApply.add(() => n++);
    click(...center(antButtonOf(childrenOf(popup, Button)[0] as Button)));
    click(...center(antButtonOf(childrenOf(popup, Button)[0] as Button)));
    expect(n).toBe(1);
  });
});

describe.skipIf(!hasAssets)('Confirm, GameOver and Mission popups', () => {
  let state: GameState;

  beforeEach(() => {
    state = newGame(false);
  });

  it('ConfirmPopupView: Yes / No (No is selected), the title of ConfirmText_visual', () => {
    const popup = state.layerPopups.recycle(ConfirmPopupView) as ConfirmPopupView;
    popup.show();
    ticks(40);
    expect([popup.x, popup.y]).toEqual([400, 330]);
    expect(childrenOf(popup, AntActor).some((a) => a.currentAnimation == 'ConfirmTextEN_mc')).toBe(true);
    const buttons = childrenOf(popup, Button);
    expect(buttons.map((b) => [b.x, b.selected])).toEqual([
      [-69, false],
      [69, true],
    ]);
    const log: string[] = [];
    popup.eventClickYes.add(() => log.push('yes'));
    popup.eventClickNo.add(() => log.push('no'));
    click(...center(antButtonOf(buttons[0] as Button)));
    expect(log).toEqual(['yes']);
    popup.hide();
    ticks(40);
    expect(popup.exists).toBe(false);
  });

  it('GameOverPopupView: the keyboard (RIGHT is Restart, it is selected; LEFT then SPACE is Main menu)', () => {
    const popup = state.layerPopups.recycle(GameOverPopupView) as GameOverPopupView;
    popup.show();
    ticks(40);
    const log: string[] = [];
    popup.eventClickMenu.add(() => log.push('menu'));
    popup.eventClickRestart.add(() => log.push('restart'));
    tick({ keysDown: [37] });
    tick({});
    tick({ keysDown: [KEY_SPACE] });
    tick({});
    expect(log).toEqual(['menu']);
  });

  it('MissionPopupView: the icon, the title, the name and the hint; Apply is selected', () => {
    const popup = state.layerPopups.recycle(MissionPopupView) as MissionPopupView;
    popup.iconName = 'IconPassengerOrange_mc';
    popup.titleText = 'NEW MISSION';
    popup.itemText = 'Taxi';
    popup.hintText = 'Deliver 10 passengers.';
    popup.show();
    ticks(40);
    expect(popup.iconName).toBe('IconPassengerOrange_mc');
    expect([popup.titleText, popup.itemText, popup.hintText]).toEqual(['NEW MISSION', 'Taxi', 'Deliver 10 passengers.']);
    const labels = childrenOf(popup, AntLabel);
    expect(labels.map((l) => l.text)).toEqual(['NEW MISSION', 'Taxi']);
    expect(labels[0]?.x).toBe(-labels[0]!.width * 0.5);
    expect(childrenOf(popup, Button)[0]?.selected).toBe(true);
    let n = 0;
    popup.eventClickApply.add(() => n++);
    tick({ keysDown: [KEY_SPACE] });
    tick({});
    expect(n).toBe(1);
  });
});

describe.skipIf(!hasAssets)('The other views of ui/', () => {
  let state: GameState;

  beforeEach(() => {
    state = newGame(true);
    state.debugStartLevel('Level01');
    ticks(5);
  });

  it('MissionBarUIView: the bar fills with value / maxValue, the goal shows the rounded value only when maxValue > 1; the lights are overlay', () => {
    const bar = state.layerInterface.recycle(MissionBarUIView) as MissionBarUIView;
    bar.reset(400, 560);
    bar.maxValue = 10;
    bar.value = 5;
    expect(bar.currentFrame).toBe(Math.min(bar.totalFrames, Math.max(1, Math.ceil((5 / 10) * bar.totalFrames))));
    bar.description = 'Deliver 10 passengers.';
    bar.icon = 'IconPassengerOrange_mc';
    expect(bar.icon).toBe('IconPassengerOrange_mc');
    expect(bar.description).toBe('Deliver 10 passengers.');
    bar.maxValue = 1;
    expect(bar.enableEffect).toBe(false);
    bar.enableEffect = true;
    expect(bar.enableEffect).toBe(true);
    bar.show();
    expect(bar.isAnimation).toBe(true);
    ticks(40);
    expect(bar.isAnimation).toBe(false);
    expect(bar.y).toBe(560);
    // advanced blend modes: both lights are written as overlay nodes
    const writer = new FrameWriter();
    const frame = readFrame(writer.write({ root: state.defGroup, camera: AntG.camera as NonNullable<typeof AntG.camera>, tick: 1 }));
    const overlay = frame.nodes.filter((n) => ((n.flags >> 4) & 3) == BLEND_OVERLAY);
    expect(overlay.length).toBeGreaterThanOrEqual(2);
    bar.hide();
    ticks(40);
    expect(bar.y).toBe(626);
  });

  it('LevelStatsColumn: the bar fills up to the value; isFinished; the title pops up; the ship / engine animations are numbers', () => {
    const column = state.layerInterface.recycle(LevelStatsColumn) as LevelStatsColumn;
    column.reset(300, 400);
    column.shuttleKind = 2;
    column.shuttleColor = 3;
    column.engineKind = 4;
    column.engineColor = 2;
    expect([column.shuttleKind, column.shuttleColor, column.engineKind, column.engineColor]).toEqual([2, 3, 4, 2]);
    column.maxValue = 100;
    column.value = 40;
    expect(column.isFinished).toBe(false);
    ticks(80);
    expect(column.aniValue).toBe(40);
    expect(column.isFinished).toBe(true);
    column.showTitle('P1');
    ticks(10);
  });

  it('LevelStatsView / LevelStatsGoalView: the goals stand at their share of the height; isEarnGoal gives each goal once', () => {
    const view = state.layerInterface.recycle(LevelStatsView) as LevelStatsView;
    view.addGoal(10);
    view.addGoal(20);
    view.addGoal(40);
    view.setMaxGoal(40);
    const goals = childrenOf(view, LevelStatsGoalView);
    expect(goals.map((g) => g.value)).toEqual([10, 20, 40]);
    expect(goals.map((g) => g.y)).toEqual([-Math.round(0.25 * 202), -Math.round(0.5 * 202), -202]);
    expect(view.isEarnGoal(15)).toBe(true);
    expect(view.isEarnGoal(15)).toBe(false);
    expect(view.isEarnGoal(25)).toBe(true);
    expect(view.isEarnGoal(25)).toBe(false);
    expect(view.isEarnGoal(100)).toBe(true);
    expect(view.isEarnGoal(100)).toBe(false);
  });

  it('LevelStatsStarsView: addStar puts the stars at their places (3 at most) and plays a coin sound', () => {
    const stars = state.layerInterface.recycle(LevelStatsStarsView) as LevelStatsStarsView;
    stars.reset(400, 200);
    AntG.sounds.takeOneShots();
    stars.addStar();
    stars.addStar();
    stars.addStar();
    stars.addStar();
    expect(stars.stars).toBe(3);
    const children = childrenOf(stars, AntActor);
    expect(children.map((c) => [c.x, c.y, c.currentAnimation])).toEqual([
      [-87, 15, 'StarMiddle_mc'],
      [0, 0, 'StarBig_mc'],
      [87, 15, 'StarMiddle_mc'],
    ]);
    expect(AntG.sounds.takeOneShots()).toHaveLength(3);
    ticks(70);
    expect(children.every((c) => c.scaleX == 1)).toBe(true);
  });

  it('ShuttlePreviewView: the kind / colour select the animation and the frame; beginUpdate / endUpdate batch the changes', () => {
    const preview = state.layerInterface.recycle(ShuttlePreviewView) as ShuttlePreviewView;
    const [engine, shuttle] = childrenOf(preview, AntActor) as [AntActor, AntActor];
    // a kind that is still 0 has no animation: the original sets all four between beginUpdate and endUpdate
    preview.beginUpdate();
    preview.shuttleKind = 2;
    preview.shuttleColor = 3;
    preview.engineKind = 4;
    preview.engineColor = 2;
    preview.endUpdate();
    expect(shuttle.currentAnimation).toBe('2');
    expect(engine.currentAnimation).toBe('4');
    expect([shuttle.currentFrame, engine.currentFrame]).toEqual([3, 2]);
    preview.beginUpdate();
    preview.shuttleKind = 1;
    preview.shuttleColor = 1;
    expect(shuttle.currentAnimation).toBe('2');
    preview.endUpdate();
    expect(shuttle.currentAnimation).toBe('1');
    expect(shuttle.currentFrame).toBe(1);
    preview.enableAnimation = true;
    preview.shuttleColor = 2;
    expect(shuttle.scaleX).toBe(0.75);
    ticks(40);
    expect(shuttle.scaleX).toBe(1);
  });

  it('ButtonBarView: the buttons are a column; a click selects (once) and dispatches the value; value and setValueFrom select by value', () => {
    const bar = state.layerInterface.recycle(ButtonBarView) as ButtonBarView;
    bar.reset(200, 200);
    bar.name = 'Player1';
    bar.prop = 'shuttleKind';
    bar.addButton('BtnYellow_mc', 'BtnYellowSelected_mc', 1, true);
    bar.addButton('BtnRed_mc', 'BtnRedSelected_mc', 2);
    bar.addButton('BtnPink_mc', 'BtnPinkSelected_mc', 3);
    const buttons = childrenOf(bar, AntButton);
    expect(buttons.map((b) => b.y)).toEqual([0, 23, 46]);
    expect(bar.value).toBe(1);
    const values: number[] = [];
    bar.eventSelected.add((v) => values.push(v));
    ticks(2);
    click(...center(buttons[2] as AntButton));
    expect(values).toEqual([3]);
    expect(bar.value).toBe(3);
    click(...center(buttons[2] as AntButton));
    expect(values).toEqual([3]);
    const data = new PlayerData('Player1');
    data.shuttleKind = 2;
    bar.setValueFrom(data);
    expect(bar.value).toBe(2);
    bar.name = 'Player2';
    data.shuttleKind = 3;
    bar.setValueFrom(data);
    expect(bar.value).toBe(2); // another player
    bar.value = 7;
    expect(bar.value).toBe(0);
  });

  it('FadeEffectView / PopupFadeView / ScreenFadeView / NotifyView / ShipSelector*View / LevelStarView work', () => {
    const fade = state.layerInterface.recycle(FadeEffectView) as FadeEffectView;
    AntG.sounds.takeOneShots();
    fade.show();
    expect(fade.currentAnimation).toBe('show');
    expect(fade.isPlaying).toBe(true);
    expect(fade.repeat).toBe(false);
    ticks(80);
    expect(fade.isPlaying).toBe(false);
    fade.hide();
    expect(fade.currentAnimation).toBe('hide');
    expect(AntG.sounds.takeOneShots()).toHaveLength(2);

    const popupFade = state.layerPopups.recycle(PopupFadeView) as PopupFadeView;
    popupFade.show();
    expect(popupFade.alpha).toBe(0);
    ticks(40);
    expect(popupFade.alpha).toBe(1);
    popupFade.hide();
    ticks(60);
    expect(popupFade.exists).toBe(false);

    expect((state.layerInterface.recycle(ScreenFadeView) as ScreenFadeView).currentAnimation).toBe('ScreenFade_mc');
    const notify = state.layerInterface.recycle(NotifyView) as NotifyView;
    expect([notify.z, notify.isPlaying]).toEqual([100, true]);
    const selector = state.layerInterface.recycle(ShipSelectorView) as ShipSelectorView;
    expect([selector.z, selector.animationSpeed, selector.isPlaying]).toEqual([500, 0.5, true]);
    const wave = state.layerInterface.recycle(ShipSelectorWaveView) as ShipSelectorWaveView;
    expect(wave.blend).toBe('add');
    wave.play();
    wave.repeat = false;
    ticks(200);
    expect(wave.exists).toBe(false);
    expect((state.layerInterface.recycle(LevelStarView) as LevelStarView).currentAnimation).toBe('BtnStar_mc');
  });

  it('the fonts of AntLabel exist in the cache', () => {
    expect(Font.fromCache('font03').name).toBe('font03');
  });
});
