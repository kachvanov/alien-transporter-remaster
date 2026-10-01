// Port of ru/alientransporter/systems/RenderSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { PhysicRenderNode } from '../nodes/PhysicRenderNode';

export class RenderSystem extends AntSystem {
  static readonly className = 'RenderSystem';

  private _renderNodes: AntNodeList<PhysicRenderNode> | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._renderNodes = aCore.getNodes(PhysicRenderNode);
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._renderNodes = null;
  }

  override update(): void {
    const renderNodes = this._renderNodes as AntNodeList<PhysicRenderNode>;
    let i = 0; // :int
    while (i < renderNodes.numNodes) {
      const node = renderNodes.get(i++) as PhysicRenderNode;
      node.display.view.x = node.physic.body.x;
      node.display.view.y = node.physic.body.y;
      node.display.view.angle = node.physic.body.angle;
    }
  }
}
