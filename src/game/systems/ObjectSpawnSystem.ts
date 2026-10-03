// Port of ru/alientransporter/systems/ObjectSpawnSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntObject } from '../../engine/ants/AntObject';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntMath } from '../../engine/utils/AntMath';
import { Factory } from '../map/Factory';
import { ExpelObjectNode } from '../nodes/ExpelObjectNode';
import { ObjectRemoveNode } from '../nodes/ObjectRemoveNode';
import { ObjectSpawnNode } from '../nodes/ObjectSpawnNode';

export class ObjectSpawnSystem extends AntSystem {
  static readonly className = 'ObjectSpawnSystem';

  private _objectSpawnNodes: AntNodeList<ObjectSpawnNode> | null = null;
  private _objectRemoveNodes: AntNodeList<ObjectRemoveNode> | null = null;
  private _expelObjectNodes: AntNodeList<ExpelObjectNode> | null = null;
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._objectSpawnNodes = aCore.getNodes(ObjectSpawnNode);
    this._objectRemoveNodes = aCore.getNodes(ObjectRemoveNode);
    this._expelObjectNodes = aCore.getNodes(ExpelObjectNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._objectSpawnNodes = null;
    this._objectRemoveNodes = null;
    this._expelObjectNodes = null;
    this._core = null;
  }

  override update(): void {
    this.updateObjectSpawners();
    this.updateObjectRemovers();
  }

  private updateObjectRemovers(): void {
    const expelObjectNodes = this._expelObjectNodes as AntNodeList<ExpelObjectNode>;
    let i = (expelObjectNodes.numNodes - 1) | 0; // :*
    while (i >= 0) {
      const node = expelObjectNodes.get(i--) as ExpelObjectNode;
      if (this.isInsideRemover(node.display.view.x, node.display.view.y)) {
        (this._core as AntCore).removeObject(node.object as AntObject);
      }
    }
  }

  private isInsideRemover(aX: number, aY: number): boolean {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const objectRemoveNodes = this._objectRemoveNodes as AntNodeList<ObjectRemoveNode>;
    let i = 0; // :* (an int in practice)
    while (i < objectRemoveNodes.numNodes) {
      const node = objectRemoveNodes.get(i++) as ObjectRemoveNode;
      if (node.remover.active && node.remover.isInside(aX, aY)) {
        return true;
      }
    }

    return false;
  }

  private updateObjectSpawners(): void {
    const objectSpawnNodes = this._objectSpawnNodes as AntNodeList<ObjectSpawnNode>;
    let i = 0; // :* (an int in practice)
    while (i < objectSpawnNodes.numNodes) {
      const node = objectSpawnNodes.get(i++) as ObjectSpawnNode;
      if (node.spawner.active) {
        node.spawner.time -= 2 * AntG.elapsed;
        if (node.spawner.time <= 0) {
          this.spawnObjectFrom(node);
          node.spawner.time = node.spawner.interval;
          node.spawner.time += AntMath.randomRangeNumber(node.spawner.lowerInterval, node.spawner.upperInterval);
        }
      }
    }
  }

  private spawnObjectFrom(aNode: ObjectSpawnNode): void {
    if (aNode.spawner.count > 0 || aNode.spawner.count <= -1) {
      aNode.spawner.count = aNode.spawner.count > 0 ? (aNode.spawner.count - 1) | 0 : aNode.spawner.count;
      const objects = aNode.spawner.objects;
      const index = AntMath.randomRangeInt(0, objects.length - 1) | 0; // :int
      if (index >= 0 && index < objects.length) {
        switch (objects[index]) {
          case 'BoxSmall_com':
            Factory.makeSmallBox(aNode.spawner.x, aNode.spawner.y, 0);
            break;
          case 'BoxBig_com':
            Factory.makeBigBox(aNode.spawner.x, aNode.spawner.y, 0);
            break;
          case 'Barrel_com':
            Factory.makeBarrel(aNode.spawner.x, aNode.spawner.y, 0);
            break;
          case 'BarrelExp_com':
            Factory.makeBarrelExp(aNode.spawner.x, aNode.spawner.y, 0);
        }
      }
    }
  }
}
