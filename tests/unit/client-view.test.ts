// T5.1: the "view only" look of the network client (DEVIATION: online): the model of the mode, the muted button faces and the
// real frames of a host (the levelGroup of the header tells a menu from a level).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../src/engine/assets/schemas';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { FRAME_PAUSED, NO_LEVEL_GROUP } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import {
  buildButtonFaces,
  buildGameOverMarks,
  ClientViewModel,
  DIM_ALPHA,
  dimTint,
  frameHasGameOverPopup,
  VIEW_ONLY_AFTER_FRAMES,
  VIEW_ONLY_HINT,
} from '../../src/render/ClientViewModel';
import { runHeadless } from '../../src/sim/headless';
import { hasAssets } from './helpers/assets';

describe('ClientViewModel', () => {
  it('starts as a normal view; a menu (no level) turns it on only after a few frames in a row', () => {
    const m = new ClientViewModel(3);
    expect(m.viewOnly).toBe(false);
    m.push(NO_LEVEL_GROUP);
    m.push(NO_LEVEL_GROUP);
    expect(m.viewOnly).toBe(false);
    m.push(NO_LEVEL_GROUP);
    expect(m.viewOnly).toBe(true);
    m.push(NO_LEVEL_GROUP);
    expect(m.viewOnly).toBe(true);
  });

  it('a level turns it off at once; a short gap (the restart of a level) does not turn it on', () => {
    const m = new ClientViewModel(3);
    for (let i = 0; i < 5; i++) m.push(NO_LEVEL_GROUP);
    expect(m.viewOnly).toBe(true);
    m.push(7);
    expect(m.viewOnly).toBe(false);
    m.push(NO_LEVEL_GROUP);
    m.push(NO_LEVEL_GROUP);
    m.push(7); // the level is loaded again after two frames: the counter starts anew
    m.push(NO_LEVEL_GROUP);
    m.push(NO_LEVEL_GROUP);
    expect(m.viewOnly).toBe(false);
  });

  it('reset() gives the normal view; the default delay and the hint text', () => {
    const m = new ClientViewModel();
    for (let i = 0; i < VIEW_ONLY_AFTER_FRAMES; i++) m.push(NO_LEVEL_GROUP);
    expect(m.viewOnly).toBe(true);
    m.reset();
    expect(m.viewOnly).toBe(false);
    expect(VIEW_ONLY_HINT).toBe('WAITING FOR THE HOST');
  });
});

// FIX-7: the host's pause popup (the `paused` flag of the frame header) is the second "the client cannot press it" state.
describe('ClientViewModel: the pause popup of the host', () => {
  it('the paused flag turns the dim look on and off at once, with no delay and with a level present', () => {
    const m = new ClientViewModel(3);
    m.push(7, 0);
    expect(m.hostPaused).toBe(false);
    expect(m.dim).toBe(false);
    m.push(7, FRAME_PAUSED);
    expect(m.hostPaused).toBe(true);
    expect(m.dim).toBe(true);
    expect(m.viewOnly).toBe(false); // (it is not the menu mode)
    m.push(7, FRAME_PAUSED | 2); // (other header bits do not matter)
    expect(m.dim).toBe(true);
    m.push(7, 0); // the host resumed: the normal look returns with the very next frame
    expect(m.hostPaused).toBe(false);
    expect(m.dim).toBe(false);
  });

  it('a menu still dims after its delay; the flag argument is optional; reset() clears both', () => {
    const m = new ClientViewModel(2);
    m.push(NO_LEVEL_GROUP);
    expect(m.dim).toBe(false);
    m.push(NO_LEVEL_GROUP);
    expect(m.dim).toBe(true);
    expect(m.hostPaused).toBe(false);
    m.push(NO_LEVEL_GROUP, FRAME_PAUSED);
    expect(m.hostPaused).toBe(true);
    m.reset();
    expect(m.dim).toBe(false);
    expect(m.hostPaused).toBe(false);
  });
});

// FIX-9: the game over popup of the host (no header flag: G.gamePause is not raised for it; read from the title node).
describe('ClientViewModel: the game over popup of the host', () => {
  it('the popup turns the dim look on and off at once, with a level present and the pause flag clear', () => {
    const m = new ClientViewModel(3);
    m.push(7, 0, false);
    expect(m.hostGameOver).toBe(false);
    expect(m.dim).toBe(false);
    m.push(7, 0, true);
    expect(m.hostGameOver).toBe(true);
    expect(m.dim).toBe(true);
    expect(m.hostPaused).toBe(false);
    expect(m.viewOnly).toBe(false);
    m.push(7, 0, true);
    expect(m.dim).toBe(true);
    m.push(7, 0, false); // the host restarted (the popup is gone): the normal look returns with the very next frame
    expect(m.hostGameOver).toBe(false);
    expect(m.dim).toBe(false);
  });

  it('is independent of the pause popup and of the menu mode; the argument is optional; reset() clears it', () => {
    const m = new ClientViewModel(2);
    m.push(7, FRAME_PAUSED, true);
    expect(m.dim).toBe(true);
    m.push(7, 0, true); // (the pause popup closed, the game over popup stays)
    expect(m.hostPaused).toBe(false);
    expect(m.dim).toBe(true);
    m.push(7); // (a frame without the popup)
    expect(m.dim).toBe(false);
    m.push(7, 0, true);
    m.reset();
    expect(m.hostGameOver).toBe(false);
    expect(m.dim).toBe(false);
    m.push(NO_LEVEL_GROUP, 0, true);
    m.push(NO_LEVEL_GROUP, 0, false); // (the host left to a menu: the menu mode takes over after its delay)
    expect(m.dim).toBe(true);
    expect(m.hostGameOver).toBe(false);
  });
});

describe('game over popup marks', () => {
  const keys = [
    'GameOverPopupBG_mc#0', // 0 (shared with the confirm popup of the level select: not a mark)
    'GameOverTextEN_mc#0', // 1
    'ConfirmTextEN_mc#0', // 2
    'Player1GameOver_mc#0', // 3 (the blinker of a player, not the popup)
    'GameOverTextRU_mc#0', // 4 (another language of the texts)
    'BtnRestart_mc#0', // 5
  ];
  const marks = buildGameOverMarks(keys);

  it('marks only the title clip of the popup', () => {
    expect([...marks]).toEqual([0, 1, 0, 0, 1, 0]);
  });

  it('frameHasGameOverPopup finds the title among the nodes', () => {
    expect(frameHasGameOverPopup([], marks)).toBe(false);
    expect(frameHasGameOverPopup([{ texId: 0 }, { texId: 2 }, { texId: 3 }, { texId: 5 }], marks)).toBe(false);
    expect(frameHasGameOverPopup([{ texId: 0 }, { texId: 1 }, { texId: 5 }], marks)).toBe(true);
    expect(frameHasGameOverPopup([{ texId: 0xffff }], marks)).toBe(false); // (a node without a texture)
  });
});

describe('buildButtonFaces', () => {
  const keys = [
    'Sprite#0', // 0
    'BtnPlay_mc#0', // 1
    'BtnPlay_mc#1', // 2
    'BtnPlay_mc#2', // 3
    'BtnShadowBig_mc#0', // 4
    'BtnStar_mc#0', // 5
    'BtnShip_mc#0', // 6
    'BtnShip_mc#1', // 7
    'BtnShip_mc#2', // 8
    'BtnShip_mc#3', // 9
    'BtnOdd_mc#x', // 10
  ];
  const faces = buildButtonFaces(keys);

  it('mutes the faces of the buttons (symbols Btn* with several frames), nothing else', () => {
    expect([...faces.dim]).toEqual([0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0]);
  });

  it('the over and down faces of a 3-frame button are shown as the up face; other symbols keep their frames', () => {
    expect([...faces.up]).toEqual([0, 1, 1, 1, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('dimTint', () => {
  it('multiplies the tint by the grey of the muted look', () => {
    expect(dimTint(0xffffff)).toBe(0x9a9a9a);
    expect(dimTint(0x000000)).toBe(0x000000);
    expect(dimTint(0xff0000)).toBe(0x9a0000);
    expect(DIM_ALPHA).toBeGreaterThan(0);
    expect(DIM_ALPHA).toBeLessThan(1);
  });
});

// The frames of the real game of the host: the main menu has no level, a level has its number.
describe.skipIf(!hasAssets)('levelGroup of the frames of a host', () => {
  it('the main menu is NO_LEVEL_GROUP and has button faces, a started level is its number', async () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as Manifest;
    const keys = (manifest.frames as unknown as readonly { key: string }[]).map((f) => f.key);
    const faces = buildButtonFaces(keys);

    const run = await runHeadless({ seed: 1, ticks: 150 });
    const menuFrame = readFrame(run.frames[run.frames.length - 1] as ArrayBuffer);
    expect(menuFrame.levelGroup).toBe(NO_LEVEL_GROUP);
    expect(menuFrame.nodes.filter((n) => faces.dim[n.texId] === 1).length).toBeGreaterThanOrEqual(3); // Credits, Play, Online

    run.loop.command('startLevel', ['1']);
    let last: ArrayBuffer | null = null;
    for (let i = 0; i < 60; i++) last = run.loop.tick(emptyInputSnapshot());
    expect(readFrame(last as ArrayBuffer).levelGroup).toBe(1);
  }, 60_000);

  it('pausing the host inside a level sets the paused flag; the popup brings muted button faces; resuming clears it', async () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as Manifest;
    const faces = buildButtonFaces((manifest.frames as unknown as readonly { key: string }[]).map((f) => f.key));
    const view = new ClientViewModel();
    const run = await runHeadless({ seed: 1, ticks: 150 });
    run.loop.command('startLevel', ['1']);
    const tickFrame = (keys: number[]): ReturnType<typeof readFrame> => {
      const snap = emptyInputSnapshot();
      snap.keysDown = keys;
      const f = readFrame(run.loop.tick(snap) as ArrayBuffer);
      view.push(f.levelGroup, f.flags);
      return f;
    };
    const dimNodes = (f: ReturnType<typeof readFrame>): number => f.nodes.filter((n) => faces.dim[n.texId] === 1).length;
    let f = tickFrame([]);
    for (let i = 0; i < 60; i++) f = tickFrame([]);
    expect(f.levelGroup).toBe(1);
    expect((f.flags & FRAME_PAUSED) !== 0).toBe(false);
    expect(view.dim).toBe(false);
    const hudButtons = dimNodes(f);

    for (let i = 0; i < 3; i++) f = tickFrame([80]); // P (Flash keyCode 80): the pause popup
    for (let i = 0; i < 20; i++) f = tickFrame([]);
    expect((f.flags & FRAME_PAUSED) !== 0).toBe(true);
    expect(view.hostPaused).toBe(true);
    expect(view.dim).toBe(true);
    expect(dimNodes(f)).toBeGreaterThan(hudButtons); // Resume, Restart, Main menu, the switches

    for (let i = 0; i < 3; i++) tickFrame([80]); // P again: resume
    f = tickFrame([]);
    expect((f.flags & FRAME_PAUSED) !== 0).toBe(false);
    expect(view.dim).toBe(false);
    expect(f.levelGroup).toBe(1);
  }, 60_000);

  // FIX-9: the real game over of the host: the last life is lost (the dev command crashShuttle), the popup appears in the frames
  // with no header flag; its buttons are muted faces; restarting from the popup (Restart) brings the normal look back.
  it('game over: the title of the popup is in the frames (paused flag clear), the buttons are muted; the host leaves it -> normal', async () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as Manifest;
    const keys = (manifest.frames as unknown as readonly { key: string }[]).map((f) => f.key);
    const faces = buildButtonFaces(keys);
    const marks = buildGameOverMarks(keys);
    const view = new ClientViewModel();
    const run = await runHeadless({ seed: 1, ticks: 150 });
    run.loop.command('startLevel', ['1']);
    const tickFrame = (aKeys: number[]): ReturnType<typeof readFrame> => {
      const snap = emptyInputSnapshot();
      snap.keysDown = aKeys;
      const f = readFrame(run.loop.tick(snap) as ArrayBuffer);
      view.push(f.levelGroup, f.flags, frameHasGameOverPopup(f.nodes, marks));
      return f;
    };
    const dimNodes = (f: ReturnType<typeof readFrame>): number => f.nodes.filter((n) => faces.dim[n.texId] === 1).length;
    let f = tickFrame([]);
    for (let i = 0; i < 90; i++) f = tickFrame([]);
    expect(f.levelGroup).toBe(1);
    expect(view.dim).toBe(false);
    const hud = dimNodes(f);

    run.loop.command('crashShuttle');
    let seen = -1;
    for (let i = 0; i < 200 && seen < 0; i++) {
      f = tickFrame([]);
      if (view.hostGameOver) seen = i;
    }
    expect(seen).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 60; i++) f = tickFrame([]); // (the popup has slid in)
    expect(f.levelGroup).toBe(1); // (the level stays loaded)
    expect((f.flags & FRAME_PAUSED) !== 0).toBe(false); // (G.gamePause is not raised for the popup: why FIX-7 does not cover it)
    expect(view.hostGameOver).toBe(true);
    expect(view.hostPaused).toBe(false);
    expect(view.dim).toBe(true);
    expect(dimNodes(f)).toBeGreaterThanOrEqual(hud + 2); // Main menu, Restart

    // The host presses Restart (Enter / the selected button): the popup goes, the level is loaded again, the look is normal.
    for (let i = 0; i < 3; i++) tickFrame([13]);
    let normal = false;
    for (let i = 0; i < 400 && !normal; i++) {
      f = tickFrame([]);
      normal = !view.dim && f.levelGroup === 1;
    }
    expect(normal).toBe(true);
    expect(view.hostGameOver).toBe(false);
  }, 90_000);
});
