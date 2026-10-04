import { describe, expect, it } from 'vitest';
import { decodeFlagsArg, encodeFlagsArg, parseDevFlags } from '../../electron/flags';
import {
  ClientInputMapper,
  PAUSE_HOLD_MS,
  defaultKeyNames,
  keyCodeOfName,
  keyNamesFromSave,
  shipFromSave,
} from '../../src/net/clientInput';
import { INPUT_GAS, INPUT_LEFT, INPUT_PAUSE_REQ, INPUT_RIGHT } from '../../src/net/protocol';
import { ClientOverlayModel } from '../../src/render/ClientOverlayModel';
import { splitDevArgs } from '../../tools/dev/devArgs';

const UP = 38;
const LEFT = 37;
const RIGHT = 39;
const W = 87;
const A = 65;
const D = 68;
const P = 80;

describe('keyCodeOfName', () => {
  it('translates the names of the original key table', () => {
    expect(keyCodeOfName('UP')).toBe(UP);
    expect(keyCodeOfName('W')).toBe(W);
    expect(keyCodeOfName('SPACEBAR')).toBe(32);
    expect(keyCodeOfName('ESC')).toBe(27);
  });

  it('an unknown name is undefined; " " (the key the game assigns on a conflict) is Space, as in AntKeyboard', () => {
    expect(keyCodeOfName(' ')).toBe(32);
    expect(keyCodeOfName('constructor')).toBeUndefined();
    expect(keyCodeOfName('NOPE')).toBeUndefined();
  });
});

describe('ClientInputMapper', () => {
  it('P1 and P2 layouts both mean gas / left / right', () => {
    const m = new ClientInputMapper();
    m.setKeysDown([UP], 0);
    expect(m.bits(0)).toBe(INPUT_GAS);
    m.setKeysDown([W], 0);
    expect(m.bits(0)).toBe(INPUT_GAS);
    m.setKeysDown([LEFT, D], 0);
    expect(m.bits(0)).toBe(INPUT_LEFT | INPUT_RIGHT);
    m.setKeysDown([RIGHT, A, UP], 0);
    expect(m.bits(0)).toBe(INPUT_GAS | INPUT_LEFT | INPUT_RIGHT);
    m.setKeysDown([], 0);
    expect(m.bits(0)).toBe(0);
  });

  it('other keys are not sent (Esc stays local, Space is not an action)', () => {
    const m = new ClientInputMapper();
    m.setKeysDown([27, 32, 13, 71], 0);
    expect(m.bits(0)).toBe(0);
  });

  it('pauseReq is the rising edge of P: held for a few heartbeats, a held key does not repeat it', () => {
    const m = new ClientInputMapper();
    m.setKeysDown([P], 1000);
    expect(m.bits(1000) & INPUT_PAUSE_REQ).toBe(INPUT_PAUSE_REQ);
    expect(m.bits(1000 + PAUSE_HOLD_MS - 1) & INPUT_PAUSE_REQ).toBe(INPUT_PAUSE_REQ);
    expect(m.bits(1000 + PAUSE_HOLD_MS) & INPUT_PAUSE_REQ).toBe(0);
    m.setKeysDown([P, UP], 1500); // P is still held: no new edge
    expect(m.bits(1500)).toBe(INPUT_GAS);
    m.setKeysDown([], 1600);
    m.setKeysDown([P], 1700); // pressed again: a new request
    expect(m.bits(1700) & INPUT_PAUSE_REQ).toBe(INPUT_PAUSE_REQ);
  });

  it('follows the keys of the save, a missing key is the default', () => {
    const names = keyNamesFromSave({ keyP1Gas: 'SPACEBAR', keyP2Left: 'Q', keyP1Right: 5 });
    expect(names.p1Gas).toBe('SPACEBAR');
    expect(names.p2Left).toBe('Q');
    expect(names.p1Right).toBe(defaultKeyNames().p1Right);
    expect(keyNamesFromSave(null)).toEqual(defaultKeyNames());
    const m = new ClientInputMapper(names);
    m.setKeysDown([32], 0);
    expect(m.bits(0)).toBe(INPUT_GAS);
    m.setKeysDown([UP], 0); // the P1 gas key was rebound: UP is nothing now
    expect(m.bits(0)).toBe(0);
    m.setKeysDown([81], 0); // Q
    expect(m.bits(0)).toBe(INPUT_LEFT);
  });

  it('releaseAll clears the held keys', () => {
    const m = new ClientInputMapper();
    m.setKeysDown([UP, LEFT], 0);
    m.releaseAll();
    expect(m.bits(0)).toBe(0);
  });
});

describe('shipFromSave', () => {
  it('takes the Player2 entry of the save, defaults otherwise', () => {
    expect(shipFromSave(null)).toEqual({ shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 });
    const save = {
      players: [
        { name: 'Player1', shuttleKind: 0, shuttleColor: 0, engineKind: 0, engineColor: 0 },
        { name: 'Player2', shuttleKind: 2, shuttleColor: 3, engineKind: 1, engineColor: -4 },
      ],
    };
    expect(shipFromSave(save)).toEqual({ shuttleKind: 2, shuttleColor: 3, engineKind: 1, engineColor: 1 });
  });
});

describe('ClientOverlayModel', () => {
  it('is hidden at first and takes no keys', () => {
    const m = new ClientOverlayModel();
    expect(m.isOpen).toBe(false);
    expect(m.handleKey('Enter')).toBe('none');
    expect(m.choose(0)).toBe('none');
  });

  it('Disconnect?: No is preselected, Esc and N say no, Y says yes', () => {
    const m = new ClientOverlayModel();
    m.showConfirm();
    expect(m.mode).toBe('confirm');
    expect(m.text).toBe('Disconnect?');
    expect(m.selected).toBe(1);
    expect(m.handleKey('Enter')).toBe('no');
    expect(m.handleKey('Escape')).toBe('no');
    expect(m.handleKey('KeyY')).toBe('yes');
    expect(m.handleKey('KeyN')).toBe('no');
    expect(m.handleKey('KeyQ')).toBe('none');
  });

  it('arrows and Tab move the selection, Enter confirms it', () => {
    const m = new ClientOverlayModel();
    m.showConfirm();
    const v = m.version;
    expect(m.handleKey('ArrowLeft')).toBe('none');
    expect(m.selected).toBe(0);
    expect(m.version).toBeGreaterThan(v);
    expect(m.handleKey('Enter')).toBe('yes');
    m.handleKey('ArrowRight');
    expect(m.selected).toBe(1);
    m.handleKey('Tab');
    expect(m.selected).toBe(0);
  });

  it('clicks: the left button is Yes, the right one No', () => {
    const m = new ClientOverlayModel();
    m.showConfirm();
    expect(m.choose(0)).toBe('yes');
    expect(m.choose(1)).toBe('no');
  });

  it('a message has one OK; it replaces the confirmation and Esc does not bring it back', () => {
    const m = new ClientOverlayModel();
    m.showConfirm();
    m.showMessage('Connection lost');
    expect(m.mode).toBe('message');
    expect(m.text).toBe('Connection lost');
    m.showConfirm(); // Esc after the end of the session: the message stays
    expect(m.mode).toBe('message');
    expect(m.choose(1)).toBe('ok');
    expect(m.handleKey('Enter')).toBe('ok');
    expect(m.handleKey('Escape')).toBe('ok');
    expect(m.handleKey('KeyA')).toBe('none');
    m.hide();
    expect(m.isOpen).toBe(false);
  });
});

describe('--join flag', () => {
  it('is parsed, survives the main -> preload encoding and is absent by default', () => {
    expect(parseDevFlags(['--join=192.168.0.5:47020']).join).toBe('192.168.0.5:47020');
    expect('join' in parseDevFlags([])).toBe(false);
    expect('join' in parseDevFlags(['--join='])).toBe(false);
    const flags = parseDevFlags(['--join=10.0.0.2', '--classic']);
    expect(decodeFlagsArg(['electron', encodeFlagsArg(flags)])).toEqual(flags);
  });

  it('npm run dev passes it through (both forms)', () => {
    expect(splitDevArgs(['--profile=2', '--join=127.0.0.1']).appArgs).toEqual(['--profile=2', '--join=127.0.0.1']);
    expect(splitDevArgs(['--join', '127.0.0.1:47020']).appArgs).toEqual(['--join=127.0.0.1:47020']);
  });
});
