// T3.6: the LAN game inside the game: the remote P2 (InputRouter in Host mode), the ship of the client (it is not saved),
// the client that leaves (the shuttle goes without a death, the notice), the end of the session at the main menu.
// The game is the real one (Level01 with all the systems) driven by GameLoop; the network is replaced by the calls that
// the worker makes (`remotePeer`, `input.setRemote`).

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { readFile } from 'node:fs/promises';
import { FramePlayer } from '../../src/render/FramePlayer';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { Config } from '../../src/game/Config';
import { PlayerData } from '../../src/game/data/PlayerData';
import type { ShuttleView } from '../../src/game/views/ShuttleView';
import { G } from '../../src/game/G';
import { OnlineBridge } from '../../src/game/online/OnlineBridge';
import type { OnlineRequest } from '../../src/game/online/OnlineBridge';
import { NOTICE_P2_DISCONNECTED, RemotePlayer } from '../../src/game/online/RemotePlayer';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { UISystem } from '../../src/game/systems/UISystem';
import { GameLoop } from '../../src/sim/GameLoop';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import { InputRouter, KEY_P2_GAS, KEY_P2_LEFT, KEY_P2_RIGHT, KEY_PAUSE } from '../../src/sim/InputRouter';
import { Level01State } from './helpers/game';

const assetsRoot = resolve(process.cwd(), 'assets');
const hasAssets = existsSync(resolve(assetsRoot, 'manifest.json')) && existsSync(resolve(assetsRoot, 'sounds.json'));

function snap(keys: number[]): InputSnapshot {
  return { keysDown: keys, mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
}

//---------------------------------------
// InputRouter in Host mode
//---------------------------------------

describe('InputRouter: Host mode (T3.6)', () => {
  it('the remote bits become the keys of P2: isDown(keyP2Gas) for the game', () => {
    const r = new InputRouter();
    r.setHostMode(true);
    r.setLocal(snap([]));
    r.setRemote({ gas: true, left: false, right: true, pauseReq: false });
    const keys = r.compose().keysDown;
    expect(keys).toContain(KEY_P2_GAS);
    expect(keys).toContain(KEY_P2_RIGHT);
    expect(keys).not.toContain(KEY_P2_LEFT);
  });

  it('a local press of W/A/D is ignored, the other keys of the host (P1) pass', () => {
    const r = new InputRouter();
    r.setHostMode(true);
    r.setLocal(snap([38, 37, KEY_P2_GAS, KEY_P2_LEFT, KEY_P2_RIGHT]));
    expect(r.compose().keysDown).toEqual([38, 37]);
    r.setRemote({ gas: false, left: true, right: false, pauseReq: false });
    expect(r.compose().keysDown).toEqual([38, 37, KEY_P2_LEFT]);
  });

  it('re-bound keys of P2 are used; an unassigned one (-1) is neither filtered nor pressed', () => {
    const r = new InputRouter();
    r.setHostMode(true);
    r.setP2Keys({ gas: 73, left: 74, right: -1 });
    r.setLocal(snap([73, KEY_P2_GAS]));
    r.setRemote({ gas: true, left: true, right: true, pauseReq: false });
    expect(r.compose().keysDown).toEqual([KEY_P2_GAS, 73, 74]);
  });

  it('Solo mode does not touch the keys, even when a remote state was set', () => {
    const r = new InputRouter();
    r.setLocal(snap([KEY_P2_GAS]));
    r.setRemote({ gas: false, left: true, right: false, pauseReq: true });
    expect(r.compose().keysDown).toEqual([KEY_P2_GAS]);
  });

  it('pauseReq is one press of P', () => {
    const r = new InputRouter();
    r.setHostMode(true);
    r.setLocal(snap([]));
    r.setRemote({ gas: false, left: false, right: false, pauseReq: true });
    expect(r.compose().keysDown).toEqual([KEY_PAUSE]);
    expect(r.compose().keysDown).toEqual([]);
  });
});

//---------------------------------------
// The first frame of the client that joins in the middle of a level
//---------------------------------------

describe('FramePlayer: a client that joins in the middle of a level (T3.6)', () => {
  it('the first frame has no pairs: no interpolation, every node is drawn where the frame has it', () => {
    function frame(aTick: number, aX: number): ArrayBuffer {
      const buf = new ArrayBuffer(26 + 4 + 2 + 1 + 12);
      const v = new DataView(buf);
      v.setUint8(0, 0x01);
      v.setUint32(1, aTick, true);
      v.setUint16(6, 0xffff, true);
      v.setUint16(10, 0xffff, true);
      v.setUint16(18, 1, true); // one node
      v.setUint32(26, (5 << 8) >>> 0, true); // uid
      v.setUint16(30, 3, true); // texId
      v.setUint8(32, 0); // flags: no teleport, no scene reset in the header (flags of the frame stay 0)
      v.setFloat32(33, aX, true);
      v.setFloat32(37, 100, true);
      v.setFloat32(41, 0, true);
      return buf;
    }
    const player = new FramePlayer({ classic: false });
    player.push(frame(5000, 300), 1000); // (the host has been playing for a while: tick 5000)
    const s1 = player.sample(1010);
    expect(s1).not.toBeNull();
    expect(s1!.frame.nodes[0]!.x).toBe(300);
    expect(s1!.x[0]).toBe(300);
    // the next frame has a pair and is interpolated as usual
    player.push(frame(5001, 310), 1000 + 1000 / 35);
    const s2 = player.sample(1000 + 1000 / 35 + 1000 / 70);
    expect(s2!.x[0]).toBeCloseTo(305, 3);
  });
});

//---------------------------------------
// GameData: the override of a ship is not saved
//---------------------------------------

describe('GameData.overrideShip (T3.6)', () => {
  it('replaces the ship of P2 for the session; saveData writes the real one; restoreShip brings it back', () => {
    const storage = new MemoryGameSaveStorage();
    GameData.storage = storage;
    const gd = new GameData();
    const p2 = gd.getPlayerData(PlayerData.PLAYER2) as PlayerData;
    const real = { shuttleKind: p2.shuttleKind, shuttleColor: p2.shuttleColor, engineKind: p2.engineKind, engineColor: p2.engineColor };
    const guest = { shuttleKind: 3, shuttleColor: 5, engineKind: 2, engineColor: 4 };
    gd.overrideShip(PlayerData.PLAYER2, guest);
    gd.overrideShip(PlayerData.PLAYER2, guest); // (a second call does not forget the real one)
    expect(gd.hasShipOverride(PlayerData.PLAYER2)).toBe(true);
    expect(p2.shuttleColor).toBe(5);
    expect(p2.engineKind).toBe(2);
    expect(gd.getPlayerData(PlayerData.PLAYER1)!.shuttleColor).toBe(1); // (P1 is not touched)

    // saveData needs the managers of G (the game of the test is created by startGame in other tests; here only the part
    // of the players is checked through toObject of the save)
    const saved = captureSavedPlayers(gd);
    expect(saved[1]).toMatchObject(real);
    expect(p2.shuttleColor).toBe(5); // (saving does not touch the live data)

    gd.restoreShip(PlayerData.PLAYER2);
    expect(gd.hasShipOverride(PlayerData.PLAYER2)).toBe(false);
    expect([p2.shuttleKind, p2.shuttleColor, p2.engineKind, p2.engineColor]).toEqual([
      real.shuttleKind,
      real.shuttleColor,
      real.engineKind,
      real.engineColor,
    ]);
    gd.restoreShip(PlayerData.PLAYER2); // (nothing to restore: no change)
    expect(p2.shuttleColor).toBe(real.shuttleColor);
  });

  it('RemotePlayer.checkShip: a look the original cannot show becomes the look of Player2', () => {
    const bad = RemotePlayer.checkShip({ shuttleKind: 0, shuttleColor: 99, engineKind: 7, engineColor: -1 });
    expect(bad).toEqual({ shuttleKind: 1, shuttleColor: 2, engineKind: 1, engineColor: 2 });
    const ok = { shuttleKind: 4, shuttleColor: 5, engineKind: 3, engineColor: 1 };
    expect(RemotePlayer.checkShip(ok)).toEqual(ok);
  });
});

/** The `players` that saveData would write: saveData itself reads G.missions / G.content, so a stub game is set up. */
function captureSavedPlayers(aGameData: GameData): Record<string, unknown>[] {
  const savedG = { missions: G.missions, content: G.content };
  (G as unknown as Record<string, unknown>)['missions'] = { toObject: () => ({}) };
  (G as unknown as Record<string, unknown>)['content'] = { toObject: () => ({}) };
  try {
    aGameData.saveData();
  } finally {
    (G as unknown as Record<string, unknown>)['missions'] = savedG.missions;
    (G as unknown as Record<string, unknown>)['content'] = savedG.content;
  }
  const data = GameData.storage.read(GameData.SAVE_KEY) as { players: Record<string, unknown>[] };
  return data.players;
}

//---------------------------------------
// The real game
//---------------------------------------

interface Session {
  loop: GameLoop;
  requests: OnlineRequest[];
  save: MemorySaveStorage;
  tick(aN: number, aKeys?: number[]): void;
  p2Shuttle(): ShuttleNode | null;
  shuttles(): number;
}

async function startSession(aInitial: typeof Level01State | undefined): Promise<Session> {
  const requests: OnlineRequest[] = [];
  const save = new MemorySaveStorage();
  const loop = new GameLoop({
    assets: new FileAssetSource(assetsRoot, (p) => readFile(p)),
    save,
    seed: 7,
    host: { onFrame: () => undefined, openExternal: () => undefined, onOnline: (r) => requests.push(r), log: () => undefined },
    initialState: aInitial,
    clock: () => 0,
  });
  await loop.init();
  const nodes = (): ShuttleNode[] => {
    const list = G.core.getNodes(ShuttleNode);
    const out: ShuttleNode[] = [];
    for (let i = 0; i < list.numNodes; i++) out.push(list.get(i) as ShuttleNode);
    return out;
  };
  return {
    loop,
    requests,
    save,
    tick(aN, aKeys = []) {
      for (let i = 0; i < aN; i++) {
        loop.input.setLocal(snap(aKeys));
        loop.tick(loop.input.compose());
      }
    },
    p2Shuttle: () => nodes().find((n) => n.stats.playerName == PlayerData.PLAYER2) ?? null,
    shuttles: () => nodes().length,
  };
}

const GUEST = { shuttleKind: 2, shuttleColor: 4, engineKind: 3, engineColor: 5 };

describe.skipIf(!hasAssets)('the LAN game in the real game (Level01)', () => {
  it('Solo: the local W spawns P2 as in the original; Host: the local W is ignored, the remote gas spawns it', async () => {
    const s = await startSession(Level01State);
    s.tick(10);
    expect(s.shuttles()).toBe(1); // (P1 is flying, P2 waits with its blinker)
    expect(s.loop.hostSession).toBe(false);

    // the session is Host (HostScreen sends hostOpen)
    OnlineBridge.send({ k: 'hostOpen' });
    expect(s.loop.hostSession).toBe(true);
    expect(s.loop.input.hostMode).toBe(true);
    expect(s.requests).toEqual([{ k: 'hostOpen' }]);
    s.tick(10, [87]); // W (Config.keyP2Gas) on the keyboard of the host
    expect(s.p2Shuttle()).toBeNull();
    s.loop.input.setRemote({ gas: true, left: false, right: false, pauseReq: false });
    s.tick(3);
    expect(s.p2Shuttle()).not.toBeNull();
    expect(G.gameData.isTwoPlayerMode).toBe(true);
    expect(G.gameData.getLives(PlayerData.PLAYER2)).toBe(Config.defLives - 1);
    expect(s.shuttles()).toBe(2);
  });

  it('the shuttle of the client has the ship of its hello, the save of the host keeps its own ship', async () => {
    const s = await startSession(Level01State);
    s.tick(5);
    OnlineBridge.send({ k: 'hostOpen' });
    const p2 = G.gameData.getPlayerData(PlayerData.PLAYER2) as PlayerData;
    const before = [p2.shuttleKind, p2.shuttleColor, p2.engineKind, p2.engineColor];
    s.loop.remotePeer({ ship: GUEST });
    s.tick(1);
    expect([p2.shuttleKind, p2.shuttleColor, p2.engineKind, p2.engineColor]).toEqual([2, 4, 3, 5]);
    G.gameData.saveData();
    const stored = GameData.storage.read(GameData.SAVE_KEY) as { players: Record<string, number>[] };
    expect(stored.players[1]).toMatchObject({ shuttleKind: before[0], shuttleColor: before[1], engineKind: before[2], engineColor: before[3] });

    s.loop.input.setRemote({ gas: true, left: false, right: false, pauseReq: false });
    s.tick(3);
    const shuttle = s.p2Shuttle() as ShuttleNode;
    expect(shuttle).not.toBeNull();
    expect((shuttle.display.view as ShuttleView).shuttleColor).toBe(4);
    expect(shuttle.model.engineColor).toBe(5);

    s.loop.remotePeer(null);
    s.tick(1);
    expect([p2.shuttleKind, p2.shuttleColor, p2.engineKind, p2.engineColor]).toEqual(before);
  });

  it('the client leaves in the middle of the level: the shuttle goes without a death, the life is back, the notice', async () => {
    const s = await startSession(Level01State);
    s.tick(5);
    OnlineBridge.send({ k: 'hostOpen' });
    s.loop.remotePeer({ ship: GUEST });
    s.loop.input.setRemote({ gas: true, left: false, right: false, pauseReq: false });
    s.tick(5);
    expect(s.p2Shuttle()).not.toBeNull();
    expect(G.gameData.getLives(PlayerData.PLAYER2)).toBe(Config.defLives - 1);

    s.loop.input.setRemote(null);
    s.loop.remotePeer(null);
    s.tick(1);
    expect(s.p2Shuttle()).toBeNull();
    expect(s.shuttles()).toBe(1); // (P1 flies on)
    expect(G.gameData.getLives(PlayerData.PLAYER2)).toBe(Config.defLives); // (no death is counted)
    expect(G.gameData.getLives(PlayerData.PLAYER1)).toBe(Config.defLives - 1);
    expect(G.gameData.isTwoPlayerMode).toBe(false);
    expect(RemotePlayer.noticeText).toBe(NOTICE_P2_DISCONNECTED);
    const ui = G.core.getSystem(UISystem) as UISystem;
    expect(ui.hasBlinker(PlayerData.PLAYER2)).toBe(true);
    expect(ui.isGameOver).toBe(false);

    // it comes back: a new client enters with its gas, as the first one did
    s.loop.remotePeer({ ship: GUEST });
    s.loop.input.setRemote({ gas: true, left: false, right: false, pauseReq: false });
    s.tick(3);
    expect(s.p2Shuttle()).not.toBeNull();
    expect(G.gameData.getLives(PlayerData.PLAYER2)).toBe(Config.defLives - 1);

    // the notice goes away by itself
    s.loop.remotePeer(null);
    s.tick(35 * 4);
    expect(RemotePlayer.noticeText).toBeNull();
  });

  it('the client leaves when nobody else can fly: the game is over (P1 has no lives)', async () => {
    const s = await startSession(Level01State);
    s.tick(5);
    OnlineBridge.send({ k: 'hostOpen' });
    s.loop.remotePeer({ ship: GUEST });
    s.loop.input.setRemote({ gas: true, left: false, right: false, pauseReq: false });
    s.tick(5);
    // P1 is gone with its last life (its shuttle leaves, as at the portal; the game goes on because P2 flies)
    G.gameData.resetLives(PlayerData.PLAYER1, 0);
    const list = G.core.getNodes(ShuttleNode);
    for (let i = 0; i < list.numNodes; i++) {
      const node = list.get(i) as ShuttleNode;
      if (node.stats.playerName == PlayerData.PLAYER1) {
        G.core.removeObject(node.object as NonNullable<ShuttleNode['object']>);
        break;
      }
    }
    s.tick(2);
    const ui = G.core.getSystem(UISystem) as UISystem;
    expect(ui.isGameOver).toBe(false);
    s.loop.remotePeer(null);
    s.tick(1);
    expect(s.shuttles()).toBe(0);
    expect(ui.isGameOver).toBe(true);
  });

  it('a client that leaves in a menu (no level) only gives the ship back', async () => {
    const s = await startSession(undefined);
    s.tick(3);
    OnlineBridge.send({ k: 'hostOpen' });
    s.loop.remotePeer({ ship: GUEST });
    s.tick(1);
    expect(G.gameData.hasShipOverride(PlayerData.PLAYER2)).toBe(true);
    s.loop.remotePeer(null);
    s.tick(1);
    expect(G.gameData.hasShipOverride(PlayerData.PLAYER2)).toBe(false);
  });

  it('the host that ends its session itself gets no "disconnected" notice', async () => {
    const s = await startSession(Level01State);
    s.tick(5);
    OnlineBridge.send({ k: 'hostOpen' });
    s.loop.remotePeer({ ship: GUEST });
    s.tick(1);
    OnlineBridge.send({ k: 'hostClose' }); // (STOP / the main menu): the server stops, the worker then gets `left`
    expect(s.loop.hostSession).toBe(false);
    expect(s.loop.input.hostMode).toBe(false);
    s.loop.remotePeer(null);
    s.tick(1);
    expect(RemotePlayer.noticeText).toBeNull();
    expect(G.gameData.hasShipOverride(PlayerData.PLAYER2)).toBe(false);
  });

  it('START of HostScreen keeps the session; the main menu ends it (hostClose to the renderer)', async () => {
    const s = await startSession(undefined);
    OnlineBridge.send({ k: 'hostOpen' });
    OnlineBridge.send({ k: 'hostBegin' });
    expect(s.loop.hostSession).toBe(true);
    // the start state of the game is the main menu: the screen appears after the loading
    s.tick(200);
    expect(s.requests.map((r) => r.k)).toEqual(['hostOpen', 'hostBegin', 'hostClose']);
    expect(s.loop.hostSession).toBe(false);
    expect(s.loop.input.hostMode).toBe(false);
  });

  it('a pause request of the client pauses the game of the host (one press of P)', async () => {
    const s = await startSession(Level01State);
    OnlineBridge.send({ k: 'hostOpen' });
    s.tick(10);
    expect(G.gamePause).toBe(false);
    s.loop.input.setRemote({ gas: false, left: false, right: false, pauseReq: true });
    s.tick(2);
    expect(G.gamePause).toBe(true);
    // the next tick has no press: the pause stays (it is not toggled back by the held bit)
    s.tick(5);
    expect(G.gamePause).toBe(true);
  });
});
