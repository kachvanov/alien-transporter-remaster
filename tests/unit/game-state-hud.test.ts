// T1.9e: GameState (layers, camera, systems, debugStartLevel), UISystem and the HUD views, headless Level01.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntMath } from '../../src/engine/utils/AntMath';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { Font } from '../../src/game/fonts/Font';
import { FuelIndicatorView } from '../../src/game/ui/FuelIndicatorView';
import { G } from '../../src/game/G';
import { Ground } from '../../src/game/map/Ground';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { ShuttleUINode } from '../../src/game/nodes/ShuttleUINode';
import { Factory } from '../../src/game/map/Factory';
import { GameState } from '../../src/game/states/GameState';
import { Label } from '../../src/game/fonts/Label';
import { readFrame } from '../../src/frame/FrameReader';
import { FrameWriter } from '../../src/frame/FrameWriter';
import { MainMenuScreen } from '../../src/game/screens/MainMenuScreen';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { UISystem } from '../../src/game/systems/UISystem';
import { LevelTitleUIView } from '../../src/game/ui/LevelTitleUIView';
import { PassengerBarUIView } from '../../src/game/ui/PassengerBarUIView';
import { PlayerJoinUIView } from '../../src/game/ui/PlayerJoinUIView';
import { ShuttleUIView } from '../../src/game/ui/ShuttleUIView';
import { PassengerView } from '../../src/game/views/PassengerView';
import { ShuttleView } from '../../src/game/views/ShuttleView';
import { hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';

const KEY_UP = 38;
const KEY_W = 87;

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

afterEach(() => {
  Ground.body = null;
  Ground.stopperList = null;
});

function newGame(): GameState {
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(12345);
  return startGame({ systems: true });
}

/** One tick of the game (Anthill.tick: input, state, cameras, plugins). */
function tick(aKeys: number[] = []): void {
  (AntG.anthill as NonNullable<typeof AntG.anthill>).tick({ ...emptyInputSnapshot(), keysDown: aKeys });
}

function ticks(aN: number, aKeys: number[] = []): void {
  for (let i = 0; i < aN; i++) {
    tick(aKeys);
  }
}

function shuttles(): ShuttleNode[] {
  const list = G.core.getNodes(ShuttleNode);
  const out: ShuttleNode[] = [];
  for (let i = 0; i < list.numNodes; i++) {
    out.push(list.get(i) as ShuttleNode);
  }

  return out;
}

function views<T extends AntEntity>(aClass: new () => T): T[] {
  return (G.gameState.layerInterface.children ?? []).filter((c): c is T => c instanceof aClass && c.exists);
}

describe.skipIf(!hasAssets)('GameState.create', () => {
  it('the layers are children of the state in the order of the add() calls of GameState.as', () => {
    const state = newGame();
    const order = [
      state.layerBack,
      state.layerBackEffects,
      state.layerBG,
      state.layerBGPassengers,
      state.layerHouses,
      state.layerIndicators,
      state.layerMain,
      state.layerPhysic,
      state.oilSimulation, // T2.2: the simulations and the map of GameState.as
      state.smokeSimulation,
      state.fireSimulation,
      state.layerEngineEffects,
      state.layerShuttles,
      state.layerFGPassengers,
      state.layerFragments,
      state.layerMainEffects,
      state.layerBonuses,
      state.lightEnvironment, // T2.4
      state.layerFG,
      state.layerRocks,
      state.layerFrontEffects,
      state.layerMenuBG,
      state.layerMenu,
      state.layerMenuFG,
      state.layerInterface,
      state.layerPopups,
      state.physicalMap,
    ];
    expect(new Set(order).size).toBe(27);
    expect(state.defGroup?.children).toEqual(order);
    expect(G.gameState).toBe(state);
  });

  it('the camera is 800x600, follows the anchor at (400, 300), rounds its position; the colour is 0xFF3A2F37', () => {
    const state = newGame();
    const camera = AntG.camera as NonNullable<typeof AntG.camera>;
    expect([camera.x, camera.y, camera.width, camera.height]).toEqual([0, 0, 800, 600]);
    expect(camera.backgroundColor).toBe(4281803575);
    expect(camera.roundPosition).toBe(true);
    expect(camera.target).toBe(state.cameraAnchor);
    expect([state.cameraAnchor.x, state.cameraAnchor.y]).toEqual([400, 300]);
  });

  it('G.init, the sounds, the fonts: radius 1000, the embedded sounds are registered, the ten fonts are cached', () => {
    newGame();
    expect(AntG.sounds.radius).toBe(1000);
    expect(AntG.sounds.mute).toBe(G.gameData.muteSounds);
    expect(G.music.mute).toBe(G.gameData.muteMusic);
    expect(Font.fromCache('font04Pink').charInterval).toBe(-2);
    AntG.sounds.takeOneShots(); // (the main menu screen of the state has played its sounds)
    AntG.sounds.play('SndShowButton'); // a name of Sounds.initEmbedded
    expect(AntG.sounds.takeOneShots()).toHaveLength(1);
  });

  it('the 17 systems of GameState.as', () => {
    newGame();
    const names = G.core.getSystems().map((s) => (s.constructor as { className?: string }).className);
    expect(names).toHaveLength(17);
    expect([...names].sort()).toEqual(
      [
        'ControlSystem',
        'GoalSystem',
        'HealthSystem',
        'MagnetSystem',
        'MenuSystem',
        'MissileSystem',
        'ObjectSpawnSystem',
        'PassengerSystem',
        'PortalSystem',
        'RagdollSystem',
        'RenderSystem',
        'SensorSystem',
        'ShuttleSystem',
        'SpawnSystem',
        'StationSystem',
        'TriggerSystem',
        'UISystem',
      ],
    );
    expect(G.core.getSystem(MenuSystem)?.currentScreen).toBeInstanceOf(MainMenuScreen); // T2.6: the first screen
  });
});

describe.skipIf(!hasAssets)('debugStartLevel(Level01): the shuttle, the HUD, the title', () => {
  let state: GameState;

  beforeEach(() => {
    state = newGame();
    state.debugStartLevel('Level01');
  });

  it('the level is loaded, Player1 is in the game with 2 lives left, Player2 has the blinker (PRESS UP)', () => {
    expect(G.levelManager.currentLevelNumber).toBe(1);
    expect(G.gameData.currentLevelName).toBe('Level01');
    expect(G.gameData.isTwoPlayerMode).toBe(false);
    expect(shuttles()).toHaveLength(1);
    expect(shuttles()[0]?.stats.playerName).toBe('Player1');
    expect(G.gameData.getLives('Player1')).toBe(2);
    expect(G.gameData.getLives('Player2')).toBe(3);
    const ui = G.core.getSystem(UISystem) as UISystem;
    expect(ui.hasBlinker('Player2')).toBe(true);
    expect(ui.hasBlinker('Player1')).toBe(false);
    const blinker = views(PlayerJoinUIView)[0] as PlayerJoinUIView;
    expect([blinker.x, blinker.y, blinker.playerName, blinker.kind]).toEqual([686, 37, 'Player2', 'PressUp']);
    expect(blinker.currentAnimation).toBe('Player2PressUp_mc');
  });

  it('the HUD of Player1: the view at (94, 38), left aligned, the bars follow the stats of the shuttle', () => {
    const hud = views(ShuttleUIView);
    expect(hud).toHaveLength(1);
    const view = hud[0] as ShuttleUIView;
    expect(view.playerName).toBe('Player1');
    expect(view.align).toBe(ShuttleUIView.LEFT);
    expect(view.x).toBe(94);
    expect(view.fuel.maxValue).toBe(1);
    expect(view.hull.maxValue).toBe(1);
    expect(view.hull.currentAnimation).toBe('ShuttleHull01Color01_mc');
    // show(): the view slides in from 50 px above (0.5 s tween of y)
    expect(view.y).toBeLessThan(38);
    ticks(30);
    expect(view.y).toBe(38);

    const node = G.core.getNodes(ShuttleUINode).get(0) as ShuttleUINode;
    expect(node.display.view).toBe(view);
    const stats = (shuttles()[0] as ShuttleNode).stats;
    G.gameData.giveCoins('Player1', 1234);
    stats.hull = 0.5;
    stats.fuel = 0.6;
    ticks(1);
    expect([view.coins.value, view.lives.value, view.hull.value, view.fuel.value]).toEqual([1234, 2, 0.5, 0.6]);
    ticks(80); // the numbers roll up (lerp 0.15) and the labels show them with the thousands separator
    const text = (v: ShuttleUIView['coins']): string => (v as unknown as { _label: { text: string } })._label.text;
    expect(text(view.coins)).toBe('1,234');
    expect(text(view.lives)).toBe('2');
  });

  it('the title of the level (786, 528) shows the number of the level; the passenger bar of the goal is made', () => {
    tick(); // GameScreen.create(): the title is the first task of the AntTaskManager (one task per tick)
    const title = views(LevelTitleUIView);
    expect(title).toHaveLength(1);
    expect(title[0]?.value).toBe(1);
    ticks(30);
    expect([title[0]?.x, title[0]?.y]).toEqual([786, 528]);
    const bar = views(PassengerBarUIView);
    expect(bar).toHaveLength(1);
    expect(bar[0]?.maxValue).toBe(2);
    expect(bar[0]?.x).toBe(AntG.widthHalf);
  });

  it('setFancyQuality switches the smoothing of the actors of the layers and ShuttleView.fancyQuality, not the smoothing of passengers', () => {
    const actors: AntActor[] = [];
    const passengers: PassengerView[] = [];
    for (const layer of [state.layerMain, state.layerFGPassengers, state.layerBGPassengers, state.layerShuttles]) {
      for (const child of layer.children ?? []) {
        if (child instanceof PassengerView) passengers.push(child);
        else if (child instanceof AntActor) actors.push(child);
      }
    }

    expect(actors.length).toBeGreaterThan(0);
    expect(passengers.length).toBeGreaterThan(0);
    const shuttle = (shuttles()[0] as ShuttleNode).display.shuttle as ShuttleView;
    expect(shuttle.smoothing).toBe(true);
    const passengerSmoothing = passengers.map((p) => p.smoothing);
    state.setFancyQuality(false);
    expect(actors.every((a) => !a.smoothing)).toBe(true);
    expect(passengers.map((p) => p.smoothing)).toEqual(passengerSmoothing);
    expect(shuttle.smoothing).toBe(false); // ShuttleView.fancyQuality (a setter) takes its parts along
    state.setFancyQuality(true);
    expect(actors.every((a) => a.smoothing)).toBe(true);
    expect(shuttle.smoothing).toBe(true);
  });

  it('a flying label (the coins of a fare: Factory.makeFlyingLabel) is a Label of layerFG: its glyphs are in the Frame', () => {
    Factory.makeFlyingLabel(300, 200, 25);
    ticks(2);
    const labels = (G.gameState.layerFG.children ?? []).filter((c): c is Label => c instanceof Label && c.exists);
    expect(labels).toHaveLength(1);
    const label = labels[0] as Label;
    expect(label.text).toBe('25');
    expect(label.fontName).toBe('font04Green');
    const writer = new FrameWriter();
    const frame = readFrame(writer.write({ root: state.defGroup, camera: AntG.camera as NonNullable<typeof AntG.camera>, tick: 0 }));
    const registry = AssetRegistry.current as AssetRegistry;
    const glyphs = frame.nodes.filter((n) => (n.uid >>> 8) === label.entityId);
    expect(glyphs.map((n) => n.texId)).toEqual([registry.glyphTexId('font04Green', 50), registry.glyphTexId('font04Green', 53)]);
    // the label is centred on its position by origin (the tween scales it about the centre)
    expect(label.origin.x).toBe(-label.width * 0.5);
    // (the movement and the end of the life of the label are FlyingLabel.update of MagnetSystem)
  });

  it('W adds Player2: its shuttle, a second HUD (706, 38, right aligned), two-player mode, one life less; the blinker goes', () => {
    ticks(5);
    expect(shuttles()).toHaveLength(1);
    tick([KEY_W]);
    tick([KEY_W]);
    expect(shuttles().map((s) => s.stats.playerName).sort()).toEqual(['Player1', 'Player2']);
    expect(G.gameData.isTwoPlayerMode).toBe(true);
    expect(G.gameData.getLives('Player2')).toBe(2);
    const hud = views(ShuttleUIView);
    expect(hud.map((v) => v.playerName).sort()).toEqual(['Player1', 'Player2']);
    const p2 = hud.find((v) => v.playerName == 'Player2') as ShuttleUIView;
    expect([p2.x, p2.align]).toEqual([706, ShuttleUIView.RIGHT]);
    expect(p2.hull.currentAnimation).toBe('ShuttleHull01Color02_mc'); // the second colour of Player2
    expect((G.core.getSystem(UISystem) as UISystem).hasBlinker('Player2')).toBe(false);
    expect(views(PlayerJoinUIView)).toHaveLength(0);
    // the goal of the level doubles for two players
    expect(views(PassengerBarUIView)[0]?.maxValue).toBe(4);
  });

  it('Player2 is steered by W (gas) in the world: the shuttle rises', () => {
    tick([KEY_W]);
    tick([KEY_W]);
    const p2 = shuttles().find((s) => s.stats.playerName == 'Player2') as ShuttleNode;
    ticks(40); // lands
    const y0 = p2.physic.body.y;
    ticks(25, [KEY_W]);
    expect(y0 - p2.physic.body.y).toBeGreaterThan(15);
    expect(p2.stats.fuel).toBeLessThan(1);
  });

  it('low fuel: the indicator slides in with the red alarm, the sound plays; a refill turns it off', () => {
    const node = G.core.getNodes(ShuttleUINode).get(0) as ShuttleUINode;
    const stats = (shuttles()[0] as ShuttleNode).stats;
    ticks(40);
    expect(node.indicator.view.visible).toBe(false);
    stats.fuel = 0.2;
    tick();
    expect(node.indicator.view.visible).toBe(true);
    expect(node.indicator.alarm).toBe(true);
    expect(node.indicator.view.labelText).toBe('low fuel');
    expect(node.indicator.view.labelColor).toBe(FuelIndicatorView.RED);
    const sounds = AntG.sounds;
    tick();
    expect(sounds.collectLoops().length + sounds.takeOneShots().length).toBeGreaterThan(0);
    stats.fuel = 0.9;
    ticks(2);
    expect(node.indicator.view.labelText).toBe('low fuel'); // hide() slides it out (0.25 s)
    ticks(20);
    expect(node.indicator.view.visible).toBe(false);
  });

  it('a lost shuttle: the HUD slides out and goes, after 1.5 s the blinker asks to press UP, UP spawns a new shuttle', () => {
    const ui = G.core.getSystem(UISystem) as UISystem;
    const first = shuttles()[0] as ShuttleNode;
    first.stats.hull = 0.1;
    first.model.hasHit = true;
    tick();
    tick();
    expect(shuttles()).toHaveLength(0);
    expect(ui.hasBlinker('Player1')).toBe(false); // the pause of 1.5 s first
    ticks(60);
    expect(views(ShuttleUIView)).toHaveLength(0);
    expect(ui.hasBlinker('Player1')).toBe(true);
    const blinker = views(PlayerJoinUIView).find((v) => v.playerName == 'Player1') as PlayerJoinUIView;
    expect([blinker.kind, blinker.x]).toEqual(['PressUp', 114]);
    tick([KEY_UP]);
    tick([KEY_UP]);
    expect(shuttles()).toHaveLength(1);
    expect(G.gameData.getLives('Player1')).toBe(1);
    expect(ui.hasBlinker('Player1')).toBe(false);
    expect(views(ShuttleUIView)).toHaveLength(1);
  });

  it('the last life is lost: game over (the popup of GameScreen, see ui-views.test.ts), no spawn any more, GAME OVER on the blinker is not made', () => {
    const ui = G.core.getSystem(UISystem) as UISystem;
    G.gameData.resetLives('Player1', 0);
    const first = shuttles()[0] as ShuttleNode;
    first.stats.hull = 0.1;
    first.model.hasHit = true;
    ticks(80);
    expect(ui.isGameOver).toBe(true);
    expect(state.gameScreen?.gameoverPopup).not.toBeNull();
    ui.spawnShuttle('Player1');
    expect(shuttles()).toHaveLength(0);
  });
});
