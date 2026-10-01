// Port of ru/alientransporter/systems/UISystem.as
//
// STUB(T2.5): onGameOver() should show the game over popup of the GameScreen (T2.6, GameOverPopupView of T2.5):
// `MenuSystem.currentScreen is GameScreen` does not exist yet (the MenuSystem is a stub, T2.1), so it only logs.

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntObject } from '../../engine/ants/AntObject';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntMath } from '../../engine/utils/AntMath';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import { DisplayUI } from '../components/DisplayUI';
import { FuelIndicator } from '../components/FuelIndicator';
import { Info } from '../components/Info';
import { Physic } from '../components/Physic';
import { ShuttleUISync } from '../components/ShuttleUISync';
import { Config } from '../Config';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';
import { ExpelObjectNode } from '../nodes/ExpelObjectNode';
import { RagdollNode } from '../nodes/RagdollNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { ShuttleSpawnNode } from '../nodes/ShuttleSpawnNode';
import { ShuttleUINode } from '../nodes/ShuttleUINode';
import { FuelIndicatorView } from '../ui/FuelIndicatorView';
import { PlayerJoinUIView } from '../ui/PlayerJoinUIView';
import { ShuttleUIView } from '../ui/ShuttleUIView';

export class UISystem extends AntSystem {
  static readonly className = 'UISystem';

  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _shuttleUINodes: AntNodeList<ShuttleUINode> | null = null;
  private _spawnShuttleNodes: AntNodeList<ShuttleSpawnNode> | null = null;
  private _ragdollNodes: AntNodeList<RagdollNode> | null = null;
  private _expelObjectNodes: AntNodeList<ExpelObjectNode> | null = null;
  private _core: AntCore | null = null;
  private _blinkers: (PlayerJoinUIView | null)[] | null = null;
  private _tm: AntTaskManager | null = null;
  private _isGameOver = false;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._shuttleNodes.eventNodeAdded.add(this.onShuttleAdded);
    this._shuttleNodes.eventNodeRemoved.add(this.onShuttleRemoved);
    this._shuttleUINodes = aCore.getNodes(ShuttleUINode);
    this._spawnShuttleNodes = aCore.getNodes(ShuttleSpawnNode);
    this._ragdollNodes = aCore.getNodes(RagdollNode);
    this._expelObjectNodes = aCore.getNodes(ExpelObjectNode);
    this._core = aCore;
    this._blinkers = [];
    this._tm = new AntTaskManager();
    this._isGameOver = false;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    // The original removes `onShuttleAdded` from eventNodeRemoved here (a typo that leaves both listeners).
    (this._shuttleNodes as AntNodeList<ShuttleNode>).eventNodeRemoved.remove(this.onShuttleAdded);
    this._shuttleNodes = null;
    this._shuttleUINodes = null;
    this._spawnShuttleNodes = null;
    this._ragdollNodes = null;
    this._expelObjectNodes = null;
    this._core = null;
    this._blinkers = null;
    (this._tm as AntTaskManager).clear();
    this._tm = null;
  }

  override update(): void {
    const shuttleUINodes = this._shuttleUINodes as AntNodeList<ShuttleUINode>;
    let i = 0; // :int
    while (i < shuttleUINodes.numNodes) {
      const node = shuttleUINodes.get(i++) as ShuttleUINode;
      if (node.sync.shuttleNode.stats != null) {
        node.display.view.coins.value = node.sync.shuttleNode.stats.coins;
        node.display.view.hull.value = node.sync.shuttleNode.stats.hull;
        node.display.view.fuel.value = node.sync.shuttleNode.stats.fuel;
        node.display.view.lives.value = node.sync.shuttleNode.stats.lives;
        if (node.indicator.view.visible) {
          if (node.sync.shuttleNode.display.view != null) {
            node.indicator.view.x = node.sync.shuttleNode.display.view.x + node.indicator.x;
            node.indicator.view.y = node.sync.shuttleNode.display.view.y + node.indicator.y;
            node.indicator.view.value = node.sync.shuttleNode.stats.fuel;
          }

          if (node.indicator.alarm && node.sync.shuttleNode.stats.isRefilling) {
            node.indicator.alarm = false;
            node.indicator.view.labelText = 'refiling';
            node.indicator.view.labelColor = FuelIndicatorView.GREEN;
          } else if (
            !node.indicator.alarm &&
            !node.sync.shuttleNode.stats.isRefilling &&
            node.sync.shuttleNode.stats.isLowFuel
          ) {
            node.indicator.alarm = true;
            node.indicator.view.labelText = 'low fuel';
            node.indicator.view.labelColor = FuelIndicatorView.RED;
          }

          node.indicator.updateAlarm();
          if (!node.sync.shuttleNode.stats.isLowFuel && !node.sync.shuttleNode.stats.isRefilling) {
            node.indicator.hide();
          }
        } else if (!node.indicator.view.visible) {
          if (node.sync.shuttleNode.stats.isLowFuel) {
            node.indicator.show('low fuel', FuelIndicatorView.RED);
            node.indicator.alarm = true;
          } else if (node.sync.shuttleNode.stats.isRefilling) {
            node.indicator.show('refiling', FuelIndicatorView.GREEN);
            node.indicator.alarm = false;
          }
        }
      }
    }

    if (AntG.keys.isPressed(Config.keyP1Gas) && this.hasBlinker(PlayerData.PLAYER1)) {
      this.spawnShuttle(PlayerData.PLAYER1);
    }

    if (AntG.keys.isPressed(Config.keyP2Gas) && this.hasBlinker(PlayerData.PLAYER2)) {
      this.spawnShuttle(PlayerData.PLAYER2);
    }
  }

  private onGameOver = (): void => {
    // STUB(T2.5): `var menu:MenuSystem = G.core.getSystem(MenuSystem); if(menu != null && menu.currentScreen is
    // GameScreen) (menu.currentScreen as GameScreen).showGameOverPopup();` (T2.6 has the GameScreen).
    AntG.log('game over', 'data');
  };

  spawnShuttle(aPlayer = 'Player1'): void {
    if (!this._isGameOver) {
      const spawnShuttleNodes = this._spawnShuttleNodes as AntNodeList<ShuttleSpawnNode>;
      let i = 0; // :int
      while (i < spawnShuttleNodes.numNodes) {
        const node = spawnShuttleNodes.get(i++) as ShuttleSpawnNode;
        if (node.point.player == aPlayer) {
          if (G.gameData.getLives(aPlayer) > 0) {
            if (aPlayer == PlayerData.PLAYER2) {
              G.gameData.isTwoPlayerMode = true;
            }

            G.gameData.takeLives(aPlayer, 1);
            this.clearSpawnArea(node.point.x, node.point.y, 50);
            node.point.spawn();
          }
        }
      }
    }
  }

  private clearSpawnArea(aX: number, aY: number, aRadius: number): void {
    aX = aX | 0;
    aY = aY | 0;
    aRadius = aRadius | 0;
    const ragdollNodes = this._ragdollNodes as AntNodeList<RagdollNode>;
    let i = 0; // :int
    while (i < ragdollNodes.numNodes) {
      const ragdollNode = ragdollNodes.get(i++) as RagdollNode;
      for (const key in ragdollNode.ragdoll.model.bodies) {
        const body = ragdollNode.ragdoll.model.bodies[key] as AntBox2DBody | null;
        if (body != null && body.exists && AntMath.distance(aX, aY, body.x, body.y) < aRadius) {
          body.destroy();
          ragdollNode.ragdoll.model.bodies[key] = null;
          delete ragdollNode.ragdoll.model.bodies[key];
        }
      }
    }

    const expelObjectNodes = this._expelObjectNodes as AntNodeList<ExpelObjectNode>;
    i = 0;
    while (i < expelObjectNodes.numNodes) {
      const expelNode = expelObjectNodes.get(i++) as ExpelObjectNode;
      const physic = (expelNode.object as AntObject).get(Physic) as Physic | null;
      if (physic != null && AntMath.distance(aX, aY, physic.body.x, physic.body.y) < aRadius) {
        (this._core as AntCore).removeObject(expelNode.object as AntObject);
      }
    }
  }

  private onShuttleAdded = (aNode: ShuttleNode): void => {
    const playerData = G.gameData.getPlayerData(aNode.stats.playerName) as PlayerData;
    const view = G.gameState.layerInterface.recycle(ShuttleUIView) as ShuttleUIView;
    view.playerName = aNode.stats.playerName;
    view.hull.shuttleKind = playerData.shuttleKind;
    view.hull.shuttleColor = playerData.shuttleColor;
    view.revive();
    view.fuel.maxValue = aNode.stats.maxFuel;
    view.hull.maxValue = aNode.stats.maxHull;
    view.show();
    const indicator = G.gameState.layerInterface.recycle(FuelIndicatorView) as FuelIndicatorView;
    indicator.maxValue = aNode.stats.maxFuel;
    indicator.revive();
    const object = new AntObject();
    object.add(new Info('ShuttleUI'));
    object.add(new DisplayUI(view));
    object.add(new ShuttleUISync(aNode));
    object.add(new FuelIndicator(indicator));
    (this._core as AntCore).addObject(object);
    this.removeBlinker(aNode.stats.playerName);
  };

  private onShuttleRemoved = (aNode: ShuttleNode): void => {
    const shuttleUINodes = this._shuttleUINodes as AntNodeList<ShuttleUINode>;
    let i = 0; // :int
    while (i < shuttleUINodes.numNodes) {
      const node = shuttleUINodes.get(i++) as ShuttleUINode;
      if (node.sync.shuttleNode == aNode) {
        if (aNode.stats.hull <= 0) {
          const tm = this._tm as AntTaskManager;
          tm.addPause(1.5);
          if (
            (!G.gameData.isTwoPlayerMode && G.gameData.getLives(aNode.stats.playerName) == 0) ||
            (G.gameData.isTwoPlayerMode &&
              G.gameData.getLives(PlayerData.PLAYER1) == 0 &&
              G.gameData.getLives(PlayerData.PLAYER2) == 0 &&
              (this._shuttleNodes as AntNodeList<ShuttleNode>).numNodes == 0)
          ) {
            if (!this._isGameOver) {
              // STUB(T2.5): `(menu.currentScreen as GameScreen).listenFocusLost = false` (the GameScreen, T2.6)
              tm.addInstantTask(this.onGameOver);
              this._isGameOver = true;
            }
          } else {
            tm.addInstantTask(this.onAddBlinker, [aNode.stats.playerName]);
          }
        }

        node.display.view.hide(this.onRemoveObject, [node.object]);
        break;
      }
    }
  };

  /** `_tm.addInstantTask(this.addBlinker, [name])` of the original: addBlinker as a bound method. */
  private onAddBlinker = (aPlayer: string): void => {
    this.addBlinker(aPlayer);
  };

  private onRemoveObject = (aObject: AntObject): void => {
    (this._core as AntCore).removeObject(aObject);
  };

  addBlinker(aPlayer: string): void {
    const blinker = G.gameState.layerInterface.recycle(PlayerJoinUIView) as PlayerJoinUIView;
    blinker.playerName = aPlayer;
    blinker.kind = G.gameData.getLives(aPlayer) > 0 ? PlayerJoinUIView.PRESS_UP : PlayerJoinUIView.GAME_OVER;
    blinker.gotoAndPlay(1);
    blinker.revive();
    switch (aPlayer) {
      case PlayerData.PLAYER1:
        blinker.reset(114, 37);
        break;
      case PlayerData.PLAYER2:
        blinker.reset(686, 37);
    }

    const blinkers = this._blinkers as (PlayerJoinUIView | null)[];
    let i = 0; // :int
    const n = blinkers.length | 0; // :int
    while (i < n) {
      if (blinkers[i] == null) {
        blinkers[i] = blinker;
        return;
      }

      i++;
    }

    blinkers.push(blinker);
  }

  hasBlinker(aPlayer: string): boolean {
    const blinkers = this._blinkers as (PlayerJoinUIView | null)[];
    let i = (blinkers.length - 1) | 0; // :int
    while (i >= 0) {
      const blinker = blinkers[i--] as PlayerJoinUIView | null;
      if (blinker != null && blinker.playerName == aPlayer) {
        return true;
      }
    }

    return false;
  }

  removeBlinker(aPlayer: string): void {
    const blinkers = this._blinkers as (PlayerJoinUIView | null)[];
    let i = (blinkers.length - 1) | 0; // :int
    while (i >= 0) {
      const blinker = blinkers[i] as PlayerJoinUIView | null;
      if (blinker != null && blinker.playerName == aPlayer) {
        blinker.kill();
        blinkers[i] = null;
      }

      i--;
    }
  }

  get isGameOver(): boolean {
    return this._isGameOver;
  }
  set isGameOver(value: boolean) {
    this._isGameOver = value;
  }
}
