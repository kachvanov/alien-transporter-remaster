// Port of ru/alientransporter/systems/ControlSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { PlayerNode } from '../nodes/PlayerNode';

export class ControlSystem extends AntSystem {
  static readonly className = 'ControlSystem';

  private _playerNodes: AntNodeList<PlayerNode> | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._playerNodes = aCore.getNodes(PlayerNode);
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._playerNodes = null;
  }

  override update(): void {
    const playerNodes = this._playerNodes as AntNodeList<PlayerNode>;
    let i = 0; // :int
    while (i < playerNodes.numNodes) {
      const node = playerNodes.get(i++) as PlayerNode;
      node.control.isGas = AntG.keys.isDown(node.keys.keyGas);
      node.control.isLeft = AntG.keys.isDown(node.keys.keyLeft);
      node.control.isRight = AntG.keys.isDown(node.keys.keyRight);
    }
  }
}
