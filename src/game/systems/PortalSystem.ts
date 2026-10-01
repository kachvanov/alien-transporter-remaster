// Port of ru/alientransporter/systems/PortalSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import type { AntObject } from '../../engine/ants/AntObject';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { Config } from '../Config';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';
import { PortalNode } from '../nodes/PortalNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { MenuSystem } from './MenuSystem'; // STUB(T2.1)

export class PortalSystem extends AntSystem {
  static readonly className = 'PortalSystem';

  private _portalNodes: AntNodeList<PortalNode> | null = null;
  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._portalNodes = aCore.getNodes(PortalNode);
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._portalNodes = null;
    this._shuttleNodes = null;
    this._core = null;
  }

  override update(): void {
    const portalNodes = this._portalNodes as AntNodeList<PortalNode>;
    let i = 0; // :* (an int in practice)
    while (i < portalNodes.numNodes) {
      const portalNode = portalNodes.get(i++) as PortalNode;
      if (portalNode.portal.isActive) {
        if (this.checkForShuttles(portalNode)) {
          const taskManager = new AntTaskManager();
          taskManager.addPause(2);
          taskManager.addInstantTask(this.onOpenLevelCompleteMenu);
          G.gameData.setNextLevelName(portalNode.portal.levelKey as string);
          portalNode.portal.isActive = false;
          break;
        }
      }
    }
  }

  private onOpenLevelCompleteMenu = (): void => {
    const menuSystem = (this._core as AntCore).getSystem(MenuSystem) as MenuSystem;
    menuSystem.switchScreen(MenuSystem.LEVEL_COMPLETE_SCREEN);
  };

  private checkForShuttles(aNode: PortalNode): boolean {
    const shuttleNodes = this._shuttleNodes as AntNodeList<ShuttleNode>;
    let i = 0; // :* (an int in practice)
    while (i < shuttleNodes.numNodes) {
      const shuttleNode = shuttleNodes.get(i++) as ShuttleNode;
      if (aNode.portal.isInside(shuttleNode.display.view.x, shuttleNode.display.view.y)) {
        AntEffectManager.makeEffect(
          shuttleNode.display.view.x,
          shuttleNode.display.view.y,
          'ToPortal_eff',
          G.gameState.layerMainEffects,
        );
        AntG.sounds.play('SndPortalAction', shuttleNode.display.view);
        if (
          G.gameData.getLives(PlayerData.PLAYER1) >= Config.defLives - 1 &&
          G.gameData.getLives(PlayerData.PLAYER2) >= Config.defLives - 1
        ) {
          if (G.gameData.isTwoPlayerMode && shuttleNodes.numNodes == 2) {
            G.missions.track('numCareful');
          } else if (!G.gameData.isTwoPlayerMode) {
            G.missions.track('numCareful');
          }
        }

        (this._core as AntCore).removeObject(shuttleNode.object as AntObject);
        return true;
      }
    }

    return false;
  }
}
