// Port of ru/alientransporter/systems/HealthSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntMath } from '../../engine/utils/AntMath';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import { G } from '../G';
import { MissileModel } from '../models/MissileModel';
import { HealthNode } from '../nodes/HealthNode';

export class HealthSystem extends AntSystem {
  static readonly className = 'HealthSystem';

  private _healthNodes: AntNodeList<HealthNode> | null = null;
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._healthNodes = aCore.getNodes(HealthNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._healthNodes = null;
    this._core = null;
  }

  override update(): void {
    const healthNodes = this._healthNodes as AntNodeList<HealthNode>;
    let i = 0; // :int
    while (i < healthNodes.numNodes) {
      const node = healthNodes.get(i++) as HealthNode;
      if (node.model.hasHit) {
        node.model.hasHit = false;
        node.health.value -= 0.15;
      }

      const body = node.model.physic.body as AntBox2DBody;
      if (node.health.value <= node.health.half && body.kind != 'dynamic') {
        body.kind = 'dynamic';
        AntEffectManager.makeEffect(node.display.view.x, node.display.view.y, 'RockFall_eff', G.gameState.layerFrontEffects);
      }

      if (node.health.value < 0) {
        node.death.create(node.display.view.x, node.display.view.y, node.display.view.angle, body.velocity);
        const missile = (node.object as NonNullable<HealthNode['object']>).get(MissileModel) as MissileModel | null;
        if (missile != null) {
          (missile.callback as (...aArgs: unknown[]) => void).apply(missile);
        }

        (this._core as AntCore).removeObject(node.object as NonNullable<HealthNode['object']>);
      }
    }
  }

  applyExplosionDamage(aX: number, aY: number, aRadius: number, aDamage: number): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const healthNodes = this._healthNodes as AntNodeList<HealthNode>;
    let i = 0; // :int
    while (i < healthNodes.numNodes) {
      const node = healthNodes.get(i++) as HealthNode;
      if (AntMath.distance(aX, aY, node.display.view.x, node.display.view.y) < aRadius) {
        node.health.value -= aDamage;
      }
    }
  }
}
