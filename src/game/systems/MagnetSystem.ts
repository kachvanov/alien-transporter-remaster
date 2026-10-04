// Port of ru/alientransporter/systems/MagnetSystem.as

import type { b2Vec2 } from '../../physics/box2dweb';
import type { AntCore } from '../../engine/ants/AntCore';
import type { AntObject } from '../../engine/ants/AntObject';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntMath } from '../../engine/utils/AntMath';
import { FlyingLabel } from '../components/FlyingLabel';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { FlyingLabelNode } from '../nodes/FlyingLabelNode';
import { MagnetNode } from '../nodes/MagnetNode';
import { MagnetableNode } from '../nodes/MagnetableNode';
import { Text } from '../texts/Text';

export class MagnetSystem extends AntSystem {
  static readonly className = 'MagnetSystem';

  private _magnetableNodes: AntNodeList<MagnetableNode> | null = null;
  private _magnetNodes: AntNodeList<MagnetNode> | null = null;
  private _flyingLabelNodes: AntNodeList<FlyingLabelNode> | null = null;
  private _core: AntCore | null = null;
  // (the original also declares `_label:Label` and `_labelTween:AntTween`; nothing uses them)

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._magnetableNodes = aCore.getNodes(MagnetableNode);
    this._magnetNodes = aCore.getNodes(MagnetNode);
    this._flyingLabelNodes = aCore.getNodes(FlyingLabelNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._magnetNodes = null;
    this._magnetableNodes = null;
    this._flyingLabelNodes = null;
    this._core = null;
  }

  override update(): void {
    this.updateAntiGravity();
    this.updateMagnets();
    this.updateFlyingLabels();
  }

  private updateAntiGravity(): void {
    const magnetableNodes = this._magnetableNodes as AntNodeList<MagnetableNode>;
    let i = 0; // :* (an int in practice)
    while (i < magnetableNodes.numNodes) {
      const node = magnetableNodes.get(i++) as MagnetableNode;
      const gravity = (G.physics.box2dWorld as NonNullable<typeof G.physics.box2dWorld>).GetGravity() as b2Vec2;
      const body = node.physic.body.box2dBody as NonNullable<typeof node.physic.body.box2dBody>;
      const velocity = body.GetLinearVelocity() as b2Vec2;
      velocity.x *= 0.95;
      velocity.y *= 0.95;
      velocity.x -= gravity.x * G.physics.step;
      velocity.y -= gravity.y * G.physics.step;
      body.SetLinearVelocity(velocity);
    }
  }

  private updateMagnets(): void {
    const magnetNodes = this._magnetNodes as AntNodeList<MagnetNode>;
    let i = 0; // :* (an int in practice)
    while (i < magnetNodes.numNodes) {
      this.magnetTo(magnetNodes.get(i++) as MagnetNode);
    }
  }

  private updateFlyingLabels(): void {
    const flyingLabelNodes = this._flyingLabelNodes as AntNodeList<FlyingLabelNode>;
    let i = 0; // :* (an int in practice)
    while (i < flyingLabelNodes.numNodes) {
      const node = flyingLabelNodes.get(i++) as FlyingLabelNode;
      node.flyingLabel.update();
      if (node.flyingLabel.isTimeOut && !node.flyingLabel.isHidden) {
        node.flyingLabel.hide();
      }

      if (node.flyingLabel.isDead) {
        (this._core as AntCore).removeObject(node.object as AntObject);
      }
    }
  }

  private magnetTo(aMagnet: MagnetNode): void {
    const magnetableNodes = this._magnetableNodes as AntNodeList<MagnetableNode>;
    let i = 0; // :* (an int in practice)
    while (i < magnetableNodes.numNodes) {
      const magnetable = magnetableNodes.get(i++) as MagnetableNode;
      const distance = AntMath.distance(
        magnetable.display.view.x,
        magnetable.display.view.y,
        aMagnet.display.view.x,
        aMagnet.display.view.y,
      );
      if (distance <= aMagnet.magnet.magnetRadius) {
        const angle = AntMath.angle(
          magnetable.display.view.x,
          magnetable.display.view.y,
          aMagnet.display.view.x,
          aMagnet.display.view.y,
        );
        magnetable.physic.body.applyImpulse(0.1 * Math.cos(angle), 0.1 * Math.sin(angle));
      }

      if (distance <= aMagnet.magnet.hitRadius) {
        this.collect(aMagnet, magnetable);
        (this._core as AntCore).removeObject(magnetable.object as AntObject);
      }
    }
  }

  private collect(aMagnet: MagnetNode, aMagnetable: MagnetableNode): void {
    let value: number; // (AS3: = 0, never read before the switch assigns it)
    AntG.sounds.play(aMagnetable.effectInfo.sound, aMagnet.display.view);
    AntEffectManager.makeEffect(
      aMagnetable.display.view.x,
      aMagnetable.display.view.y,
      aMagnetable.effectInfo.effect,
      G.gameState.layerMainEffects,
    );
    switch (aMagnetable.info.id) {
      case 'Coin':
        value = 5;
        aMagnet.stats.giveCoins(value);
        this.makeCoinLabel(aMagnet, aMagnetable.display.view.x, aMagnetable.display.view.y, value);
        break;
      case 'Repair':
        this.makeStringLabel(
          aMagnet,
          aMagnetable.display.view.x,
          aMagnetable.display.view.y,
          Text.extract('Repair_txt'),
          FlyingLabel.BLUE,
        );
        aMagnet.stats.giveExtraRepair();
        G.missions.track('numRepair');
        break;
      case 'Fuel': {
        this.makeStringLabel(
          aMagnet,
          aMagnetable.display.view.x,
          aMagnetable.display.view.y,
          Text.extract('Fuel_txt'),
          FlyingLabel.PURPLE,
        );
        aMagnet.stats.giveExtraFuel();
        const tasks = new AntTaskManager();
        const oil = G.gameState.oilSimulation;
        let i = 0; // :int
        while (i < 8) {
          tasks.addInstantTask(oil.pour.bind(oil), [
            aMagnetable.display.view.x + AntMath.randomRangeInt(-5, 5),
            aMagnetable.display.view.y + AntMath.randomRangeInt(-5, 5),
            0,
            0,
          ]);
          i++;
        }

        G.missions.track('numFuel');
        break;
      }
      case 'Heart':
        this.makeStringLabel(
          aMagnet,
          aMagnetable.display.view.x,
          aMagnetable.display.view.y,
          Text.extract('Life_txt'),
          FlyingLabel.PINK,
        );
        aMagnet.stats.giveExtraLife();
        G.missions.track('numHeart');
        break;
      case 'Trophy':
        value = 30;
        aMagnet.stats.giveCoins(value);
        this.makeCoinLabel(aMagnet, aMagnetable.display.view.x, aMagnetable.display.view.y, value);
        G.missions.track('numTrophy');
    }
  }

  private makeCoinLabel(aMagnet: MagnetNode, aX: number, aY: number, aValue: number): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    aValue = aValue | 0; // :int
    const flyingLabelNodes = this._flyingLabelNodes as AntNodeList<FlyingLabelNode>;
    let i = 0; // :* (an int in practice)
    while (i < flyingLabelNodes.numNodes) {
      const node = flyingLabelNodes.get(i++) as FlyingLabelNode;
      if (
        AntMath.distance(aMagnet.display.view.x, aMagnet.display.view.y, node.flyingLabel.x, node.flyingLabel.y) < 30 &&
        (node.flyingLabel.labelColor == FlyingLabel.GREEN || node.flyingLabel.labelColor == FlyingLabel.RED)
      ) {
        node.flyingLabel.text = null as unknown as string; // AS3: text = null
        node.flyingLabel.updateValue(aX, aY, aValue);
        return;
      }
    }

    Factory.makeFlyingLabel(aX, aY, aValue);
  }

  private makeStringLabel(aMagnet: MagnetNode, aX: number, aY: number, aText: string, aColor: string): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const flyingLabelNodes = this._flyingLabelNodes as AntNodeList<FlyingLabelNode>;
    let i = 0; // :* (an int in practice)
    while (i < flyingLabelNodes.numNodes) {
      const node = flyingLabelNodes.get(i++) as FlyingLabelNode;
      if (
        AntMath.distance(aMagnet.display.view.x, aMagnet.display.view.y, node.flyingLabel.x, node.flyingLabel.y) < 30 &&
        node.flyingLabel.labelColor == aColor
      ) {
        node.flyingLabel.labelColor = aColor;
        node.flyingLabel.text = aText;
        node.flyingLabel.updateValue(aX, aY, 0);
        return;
      }
    }

    Factory.makeFlyingLabel(aX, aY, 0, aText, aColor);
  }
}
