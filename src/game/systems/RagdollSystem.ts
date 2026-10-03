// Port of ru/alientransporter/systems/RagdollSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntObject } from '../../engine/ants/AntObject';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { RagdollNode } from '../nodes/RagdollNode';

export class RagdollSystem extends AntSystem {
  static readonly className = 'RagdollSystem';

  private _core: AntCore | null = null;
  private _ragdollNodes: AntNodeList<RagdollNode> | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._ragdollNodes = aCore.getNodes(RagdollNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._core = null;
    this._ragdollNodes = null;
  }

  override update(): void {
    const ragdollNodes = this._ragdollNodes as AntNodeList<RagdollNode>;
    let i = 0; // :* (an int in practice)
    while (i < ragdollNodes.numNodes) {
      const node = ragdollNodes.get(i++) as RagdollNode;
      node.ragdoll.lifeTime -= 2 * AntG.elapsed;
      if (node.ragdoll.lifeTime <= 0 && node.ragdoll.model.fadeOut()) {
        (this._core as AntCore).removeObject(node.object as AntObject);
      }
    }
  }
}
