// Not a port (T3.6, DEVIATION: online). The few hooks that the LAN game needs in the game itself (docs/tasks/T3.6): the
// network player flies the ship Player2 with its own look, and leaves.
//
// There is no network code here and none in the systems: the remote player "presses its keys" (sim/InputRouter.ts), so
// the join of P2 is the original one - the blinker "press up" of UISystem and `spawnShuttle("Player2")` (it also sets
// `isTwoPlayerMode`). What the original does not know is a player that goes away. The closest thing is a shuttle that
// leaves through the portal (PortalSystem: `core.removeObject(shuttle)`, UISystem.onShuttleRemoved hides its panel, no
// death, no explosion): that is the way P2 is taken off here, plus the blinker, so that the player can come back.

import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { PlayerData } from '../data/PlayerData';
import type { ShipLook } from '../data/GameData';
import { Label } from '../fonts/Label';
import { G } from '../G';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { UISystem } from '../systems/UISystem';

/** The valid looks of the original (GarageScreen: kinds 1..4, colours 1..5). A ship of a client is checked against them. */
const MAX_KIND = 4;
const MAX_COLOR = 5;

export const NOTICE_P2_DISCONNECTED = 'PLAYER 2 DISCONNECTED';
/** Seconds that a notice stays on the screen. */
export const NOTICE_SECONDS = 3;
/** The yellow of the texts of the original (OnlineScreenBase.TEXT_COLOR). */
const NOTICE_COLOR = 0xffffb15e;

export class RemotePlayer {
  /** The player of the network. */
  static readonly PLAYER = PlayerData.PLAYER2;

  /** The text of the notice that is on the screen (null: none); for the tests. */
  static noticeText: string | null = null;

  /**
   * The ship of a client as the host flies it: a value that the original cannot show (a client of another version, a
   * broken packet) is the look that the host has for Player2.
   */
  static checkShip(aShip: ShipLook): ShipLook {
    const fallback = new PlayerData(RemotePlayer.PLAYER);
    const kind = (aValue: number, aFallback: number): number =>
      Number.isInteger(aValue) && aValue >= 1 && aValue <= MAX_KIND ? aValue : aFallback;
    const color = (aValue: number, aFallback: number): number =>
      Number.isInteger(aValue) && aValue >= 1 && aValue <= MAX_COLOR ? aValue : aFallback;
    return {
      shuttleKind: kind(aShip.shuttleKind, fallback.shuttleKind),
      shuttleColor: color(aShip.shuttleColor, fallback.shuttleColor),
      engineKind: kind(aShip.engineKind, fallback.engineKind),
      engineColor: color(aShip.engineColor, fallback.engineColor),
    };
  }

  /** A client has come: its ship replaces the one of Player2 until `leave()`. It joins the level with its gas, as P2. */
  static join(aShip: ShipLook): void {
    G.gameData?.overrideShip(RemotePlayer.PLAYER, RemotePlayer.checkShip(aShip));
  }

  /**
   * The client has gone: the ship of P2 is the real one again; if it is on the level, it is taken off the level without
   * a death (the life that its spawn took is given back), the blinker "press up" comes back for the next player, and the
   * notice is shown (`aNotify`, false when the host has ended the session). With P2 gone `isTwoPlayerMode` is false (the game ends with the lives of Player1, as in the
   * single-player game) and, if nobody is left to fly, the game is over at once.
   */
  static leave(aNotify = true): void {
    const gameData = G.gameData as typeof G.gameData | undefined;
    if (gameData === undefined) {
      return; // (the game is not created yet)
    }

    gameData.restoreShip(RemotePlayer.PLAYER);
    const core = G.core as typeof G.core | undefined;
    const ui = core?.getSystem(UISystem) ?? null;
    if (core === undefined || ui === null) {
      return; // (no level: the menu has no shuttles and no blinkers)
    }

    const shuttles = core.getNodes(ShuttleNode) as AntNodeList<ShuttleNode>;
    let flying: ShuttleNode | null = null;
    for (let i = 0; i < shuttles.numNodes; i++) {
      const node = shuttles.get(i) as ShuttleNode;
      if (node.stats.playerName == RemotePlayer.PLAYER) {
        flying = node;
        break;
      }
    }

    if (flying !== null) {
      core.removeObject(flying.object as NonNullable<ShuttleNode['object']>);
      gameData.giveLives(RemotePlayer.PLAYER, 1);
      gameData.isTwoPlayerMode = false;
      if (!ui.hasBlinker(RemotePlayer.PLAYER)) {
        ui.addBlinker(RemotePlayer.PLAYER);
      }

      if (shuttles.numNodes == 0 && gameData.getLives(PlayerData.PLAYER1) == 0) {
        ui.triggerGameOver();
      }
    }

    if (aNotify) {
      RemotePlayer.showNotice(NOTICE_P2_DISCONNECTED);
    }
  }

  /** A line of the bitmap font on the interface layer; it goes away by itself. */
  static showNotice(aText: string): void {
    const state = G.gameState as typeof G.gameState | undefined;
    if (state === undefined || state.layerInterface === undefined) {
      return;
    }

    const label = state.layerInterface.recycle(Label) as Label;
    label.revive();
    label.align = Label.ALIGN_CENTER;
    label.fontName = 'font04';
    label.color = NOTICE_COLOR;
    label.text = aText;
    label.reset(400, 76);
    RemotePlayer.noticeText = aText;
    const tm = new AntTaskManager();
    tm.addPause(NOTICE_SECONDS);
    tm.addInstantTask(() => {
      // (a level that was left has killed the label already; it may have been recycled for another one)
      if (label.exists && label.text == aText) {
        label.kill();
      }

      if (RemotePlayer.noticeText == aText) {
        RemotePlayer.noticeText = null;
      }
    });
  }
}
