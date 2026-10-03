// Port of ru/alientransporter/systems/MissileSystem.as

import type { b2Vec2 } from '../../physics/box2dweb';
import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { G } from '../G';
import { MissileNode } from '../nodes/MissileNode';
import { MissilePointNode } from '../nodes/MissilePointNode';
import { SensorNode } from '../nodes/SensorNode';

export class MissileSystem extends AntSystem {
  static readonly className = 'MissileSystem';

  private _missilePointNodes: AntNodeList<MissilePointNode> | null = null;
  private _missileNodes: AntNodeList<MissileNode> | null = null;
  private _sensorNodes: AntNodeList<SensorNode> | null = null;
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._missilePointNodes = aCore.getNodes(MissilePointNode);
    this._missileNodes = aCore.getNodes(MissileNode);
    this._sensorNodes = aCore.getNodes(SensorNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._missilePointNodes = null;
    this._missileNodes = null;
    this._sensorNodes = null;
    this._core = null;
  }

  override update(): void {
    this.updateMissilePoints();
    this.updateMissiles();
  }

  private updateMissilePoints(): void {
    const missilePointNodes = this._missilePointNodes as AntNodeList<MissilePointNode>;
    let i = 0; // :* (an int in practice)
    while (i < missilePointNodes.numNodes) {
      const node = missilePointNodes.get(i++) as MissilePointNode;
      if (!node.missile.hasMissile) {
        node.missile.delay -= 2 * AntG.elapsed;
        if (node.missile.delay <= 0) {
          node.missile.spawn();
          this.callToSensor(node.missile.sensorAlias as string);
        }
      }
    }
  }

  private callToSensor(aAlias: string): void {
    const sensorNodes = this._sensorNodes as AntNodeList<SensorNode>;
    let i = 0; // :* (an int in practice)
    while (i < sensorNodes.numNodes) {
      const node = sensorNodes.get(i++) as SensorNode;
      if (node.info.alias == aAlias) {
        node.sensor.isActive = true;
      }
    }
  }

  private updateMissiles(): void {
    const missileNodes = this._missileNodes as AntNodeList<MissileNode>;
    let i = 0; // :* (an int in practice)
    const gravity = (G.physics.box2dWorld as NonNullable<typeof G.physics.box2dWorld>).GetGravity() as b2Vec2;
    while (i < missileNodes.numNodes) {
      const node = missileNodes.get(i++) as MissileNode;
      const velocity = (node.physic.body.box2dBody as NonNullable<typeof node.physic.body.box2dBody>).GetLinearVelocity() as b2Vec2;
      velocity.x -= gravity.x * G.physics.step;
      velocity.y -= gravity.y * G.physics.step;
      (node.physic.body.box2dBody as NonNullable<typeof node.physic.body.box2dBody>).SetLinearVelocity(velocity);
    }
  }
}
