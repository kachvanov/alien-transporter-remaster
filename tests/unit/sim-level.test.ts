// T1.9e: the GameLoop with the real GameState: the initial state, the `startLevel` command (`--start-level=`), the
// level group of the Frame header, the pause flag, the data the loop loads.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AntState } from '../../src/engine/core/AntState';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { FRAME_HAS_DEBUG, FRAME_PAUSED, FRAME_SCENE_RESET, NO_LEVEL_GROUP } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { Config } from '../../src/game/Config';
import { Font } from '../../src/game/fonts/Font';
import { G } from '../../src/game/G';
import { Ground } from '../../src/game/map/Ground';
import { MainMenuScreen } from '../../src/game/screens/MainMenuScreen';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { GameLoop } from '../../src/sim/GameLoop';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import { hasAssets } from './helpers/assets';

const assetsRoot = resolve(process.cwd(), 'assets');

function makeLoop(aLogs: string[], aInitial?: typeof AntState): GameLoop {
  return new GameLoop({
    assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
    save: new MemorySaveStorage(),
    seed: 1234,
    host: { onFrame: () => undefined, openExternal: () => undefined, log: (l, m) => aLogs.push(l + ': ' + m) },
    initialState: aInitial,
    clock: () => 0,
  });
}

describe.skipIf(!hasAssets)('GameLoop with GameState', () => {
  it('init loads the data of the game (levels, models, fonts, ...) and starts the GameState: no level, an empty picture', async () => {
    const logs: string[] = [];
    const loop = makeLoop(logs);
    await loop.init();
    const registry = AssetRegistry.current as AssetRegistry;
    expect(registry.getLevel(20)).toBeDefined();
    expect(registry.getModels()).toBeDefined();
    expect(registry.getFont('font04Pink')).toBeDefined();
    expect(Font.fromCache('font01')).toBeDefined();
    const frame = readFrame(loop.tick(emptyInputSnapshot()));
    expect(frame.levelGroup).toBe(NO_LEVEL_GROUP);
    expect(frame.nodes.length).toBeGreaterThan(0); // T2.6: the main menu (PrepareState -> GameState -> MainMenuScreen)
    expect(G.core.getSystem(MenuSystem)?.currentScreen).toBeInstanceOf(MainMenuScreen);
    expect(logs.filter((l) => l.startsWith('error') || l.startsWith('warn'))).toEqual([]);
  });

  it('startLevel (the --start-level flag): the level, the HUD and the group of the level atlases; a scene reset', async () => {
    const logs: string[] = [];
    const loop = makeLoop(logs);
    await loop.init();
    loop.tick(emptyInputSnapshot());
    loop.command('startLevel', ['Level01']);
    expect(logs).toContain('info: level Level01 started');
    const frame = readFrame(loop.tick(emptyInputSnapshot()));
    expect(frame.levelGroup).toBe(1);
    expect(frame.nodes.length).toBeGreaterThan(30);
    expect(frame.flags & FRAME_SCENE_RESET).not.toBe(0);
    expect(readFrame(loop.tick(emptyInputSnapshot())).flags & FRAME_SCENE_RESET).toBe(0);
    expect(G.gameData.currentLevelName).toBe('Level01');
  });

  it('the level can be given as a number, a level can replace the level that is running, a bad name is only a warning', async () => {
    const logs: string[] = [];
    const loop = makeLoop(logs);
    await loop.init();
    loop.command('startLevel', ['2']);
    expect(readFrame(loop.tick(emptyInputSnapshot())).levelGroup).toBe(2);
    loop.command('startLevel', ['Level03']);
    expect(readFrame(loop.tick(emptyInputSnapshot())).levelGroup).toBe(3);
    expect(G.gameData.currentLevelName).toBe('Level03');
    loop.command('startLevel', ['Level99']);
    expect(logs.some((l) => l.startsWith('warn: startLevel(Level99)'))).toBe(true);
    expect(readFrame(loop.tick(emptyInputSnapshot())).levelGroup).toBe(3);
    expect(logs.filter((l) => l.startsWith('error'))).toEqual([]);
  });

  it('startLevel needs the GameState: another initial state only gets a warning', async () => {
    const logs: string[] = [];
    const loop = makeLoop(logs, AntState);
    await loop.init();
    loop.command('startLevel', ['Level01']);
    expect(logs.some((l) => l.startsWith('warn: startLevel(Level01): the state is not the GameState'))).toBe(true);
  });

  it('the Frame header is paused while G.gamePause is set (the pause is a state of the game)', async () => {
    const loop = makeLoop([]);
    await loop.init();
    loop.command('startLevel', ['Level01']);
    expect(readFrame(loop.tick(emptyInputSnapshot())).flags & FRAME_PAUSED).toBe(0);
    G.gamePause = true;
    expect(readFrame(loop.tick(emptyInputSnapshot())).flags & FRAME_PAUSED).not.toBe(0);
    G.gamePause = false;
  });

  it('Config.debugSettings.allowBox2DDebug puts the Box2D lines of the world into the Frame (dev only)', async () => {
    const loop = makeLoop([]);
    await loop.init();
    loop.command('startLevel', ['Level01']);
    expect(readFrame(loop.tick(emptyInputSnapshot())).flags & FRAME_HAS_DEBUG).toBe(0);
    Config.debugSettings.allowBox2DDebug = true;
    try {
      const frame = readFrame(loop.tick(emptyInputSnapshot()));
      expect(frame.flags & FRAME_HAS_DEBUG).not.toBe(0);
      const ext = frame.nodes[frame.nodes.length - 1]?.ext;
      expect(ext?.kind).toBe(0x02);
      expect(ext?.kind === 0x02 ? ext.lines.length : 0).toBeGreaterThan(40); // 4 numbers per line: the ground, the shuttle
    } finally {
      Config.debugSettings.allowBox2DDebug = false;
    }
  });

  it('a new loop starts without the ground of the previous one (the statics of the level are reset)', async () => {
    const first = makeLoop([]);
    await first.init();
    first.command('startLevel', ['Level01']);
    expect(Ground.body).not.toBeNull();
    const second = makeLoop([]);
    await second.init();
    expect(Ground.body).toBeNull();
  });

  it('the logs of the game (AntG.log) and the physics go to the host', async () => {
    const logs: string[] = [];
    const loop = makeLoop(logs);
    await loop.init();
    loop.command('startLevel', ['Level01']);
    expect(logs.filter((l) => l.startsWith('error') || l.startsWith('warn'))).toEqual([]);
  });
});
