// T2.7: missions, unlockable content, music, the Quality switch of the pause.

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
import { MUTE_MUSIC } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { G } from '../../src/game/G';
import { Ground } from '../../src/game/map/Ground';
import { ContentManager } from '../../src/game/missions/ContentManager';
import { MissionData } from '../../src/game/missions/MissionData';
import { MissionManager } from '../../src/game/missions/MissionManager';
import { MusicManager } from '../../src/game/MusicManager';
import { Button } from '../../src/game/screens/Button';
import { GameState } from '../../src/game/states/GameState';
import { PrepareState } from '../../src/game/states/PrepareState';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { GameLoop } from '../../src/sim/GameLoop';
import type { HostApi } from '../../src/sim/GameLoop';
import { runHeadless } from '../../src/sim/headless';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { readFile } from 'node:fs/promises';
import { initLevel01, ScriptedPilot, tick as levelTick } from '../golden/scripts/level01-deliver';
import { SimClient } from '../../src/app/SimClient';
import type { WorkerLike } from '../../src/app/SimClient';
import { AtlasLoader } from '../../src/render/AtlasLoader';
import type { Manifest } from '../../src/engine/assets/schemas';
import type { SimOut } from '../../src/sim/protocol';
import { assetsRoot, hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';

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

function newMenuGame(): GameState {
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

function ticks(aN: number): void {
  for (let i = 0; i < aN; i++) {
    tick();
  }
}

function all<T extends AntEntity>(aParent: AntEntity, aClass: Ctor<T>): T[] {
  return (aParent.children ?? []).filter((c): c is T => c instanceof aClass && c.exists);
}

function buttonAnim(aState: GameState, aAnim: string): AntButton | undefined {
  return all(aState.layerMenu, Button)
    .map((b) => all(b, AntButton)[0] as AntButton)
    .find((b) => b.currentAnimation == aAnim);
}

/** Every animation name of the menu layers (the mission bars are in the layer of the interface). */
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

/** The missions of the manager (private list). */
function missionsOf(aManager: MissionManager): MissionData[] {
  return (aManager as unknown as { _missions: MissionData[] })._missions;
}

//---------------------------------------
// ContentManager
//---------------------------------------

describe('ContentManager', () => {
  it('starts with the items of initData unlocked, the rest locked', () => {
    const c = new ContentManager();
    for (const name of ['shuttleOrange', 'shuttleRed', 'shuttle01', 'passengerGreen', 'passengerBasic']) {
      expect(c.isUnlocked(name), name).toBe(true);
    }

    for (const name of ['shuttlePink', 'shuttle02', 'passengerOrange', 'bonusFuel', 'featureRandomShip', 'featureMagnet']) {
      expect(c.isUnlocked(name), name).toBe(false);
    }

    expect(c.isUnlocked('nothing')).toBe(false);
    expect(c.hasNewContent).toBe(false);
  });

  it('unlock opens an item; only the items with `notify` raise hasNewContent until resetNotify', () => {
    const c = new ContentManager();
    c.unlock('featureMagnet'); // notify = false
    expect(c.isUnlocked('featureMagnet')).toBe(true);
    expect(c.hasNewContent).toBe(false);
    c.unlock('shuttlePink'); // notify = true
    expect(c.isUnlocked('shuttlePink')).toBe(true);
    expect(c.hasNewContent).toBe(true);
    c.resetNotify();
    expect(c.hasNewContent).toBe(false);
    c.unlock('nothing');
    expect(c.hasNewContent).toBe(false);
  });

  it('toObject / fromObject keep the unlocked items; clearData and reset lock them again', () => {
    const a = new ContentManager();
    a.unlock('passengerOrange');
    a.unlock('shuttle02');
    const saved = JSON.parse(JSON.stringify(a.toObject())) as Record<string, unknown>;
    expect((saved['contentList'] as unknown[]).length).toBe(24);
    const b = new ContentManager();
    b.fromObject(saved);
    expect(b.isUnlocked('passengerOrange')).toBe(true);
    expect(b.isUnlocked('shuttle02')).toBe(true);
    expect(b.isUnlocked('passengerBlue')).toBe(false);
    b.clearData();
    expect(b.isUnlocked('passengerOrange')).toBe(false);
    expect(b.isUnlocked('shuttleOrange')).toBe(true);
    a.reset();
    expect(a.isUnlocked('shuttleOrange')).toBe(false); // reset() locks everything, even the starting items
    a.fromObject(null); // a save without content is ignored
    a.fromObject({});
  });
});

//---------------------------------------
// MissionManager
//---------------------------------------

describe.skipIf(!hasAssets)('MissionManager', () => {
  function make(aSeed = 7): MissionManager {
    AntMath.seed(aSeed);
    return new MissionManager();
  }

  it('reads the 19 missions of missions.json with the types of the fields', () => {
    const list = missionsOf(make());
    expect(list).toHaveLength(19);
    expect(list.map((m) => m.id)).toEqual(Array.from({ length: 19 }, (_, i) => i));
    const first = list[0] as MissionData;
    expect([first.iconBig, first.iconSmall, first.missionText, first.unlockedText]).toEqual([
      'IconPassengerOrange_mc',
      'IconPassengerOrangeSmall_mc',
      'MissionDeliverDesc_txt',
      'UnlockedPassenger_txt',
    ]);
    expect([first.hintText, first.awardId, first.statName]).toEqual(['UnlockedPassengerDesc_txt', 'passengerOrange', 'numPassengers']);
    expect(first.goalValue).toBe(5);
    expect(first.difficult).toBe(1);
    expect([first.value, first.lastValue, first.isActive, first.isCompleted]).toEqual([0, 0, false, false]);
    expect(list.every((m) => typeof m.goalValue == 'number' && m.goalValue > 0)).toBe(true);
    expect(new Set(list.map((m) => m.difficult)).size).toBeGreaterThan(1);
  });

  it('a new manager restarts the ids of the missions (they are the keys of the save)', () => {
    make();
    expect(missionsOf(make()).map((m) => m.id)[0]).toBe(0);
  });

  it('getNewMission takes a random mission of the current difficulty, activates it and never gives it twice', () => {
    const m = make(11);
    const given: MissionData[] = [];
    for (let i = 0; i < 19; i++) {
      const next = m.getNewMission();
      expect(next).not.toBeNull();
      expect((next as MissionData).isActive).toBe(true);
      expect(given).not.toContain(next);
      given.push(next as MissionData);
    }

    expect(given).toHaveLength(19);
    expect(m.getNewMission()).toBeNull(); // every mission is active: the end of the list
    // the difficulty goes up as the missions of the lower one run out: 1, 1, ..., 2, ... (never down)
    const difficult = given.map((g) => g.difficult);
    expect(difficult[0]).toBe(1);
    expect(difficult).toEqual([...difficult].sort((a, b) => a - b));
  });

  it('getNewMission is deterministic for a seed', () => {
    const pick = (aSeed: number): number[] => {
      const m = make(aSeed);
      return [0, 1, 2, 3].map(() => (m.getNewMission() as MissionData).id);
    };
    expect(pick(5)).toEqual(pick(5));
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => pick(Math.imul(n, 2654435761) >>> 0));
    expect(new Set(seeds.map((s) => s.join())).size).toBeGreaterThan(1);
  });

  it('track adds to the active missions of the statName only and stops at the goal', () => {
    const m = make();
    const list = missionsOf(m);
    const deliver = list.find((x) => x.statName == 'numPassengers') as MissionData;
    const coins = list.find((x) => x.statName == 'numEarnedCoins') as MissionData;
    m.track('numPassengers'); // not active yet
    expect(deliver.value).toBe(0);
    deliver.isActive = true;
    m.track('numPassengers');
    m.track('numPassengers', 2);
    expect(deliver.value).toBe(3);
    expect(coins.value).toBe(0);
    m.track('numPassengers', 100);
    expect(deliver.value).toBe(deliver.goalValue);
  });

  it('getActiveMissions lists the active ones that are not completed; clearData starts everything over', () => {
    const m = make();
    const a = m.getNewMission() as MissionData;
    const b = m.getNewMission() as MissionData;
    expect(m.getActiveMissions([])).toEqual([a, b]);
    a.isCompleted = true;
    expect(m.getActiveMissions(null)).toEqual([b]);
    b.value = 3;
    m.clearData();
    expect(m.getActiveMissions([])).toEqual([]);
    expect([a.isActive, a.isCompleted, b.value]).toEqual([false, false, 0]);
    expect(m.toObject()['difficultLevel']).toBe(1);
  });

  it('toObject / fromObject round-trip through JSON; a save without missions is ignored', () => {
    const a = make(3);
    const x = a.getNewMission() as MissionData;
    x.value = 2;
    x.isCompleted = true;
    const y = a.getNewMission() as MissionData;
    const saved = JSON.parse(JSON.stringify(a.toObject())) as Record<string, unknown>;
    expect((saved['missionList'] as unknown[]).length).toBe(19);
    const b = make(3);
    b.fromObject(saved);
    const bx = missionsOf(b)[x.id] as MissionData;
    expect([bx.isActive, bx.isCompleted, bx.value]).toEqual([true, true, 2]);
    expect((missionsOf(b)[y.id] as MissionData).isActive).toBe(true);
    expect(b.toObject()).toEqual(a.toObject());
    b.fromObject({});
    b.fromObject(null);
    expect(b.toObject()).toEqual(a.toObject());
  });
});

//---------------------------------------
// the missions in the game
//---------------------------------------

describe.skipIf(!hasAssets)('missions in the game', () => {
  it('the deliveries of a level are counted by StationSystem for the active mission "deliver N passengers"', () => {
    initLevel01();
    const mission = missionsOf(G.missions).find((m) => m.statName == 'numPassengers') as MissionData;
    mission.isActive = true;
    const pilot = new ScriptedPilot();
    for (let t = 1; t <= 3000 && pilot.deliveredAt.length < 2; t++) {
      pilot.step();
      levelTick();
    }

    expect(pilot.deliveredAt).toHaveLength(2);
    expect(mission.value).toBe(2);
  });

  it('the mission that is done at the end of a level is on the screen with a Get button; Get gives the award', () => {
    const state = newMenuGame();
    ticks(60);
    const mission = missionsOf(G.missions).find((m) => m.statName == 'numPassengers') as MissionData;
    mission.isActive = true;
    mission.track(mission.goalValue); // done
    expect(G.content.isUnlocked(mission.awardId as string)).toBe(false);
    G.gameData.currentLevelName = 'Level01';
    G.gameData.setNextLevelName('Level02');
    (G.core.getSystem(MenuSystem) as MenuSystem).makeScreenNow(MenuSystem.LEVEL_COMPLETE_SCREEN);
    ticks(700);
    const anims = animNames(state);
    expect(anims).toContain('MissionBar_mc'); // the bars of the two missions are shown
    expect(anims).toContain('IconPassengerOrangeSmall_mc');
    expect(anims.filter((a) => a == 'BtnGet_mc')).toHaveLength(1);
    const get = buttonAnim(state, 'BtnGet_mc') as AntButton;
    const click = (x: number, y: number): void => {
      tick({ mouseX: x, mouseY: y });
      tick({ mouseX: x, mouseY: y, mouseDown: true });
      tick({ mouseX: x, mouseY: y, mouseDown: false });
    };
    click(get.globalX + get.origin.x + get.width * 0.5, get.globalY + get.origin.y + get.height * 0.5);
    expect(G.content.isUnlocked('passengerOrange')).toBe(true);
    expect(animNames(state)).toContain('IconPassengerOrange_mc'); // the popup with the icon of the award
  });
});

//---------------------------------------
// MusicManager
//---------------------------------------

describe.skipIf(!hasAssets)('MusicManager', () => {
  function game(): MusicManager {
    AntMath.seed(1);
    startGame();
    return G.music;
  }

  const trackId = (aName: string): number => (G.music.manager.catalog?.get(aName)?.id ?? -1) as number;
  const playing = (): number[] => G.music.manager.collectLoops().map((c) => c.soundId);

  it('the manager has its own AntSoundManager with the three tracks, the commands are the themes', () => {
    const music = game();
    expect(AntG.plugins.contains(music)).toBe(true);
    expect(music.manager).not.toBe(AntG.sounds);
    expect(music.isPlaying()).toBe(false);
    expect(music.mute).toBe(false);
    for (const name of ['SndMusicMenu01', 'SndMusicGameplay01', 'SndMusicGameplay02']) {
      expect(trackId(name), name).toBeGreaterThanOrEqual(0);
    }
  });

  it('playMenuTheme plays the menu track; it is a live channel of the music manager, not a one-shot', () => {
    const music = game();
    music.playMenuTheme();
    expect(music.isPlaying()).toBe(true);
    expect(playing()).toEqual([trackId('SndMusicMenu01')]);
    ticks(3);
    expect(playing()).toEqual([trackId('SndMusicMenu01')]);
    expect(AntG.sounds.takeOneShots()).toEqual([]);
  });

  it('the track of the game is one of the two, the same for the same seed', () => {
    const seen = new Set<number>();
    for (let n = 1; n <= 12; n++) {
      const seed = Math.imul(n, 2654435761) >>> 0; // small seeds give small first numbers: the same pick
      game();
      AntMath.seed(seed);
      G.music.playGameTheme();
      const first = playing();
      expect(first).toHaveLength(1);
      seen.add(first[0] as number);
      game();
      AntMath.seed(seed);
      G.music.playGameTheme();
      expect(playing()).toEqual(first);
    }

    expect([...seen].sort()).toEqual([trackId('SndMusicGameplay01'), trackId('SndMusicGameplay02')].sort());
  });

  it('a new theme fades the old track out (1 s for the menu, 0.5 s for the game) and then plays', () => {
    const music = game();
    music.playMenuTheme();
    ticks(5);
    music.playGameTheme();
    expect(playing()).toEqual([trackId('SndMusicMenu01')]); // still fading
    const volumes: number[] = [];
    for (let i = 0; i < 40 && !playing().some((id) => id != trackId('SndMusicMenu01')); i++) {
      volumes.push(music.manager.collectLoops()[0]?.volume ?? 0);
      tick();
    }

    expect(playing()).toHaveLength(1);
    expect(playing()[0]).not.toBe(trackId('SndMusicMenu01'));
    expect(volumes[volumes.length - 1]).toBeLessThan((volumes[0] as number) * 0.2);
    expect(volumes.length).toBeGreaterThanOrEqual(16); // 0.5 s = 17.5 ticks
    expect(volumes.length).toBeLessThanOrEqual(20);
  });

  it('stop fades the music out; mute stops it and does not start a theme; unmute plays the current track again', () => {
    const music = game();
    music.playMenuTheme();
    ticks(3);
    music.stop();
    ticks(25);
    expect(music.isPlaying()).toBe(false);
    expect(playing()).toEqual([]);

    music.mute = true;
    music.playGameTheme();
    expect(playing()).toEqual([]);
    music.mute = false;
    expect(playing()).toHaveLength(1);
    music.mute = true; // stop() of a playing track
    ticks(25);
    expect(playing()).toEqual([]);
    expect(music.isPlaying()).toBe(false);
  });

  it('unmuting before any theme was chosen does not throw', () => {
    const music = game();
    music.mute = true;
    expect(() => {
      music.mute = false;
    }).not.toThrow();
    expect(music.isPlaying()).toBe(false);
  });

  it('the main menu plays the menu theme; the Frame header carries the track and the mute flag', async () => {
    const r = await runHeadless({ seed: 4, ticks: 70 });
    const menuId = G.music.manager.catalog?.get('SndMusicMenu01')?.id as number;
    const head = readFrame(r.frames[69] as ArrayBuffer);
    expect(head.musicTrack).toBe(menuId);
    expect(head.musicVol).toBeGreaterThan(0);
    expect(head.muteFlags & MUTE_MUSIC).toBe(0);
    G.music.mute = true;
    expect(readFrame(r.loop.tick(emptyInputSnapshot())).muteFlags & MUTE_MUSIC).not.toBe(0);
  });
});

//---------------------------------------
// the Quality switch of the pause
//---------------------------------------

describe.skipIf(!hasAssets)('Quality switch', () => {
  async function makeLoop(aQuality: boolean[], aSave?: object): Promise<GameLoop> {
    const save = new MemorySaveStorage();
    if (aSave != null) {
      await save.save(GameData.SAVE_KEY, aSave);
    }

    const host: HostApi = {
      onFrame: () => undefined,
      openExternal: () => undefined,
      onQuality: (smooth) => aQuality.push(smooth),
      log: () => undefined,
    };
    const loop = new GameLoop({
      assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
      save,
      seed: 9,
      host,
      clock: () => 0,
    });
    await loop.init();
    return loop;
  }

  it('the switch of the pause reaches the host: smooth = fancyQuality', async () => {
    const calls: boolean[] = [];
    const loop = await makeLoop(calls);
    for (let i = 0; i < 5; i++) loop.tick(emptyInputSnapshot());
    G.gameData.fancyQuality = false;
    G.gameState.setFancyQuality(false);
    G.gameData.fancyQuality = true;
    G.gameState.setFancyQuality(true);
    expect(calls).toEqual([false, true]);
  });

  it('a save with fancyQuality = false is sent to the renderer at the start', async () => {
    const calls: boolean[] = [];
    const loop = await makeLoop(calls, {
      currentLevelName: 'Level01',
      muteMusic: true,
      muteSounds: false,
      fancyEffects: true,
      fancyQuality: false,
      casualMode: false,
      players: [],
      levels: [],
      missions: {},
      content: {},
    });
    for (let i = 0; i < 5; i++) loop.tick(emptyInputSnapshot());
    expect(calls).toEqual([false]);
    expect(G.music.mute).toBe(true);
    expect(G.gameData.casualMode).toBe(false);
  });
});

describe('Quality switch: worker -> renderer', () => {
  it('SimClient hands {t:"quality"} of the worker to onQuality', () => {
    const smooth: boolean[] = [];
    let handler: ((ev: MessageEvent<SimOut>) => void) | null = null;
    const worker: WorkerLike = {
      postMessage: () => undefined,
      get onmessage() {
        return handler;
      },
      set onmessage(h) {
        handler = h;
      },
      onerror: null,
      terminate: () => undefined,
    };
    const client = new SimClient({
      seed: 1,
      assetBase: 'app://assets/',
      onFrame: () => undefined,
      onQuality: (s) => smooth.push(s),
      at: {
        save: { load: async () => null, write: async () => undefined },
        app: { openExternal: async () => true },
      },
      createWorker: () => worker,
    });
    const emit = (msg: SimOut): void => (handler as (ev: MessageEvent<SimOut>) => void)({ data: msg } as MessageEvent<SimOut>);
    emit({ t: 'quality', smooth: false });
    emit({ t: 'quality', smooth: true });
    expect(smooth).toEqual([false, true]);
    client.dispose();
  });

  it('AtlasLoader.setSmooth switches the scale mode of every atlas page between linear and nearest', () => {
    const loader = new AtlasLoader({} as Manifest, 'hd' as never);
    const pages = new Map<string, { group: string; source: { scaleMode: string } }>([
      ['a', { group: 'ui', source: { scaleMode: 'linear' } }],
      ['b', { group: 'level-01', source: { scaleMode: 'linear' } }],
    ]);
    (loader as unknown as { _pages: typeof pages })._pages = pages;
    expect(loader.smooth).toBe(true);
    loader.setSmooth(false);
    expect(loader.smooth).toBe(false);
    expect([...pages.values()].map((p) => p.source.scaleMode)).toEqual(['nearest', 'nearest']);
    loader.setSmooth(true);
    expect([...pages.values()].map((p) => p.source.scaleMode)).toEqual(['linear', 'linear']);
  });
});
