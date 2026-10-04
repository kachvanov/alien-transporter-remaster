// T2.8: the progress survives a restart. A pilot plays Level01 to the end in the real game on a file-backed save
// (electron/save.ts, the same code the Electron main process uses), goes through the Level Complete and the level
// selection to Play (the original saves there: GameData.saveData), then the "application" is started again: a new
// GameLoop over a new JsonDocument of the same directory must show Level02 unlocked and the stars of Level01.

import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { GameData } from '../../src/game/data/GameData';
import { G } from '../../src/game/G';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { runHeadless } from '../../src/sim/headless';
import type { SaveStorage } from '../../src/sim/SaveStorage';
import { JsonDocument } from '../../electron/save';
import { Level01Bot, Level01State } from '../golden/scripts/level01-bot';
import { hasAssets } from './helpers/assets';

const assetsRoot = resolve(process.cwd(), 'assets');
const ready = hasAssets && existsSync(resolve(assetsRoot, 'sounds.json'));

/** What the main process does for the worker: `save:load` / `save:write` over save.json. */
class FileSaveStorage implements SaveStorage {
  constructor(private readonly _doc: JsonDocument) {}

  async load(key: string): Promise<object | null> {
    return (await this._doc.get(key)) as object | null;
  }

  async save(key: string, obj: object | null): Promise<void> {
    await this._doc.set(key, obj);
  }
}

let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'at-restart-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A click of the mouse: the pointer moves onto the button, then the button is down for 6 ticks of every 40. */
function click(aTick: number, aX: number, aY: number): InputSnapshot {
  const phase = aTick % 40;
  return { keysDown: [], mouseX: aX, mouseY: aY, mouseDown: phase >= 12 && phase < 18, wheelDelta: 0 };
}

describe.skipIf(!ready)('progress survives a restart (card T2.8)', () => {
  it('Level01 played to the end, Play on the level selection saves; the next start has Level02 unlocked', async () => {
    const bot = new Level01Bot();
    const screens: string[] = [];
    let selectSince = -1;
    let reachedGame = -1;
    const doc1 = new JsonDocument(join(dir, 'save.json'));
    await runHeadless({
      seed: 12345,
      ticks: 4200,
      initialState: Level01State,
      keepFrames: false,
      save: new FileSaveStorage(doc1),
      input: (t) => {
        const name = G.core.getSystem(MenuSystem)?.currentScreenName ?? null;
        if (name !== null && screens[screens.length - 1] !== name) screens.push(name);
        if (name === MenuSystem.LEVEL_COMPLETE_SCREEN) return click(t, 694, 505); // Apply
        if (name === MenuSystem.SELECT_LEVEL_SCREEN) {
          selectSince = selectSince < 0 ? t : selectSince;
          return t - selectSince > 400 ? click(t, 694, 505) : click(t, 400, 300); // Play, after the buttons have come
        }
        if (name === MenuSystem.GAME_SCREEN && selectSince >= 0 && reachedGame < 0) reachedGame = t;
        return bot.step(t);
      },
    });
    expect(screens).toContain(MenuSystem.LEVEL_COMPLETE_SCREEN);
    expect(screens).toContain(MenuSystem.SELECT_LEVEL_SCREEN);
    expect(reachedGame).toBeGreaterThan(0); // Play was pressed: Level02 starts and GameData.saveData() has run
    expect(G.gameData.getLevelData('Level01')?.stars).toBeGreaterThan(0);
    expect(G.gameData.getLevelData('Level02')?.unlocked).toBe(true);

    // the file on the disk (the ticks run without a pause, the writes of the storage go on after them; written
    // atomically: no temporary file is left)
    await new Promise((r) => setImmediate(r));
    await doc1.flush();
    expect(await readdir(dir)).toEqual(['save.json']);
    const onDisk = JSON.parse(readFileSync(join(dir, 'save.json'), 'utf8')) as Record<string, { levels: { unlocked: boolean; stars: number }[] }>;
    const data = onDisk[GameData.SAVE_KEY];
    expect(data?.levels[1]?.unlocked).toBe(true);
    expect(data?.levels[0]?.stars).toBeGreaterThan(0);

    // "restart": a new process (new statics of the loop), a new document over the same file; the main menu loads the save
    let level2 = false;
    let stars = -1;
    let hadSave = false;
    await runHeadless({
      seed: 777,
      ticks: 200,
      keepFrames: false,
      save: new FileSaveStorage(new JsonDocument(join(dir, 'save.json'))),
      input: () => {
        const name = G.core?.getSystem(MenuSystem)?.currentScreenName ?? null;
        if (name === 'MainScreen') {
          level2 = G.gameData.getLevelDataAt(1)?.unlocked ?? false;
          stars = G.gameData.getLevelDataAt(0)?.stars ?? -1;
          hadSave = G.gameData.hasSaveData;
        }
        return { keysDown: [], mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
      },
    });
    expect(hadSave).toBe(true);
    expect(level2).toBe(true);
    expect(stars).toBeGreaterThan(0);
  }, 180_000);
});
