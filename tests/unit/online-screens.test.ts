// T3.4: the screens of the LAN game (Online, Host, Join), the field of the address (TextInputView), OnlineBridge.
// The whole flow is driven with the mouse and the keys through the simulation, the renderer is replaced by the list of
// the requests that the screens send.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AntButton } from '../../src/engine/core/AntButton';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { Anthill } from '../../src/engine/core/Anthill';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntMath } from '../../src/engine/utils/AntMath';
import type { Ctor } from '../../src/engine/utils/types';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { Label } from '../../src/game/fonts/Label';
import { G } from '../../src/game/G';
import { Ground } from '../../src/game/map/Ground';
import {
  formatJoinAddress,
  JOIN_FAILURE_TEXTS,
  OnlineBridge,
  parseJoinAddress,
} from '../../src/game/online/OnlineBridge';
import type { OnlineRequest } from '../../src/game/online/OnlineBridge';
import { Button } from '../../src/game/screens/Button';
import { HostScreen } from '../../src/game/screens/HostScreen';
import { JoinScreen } from '../../src/game/screens/JoinScreen';
import { MainMenuScreen } from '../../src/game/screens/MainMenuScreen';
import { OnlineScreen } from '../../src/game/screens/OnlineScreen';
import { SelectLevelScreen } from '../../src/game/screens/SelectLevelScreen';
import type { GameState } from '../../src/game/states/GameState';
import { PrepareState } from '../../src/game/states/PrepareState';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { TextInputView } from '../../src/game/ui/TextInputView';
import { hasAssets, loadAssets } from './helpers/assets';

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

afterEach(() => {
  Ground.body = null;
  Ground.stopperList = null;
  OnlineBridge.reset();
  vi.restoreAllMocks();
});

describe('parseJoinAddress, formatJoinAddress', () => {
  it('ip or ip:port, IPv4 only, the octets 0..255 and the port 1..65535', () => {
    expect(parseJoinAddress('192.168.0.5', 47020)).toEqual({ host: '192.168.0.5', port: 47020 });
    expect(parseJoinAddress(' 10.0.0.1:5000 ', 47020)).toEqual({ host: '10.0.0.1', port: 5000 });
    expect(parseJoinAddress('010.000.000.001', 47020)).toEqual({ host: '10.0.0.1', port: 47020 });
    for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.4:', '1.2.3.4:0', '1.2.3.4:65536', 'a.b.c.d', '1.2.3.4:5:6']) {
      expect(parseJoinAddress(bad, 47020), bad).toBeNull();
    }
  });

  it('the default port is left out of the address', () => {
    expect(formatJoinAddress('192.168.0.5', 47020, 47020)).toBe('192.168.0.5');
    expect(formatJoinAddress('192.168.0.5', 5000, 47020)).toBe('192.168.0.5:5000');
  });
});

describe('OnlineBridge', () => {
  it('keeps the events of the renderer as state and counts them', () => {
    const v = OnlineBridge.version;
    OnlineBridge.receive({ k: 'info', port: 5000, lastJoinAddress: '1.2.3.4' });
    expect([OnlineBridge.port, OnlineBridge.lastJoinAddress]).toEqual([5000, '1.2.3.4']);
    OnlineBridge.receive({ k: 'host', status: 'waiting', addresses: ['10.0.0.2'], port: 5000 });
    OnlineBridge.receive({ k: 'host', status: 'connected', peerName: 'MAC' });
    expect(OnlineBridge.host).toEqual({ status: 'connected', addresses: ['10.0.0.2'], port: 5000, peerName: 'MAC', message: '' });
    OnlineBridge.receive({ k: 'openJoin', reason: 'full' });
    expect(OnlineBridge.joinFailure).toBe('full');
    expect(OnlineBridge.version).toBe(v + 4);
    OnlineBridge.reset();
    expect(OnlineBridge.host.status).toBe('idle');
    expect(OnlineBridge.joinFailure).toBeNull();
  });

  it('the texts of the failures (docs/tasks/T3.4)', () => {
    expect(JOIN_FAILURE_TEXTS).toEqual({
      failed: 'CONNECTION FAILED',
      full: 'HOST IS FULL',
      version: 'DIFFERENT GAME VERSION',
      lost: 'CONNECTION LOST',
    });
  });
});

//---------------------------------------
// The game
//---------------------------------------

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

/** A key: down for one tick, up for the next one. */
function press(aCode: number, aMouse = {}): void {
  tick({ keysDown: [aCode], ...aMouse });
  tick(aMouse);
}

function menu(): MenuSystem {
  return G.core.getSystem(MenuSystem) as MenuSystem;
}

function waitScreen(aClass: Ctor<unknown>, aMax = 400): void {
  for (let i = 0; i < aMax && !(menu().currentScreen instanceof aClass); i++) {
    tick();
  }

  expect(menu().currentScreen).toBeInstanceOf(aClass);
  ticks(120); // (the buttons appear one after another)
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

function buttonsOf(aState: GameState): AntButton[] {
  return all(aState.layerMenu, Button).map((b) => antButtonOf(b));
}

function clickButton(aState: GameState, aAnim: string): void {
  const button = buttonsOf(aState).find((b) => b.currentAnimation == aAnim);
  expect(button, aAnim).toBeDefined();
  click(...centerOf(button as AntButton));
}

/** The texts of the labels on the screen. */
function texts(aState: GameState): string[] {
  return all(aState.layerMenu, Label)
    .map((l) => l.text.trim())
    .filter((t) => t != '');
}

function requests(): OnlineRequest[] {
  const sent: OnlineRequest[] = [];
  OnlineBridge.send = (r) => sent.push(r);
  return sent;
}

/** The main menu of a new game, the Online screen open. */
function openOnline(aState: GameState): void {
  ticks(150);
  clickButton(aState, 'BtnRestart_mc');
  waitScreen(OnlineScreen);
}

describe.skipIf(!hasAssets)('MainMenuScreen, OnlineScreen', () => {
  it('the main menu has the button Online at the place of the removed MoreGames, the others are where they were', () => {
    const state = newGame();
    ticks(150);
    const online = all(state.layerMenu, Button).find((b) => antButtonOf(b).currentAnimation == 'BtnRestart_mc') as Button;
    const credits = all(state.layerMenu, Button).find((b) => antButtonOf(b).currentAnimation == 'BtnCredits_mc') as Button;
    const play = all(state.layerMenu, Button).find((b) => antButtonOf(b).currentAnimation == 'BtnPlay_mc') as Button;
    expect([credits.x, credits.y, play.x, play.y, online.x, online.y]).toEqual([288, 385, 400, 385, 512, 385]);
    expect(play.selected).toBe(true);
    expect(texts(state)).toContain('ONLINE');
  });

  it('Online: Host game, Join game, Back; Back and Esc lead to the main menu', () => {
    const state = newGame();
    openOnline(state);
    expect(texts(state)).toEqual(expect.arrayContaining(['HOST GAME', 'JOIN GAME', 'BACK']));
    clickButton(state, 'BtnCancel_mc');
    waitScreen(MainMenuScreen);
    clickButton(state, 'BtnRestart_mc');
    waitScreen(OnlineScreen);
    press(27); // Esc
    waitScreen(MainMenuScreen);
  });
});

describe.skipIf(!hasAssets)('HostScreen', () => {
  it('opens the host on entering, shows the addresses, the port and the player, Stop closes the host', () => {
    const state = newGame();
    const sent = requests();
    openOnline(state);
    clickButton(state, 'BtnPlay_mc'); // Host game
    waitScreen(HostScreen);
    expect(sent).toEqual([{ k: 'hostOpen' }]);
    expect(texts(state)).toContain('STARTING...');

    OnlineBridge.receive({ k: 'host', status: 'waiting', addresses: ['192.168.1.20', '10.0.0.7'], port: 47020 });
    ticks(2);
    expect(texts(state)).toEqual(expect.arrayContaining(['192.168.1.20:47020', '10.0.0.7:47020', 'WAITING FOR PLAYER...']));

    OnlineBridge.receive({ k: 'host', status: 'connected', peerName: 'macbook' });
    ticks(2);
    expect(texts(state)).toContain('PLAYER 2 CONNECTED: MACBOOK');
    expect(texts(state)).not.toContain('WAITING FOR PLAYER...');

    clickButton(state, 'BtnCancel_mc'); // Stop
    expect(sent).toEqual([{ k: 'hostOpen' }, { k: 'hostClose' }]);
    waitScreen(OnlineScreen);
    expect(sent).toEqual([{ k: 'hostOpen' }, { k: 'hostClose' }]); // (once)
  });

  it('a host that cannot start tells why; no address is told', () => {
    const state = newGame();
    requests();
    openOnline(state);
    clickButton(state, 'BtnPlay_mc');
    waitScreen(HostScreen);
    OnlineBridge.receive({ k: 'host', status: 'error', message: 'Cannot start the host: port in use' });
    ticks(2);
    expect(texts(state)).toContain('CANNOT START THE HOST: PORT IN USE');
    OnlineBridge.receive({ k: 'host', status: 'waiting', addresses: [], port: 47020 });
    ticks(2);
    expect(texts(state)).toContain('NO NETWORK ADDRESS');
  });

  it('Start goes to the level selection and leaves the server up (hostBegin), Stop is not sent', () => {
    const state = newGame();
    const sent = requests();
    openOnline(state);
    clickButton(state, 'BtnPlay_mc');
    waitScreen(HostScreen);
    clickButton(state, 'BtnPlay_mc'); // Start (the only BtnPlay_mc now: the Host button of the Online screen is gone)
    waitScreen(SelectLevelScreen);
    expect(sent).toEqual([{ k: 'hostOpen' }, { k: 'hostBegin' }]);
  });

  it('T3.7: the port is told, TEST asks the renderer and shows OK / FAIL', () => {
    const state = newGame();
    const sent = requests();
    openOnline(state);
    clickButton(state, 'BtnPlay_mc');
    waitScreen(HostScreen);
    OnlineBridge.receive({ k: 'host', status: 'waiting', addresses: ['192.168.1.20'], port: 5000 });
    ticks(2);
    expect(texts(state)).toEqual(expect.arrayContaining(['YOUR ADDRESSES - PORT 5000', 'TEST']));
    clickButton(state, 'BtnApply_mc');
    expect(sent).toEqual([{ k: 'hostOpen' }, { k: 'hostTest' }]);
    OnlineBridge.receive({ k: 'selfTest', state: 'running', text: 'TESTING...' });
    ticks(2);
    expect(texts(state)).toContain('TESTING...');
    OnlineBridge.receive({ k: 'selfTest', state: 'ok', text: 'OK 192.168.1.20' });
    ticks(2);
    expect(texts(state)).toContain('OK 192.168.1.20');
    expect(texts(state)).not.toContain('TESTING...');
    OnlineBridge.receive({ k: 'selfTest', state: 'fail', text: 'FAIL ECONNREFUSED 192.168.1.20' });
    ticks(2);
    const fail = all(state.layerMenu, Label).find((l) => l.text == 'FAIL ECONNREFUSED 192.168.1.20') as Label;
    const ok = all(state.layerMenu, Label).find((l) => l.text == 'WAITING FOR PLAYER...') as Label;
    expect(fail.color).not.toBe(ok.color); // (red)
    // a player who connects does not wipe the result of the test
    OnlineBridge.receive({ k: 'host', status: 'connected', peerName: 'macbook' });
    ticks(2);
    expect(texts(state)).toContain('PLAYER 2 CONNECTED: MACBOOK');
  });

  it('Esc is Stop', () => {
    const state = newGame();
    const sent = requests();
    openOnline(state);
    clickButton(state, 'BtnPlay_mc');
    waitScreen(HostScreen);
    press(27);
    waitScreen(OnlineScreen);
    expect(sent).toEqual([{ k: 'hostOpen' }, { k: 'hostClose' }]);
  });
});

/** The list of games for the Join screen. */
const GAMES = [
  { ip: '192.168.1.20', hostName: 'MacBook-Pro', port: 47020, status: 'waiting' as const, buildHashMatches: true },
  { ip: '192.168.1.31', hostName: 'Old-PC', port: 47020, status: 'waiting' as const, buildHashMatches: false },
  { ip: '192.168.1.44', hostName: 'Busy', port: 5000, status: 'full' as const, buildHashMatches: true },
];

function openJoin(aState: GameState): OnlineRequest[] {
  const sent = requests();
  openOnline(aState);
  clickButton(aState, 'BtnCredits_mc'); // Join game
  waitScreen(JoinScreen);
  return sent;
}

describe.skipIf(!hasAssets)('JoinScreen', () => {
  it('listens for the games on entering, shows up to five of them, "different version" and "full" are grey', () => {
    const state = newGame();
    const sent = openJoin(state);
    expect(sent).toEqual([{ k: 'scanOpen' }]);
    expect(texts(state)).toContain('SEARCHING FOR GAMES...');

    OnlineBridge.receive({ k: 'games', games: [...GAMES, ...GAMES, ...GAMES] });
    ticks(2);
    const t = texts(state);
    expect(t).toEqual(expect.arrayContaining(['MacBook-Pro', '192.168.1.20:47020', 'WAITING', 'DIFFERENT VERSION', 'FULL', '192.168.1.44:5000']));
    expect(t).not.toContain('SEARCHING FOR GAMES...');
    expect(t.filter((x) => x == 'MacBook-Pro').length).toBe(2); // five lines of six games: two of the first one
    const labels = all(state.layerMenu, Label);
    const dim = labels.find((l) => l.text == 'DIFFERENT VERSION') as Label;
    const ok = labels.find((l) => l.text == 'WAITING') as Label;
    expect(dim.color).not.toBe(ok.color);

    clickButton(state, 'BtnCancel_mc'); // Back
    waitScreen(OnlineScreen);
    expect(sent).toEqual([{ k: 'scanOpen' }, { k: 'scanClose' }]);
  });

  it('a click on a game connects to it; a game of another version or a full one cannot be clicked', () => {
    const state = newGame();
    const sent = openJoin(state);
    OnlineBridge.receive({ k: 'games', games: GAMES });
    ticks(2);
    const rowY = (i: number): number => 338 + i * 19 + 8;
    click(400, rowY(1)); // different version
    click(400, rowY(2)); // full
    expect(sent).toEqual([{ k: 'scanOpen' }]);
    click(400, rowY(0));
    expect(sent).toEqual([{ k: 'scanOpen' }, { k: 'joinRequest', host: '192.168.1.20', port: 47020 }]);
    expect(texts(state)).toContain('CONNECTING...');
    click(400, rowY(0)); // (not twice)
    expect(sent.length).toBe(2);
  });

  it('types an address with the keys and connects with Enter; Backspace, the numpad and the colon work', () => {
    const state = newGame();
    const sent = openJoin(state);
    OnlineBridge.receive({ k: 'info', port: 47020, lastJoinAddress: '' });
    // 1 9 2 . 1 6 8 . 0 . 5 : 5 0 0 0 (the point is the key GREATER_THAN, the colon is COLON)
    for (const code of [49, 57, 50, 190, 49, 54, 56, 190, 96, 110, 101, 186, 53, 48, 48, 48]) press(code);
    ticks(2);
    const input = all(state.layerMenu, TextInputView)[0] as TextInputView;
    expect(input.text).toBe('192.168.0.5:5000');
    press(8); // Backspace
    expect(input.text).toBe('192.168.0.5:500');
    press(65); // a letter is not typed
    press(32 + 100); // (a key that is not registered at all)
    expect(input.text).toBe('192.168.0.5:500');
    press(13); // Enter: the selected button (Connect)
    expect(sent).toEqual([{ k: 'scanOpen' }, { k: 'joinRequest', host: '192.168.0.5', port: 500 }]);
  });

  it('a held Backspace repeats, Delete clears the field', () => {
    const state = newGame();
    openJoin(state);
    const input = all(state.layerMenu, TextInputView)[0] as TextInputView;
    input.text = '12345678901';
    tick({ keysDown: [8] });
    expect(input.text).toBe('1234567890');
    ticks(5, { keysDown: [8] }); // 0.14 s: the delay of the repeat (0.4 s) has not passed
    expect(input.text).toBe('1234567890');
    ticks(30, { keysDown: [8] });
    expect(input.text.length).toBeLessThan(8);
    press(46); // Delete
    expect(input.text).toBe('');
  });

  it('an address that is not an address is not sent', () => {
    const state = newGame();
    const sent = openJoin(state);
    const input = all(state.layerMenu, TextInputView)[0] as TextInputView;
    input.text = '300.1.1.1';
    clickButton(state, 'BtnApply_mc');
    expect(texts(state)).toContain('INVALID ADDRESS');
    expect(sent).toEqual([{ k: 'scanOpen' }]);
    input.text = '10.0.0.9:6000';
    expect(texts(state)).not.toContain('INVALID ADDRESS'); // (typing takes the message away)
    clickButton(state, 'BtnApply_mc');
    expect(sent[1]).toEqual({ k: 'joinRequest', host: '10.0.0.9', port: 6000 });
  });

  it('the last address is in the field; the arrow keys pick a game and put its address there', () => {
    OnlineBridge.receive({ k: 'info', port: 47020, lastJoinAddress: '172.16.0.3:6001' });
    const state = newGame();
    OnlineBridge.receive({ k: 'info', port: 47020, lastJoinAddress: '172.16.0.3:6001' });
    openJoin(state);
    OnlineBridge.receive({ k: 'info', port: 47020, lastJoinAddress: '172.16.0.3:6001' });
    const input = all(state.layerMenu, TextInputView)[0] as TextInputView;
    expect(input.text).toBe('172.16.0.3:6001');
    OnlineBridge.receive({ k: 'games', games: GAMES });
    ticks(2);
    press(40); // Down
    expect(input.text).toBe('192.168.1.20');
    press(40);
    expect(input.text).toBe('192.168.1.31');
    press(38); // Up
    expect(input.text).toBe('192.168.1.20');
    expect(texts(state)).toContain('> MacBook-Pro');
  });

  it('a failure that brought the player back is shown once', () => {
    const state = newGame();
    ticks(150);
    OnlineBridge.receive({ k: 'openJoin', reason: 'version' });
    menu().makeScreenNow(MenuSystem.JOIN_SCREEN); // (what GameLoop.online does)
    ticks(60);
    expect(menu().currentScreen).toBeInstanceOf(JoinScreen);
    expect(texts(state)).toContain('DIFFERENT GAME VERSION');
    expect(OnlineBridge.joinFailure).toBeNull();
    menu().makeScreenNow(MenuSystem.JOIN_SCREEN);
    ticks(60);
    expect(texts(state)).not.toContain('DIFFERENT GAME VERSION');
  });

  it('a connection that nobody answers is given up after 20 s', () => {
    const state = newGame();
    openJoin(state);
    const input = all(state.layerMenu, TextInputView)[0] as TextInputView;
    input.text = '10.0.0.9';
    clickButton(state, 'BtnApply_mc');
    expect(texts(state)).toContain('CONNECTING...');
    ticks(35 * 21);
    expect(texts(state)).toContain('CONNECTION FAILED');
  });
});
