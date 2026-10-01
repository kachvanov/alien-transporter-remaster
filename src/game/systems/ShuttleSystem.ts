// Port of ru/alientransporter/systems/ShuttleSystem.as
//
// DEVIATION: removeFromCore() of the original nulls `_shuttleNodes` and then calls `_shuttleNodes.eventNodeRemoved
// .remove(...)`, a null access that throws in AS3 (and aborts the rest of the method). Here the handler is removed
// first, so the call does not throw; the system is dropped after removeFromCore() anyway.

import type { b2Vec2 } from '../../physics/box2dweb';
import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import type { AntActor } from '../../engine/core/AntActor';
import type { AntCamera } from '../../engine/core/AntCamera';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import { Config } from '../Config';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { PassengerNode } from '../nodes/PassengerNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import type { ShuttleView } from '../views/ShuttleView';

export class ShuttleSystem extends AntSystem {
  static readonly className = 'ShuttleSystem';

  private _impulse: AntPoint | null = null;
  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _passangerNodes: AntNodeList<PassengerNode> | null = null;
  private _enginePoint: AntPoint;
  private _core: AntCore | null = null;

  constructor() {
    super();
    this._enginePoint = new AntPoint();
  }

  override addToCore(aCore: AntCore): void {
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._shuttleNodes.eventNodeRemoved.add(this.onShuttleNodeRemoved);
    this._passangerNodes = aCore.getNodes(PassengerNode);
    this._impulse = new AntPoint();
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    (this._shuttleNodes as AntNodeList<ShuttleNode>).eventNodeRemoved.remove(this.onShuttleNodeRemoved);
    this._shuttleNodes = null;
    this._passangerNodes = null;
    this._impulse = null;
    this._core = null;
  }

  override update(): void {
    const shuttleNodes = this._shuttleNodes as AntNodeList<ShuttleNode>;
    const impulse = this._impulse as AntPoint;
    let i = 0; // :int
    const gravity = (G.physics.box2dWorld as NonNullable<typeof G.physics.box2dWorld>).GetGravity() as b2Vec2;
    while (i < shuttleNodes.numNodes) {
      const node = shuttleNodes.get(i++) as ShuttleNode;
      this.updateEngines(node);
      if (node.stats.fuel > 0 && (node.model.hasRightEngine() || node.model.hasLeftEngine())) {
        let k = !node.model.hasRightEngine() || !node.model.hasLeftEngine() ? 0.65 : 1; // :Number
        if (node.control.isGas && node.physic.body.velocity.y > -6) {
          impulse.x = node.stats.engineForce * k * Math.cos(AntMath.toRadians(node.display.view.angle - 90));
          impulse.y = node.stats.engineForce * k * Math.sin(AntMath.toRadians(node.display.view.angle - 90));
          node.physic.body.applyImpulse(impulse.x, impulse.y);
          node.stats.engineGasTime = 0.25;
        }

        if (node.control.isLeft) {
          k = node.model.hasRightEngine() ? 1 : 0.5;
          node.physic.body.applyImpulse(node.stats.strafeForce * -1, 0);
          node.control.steering -= node.stats.steeringSpeed * k * AntG.elapsed;
          node.control.steering = node.control.steering < node.stats.steeringMax * -1 ? node.stats.steeringMax * -1 : node.control.steering;
        }

        if (node.control.isRight) {
          k = node.model.hasLeftEngine() ? 1 : 0.5;
          node.physic.body.applyImpulse(node.stats.strafeForce, 0);
          node.control.steering += node.stats.steeringSpeed * k * AntG.elapsed;
          node.control.steering = node.control.steering > node.stats.steeringMax ? node.stats.steeringMax : node.control.steering;
        }

        if (!node.control.isLeft && !node.control.isRight) {
          node.control.steering *= node.stats.steeringFadeCoef;
        }

        if (!AntMath.equal(node.physic.body.velocity.x, 0, 0.2)) {
          if (node.physic.body.velocity.x < 0) {
            node.physic.body.applyImpulse(node.stats.airResist, 0);
          } else {
            node.physic.body.applyImpulse(node.stats.airResist * -1, 0);
          }
        }

        if (!AntMath.equal(node.control.steering, node.physic.body.angle, 1)) {
          node.physic.body.applyTorque(node.control.steering - node.physic.body.angle);
          node.physic.body.applyAngularVelocity(0);
        }

        const velocity = (node.physic.body.box2dBody as NonNullable<typeof node.physic.body.box2dBody>).GetLinearVelocity() as b2Vec2;
        velocity.x -= gravity.x * G.physics.step * node.stats.gravityResist;
        velocity.y -= gravity.y * G.physics.step * node.stats.gravityResist;
        (node.physic.body.box2dBody as NonNullable<typeof node.physic.body.box2dBody>).SetLinearVelocity(velocity);
      }

      if (node.model.hasHit) {
        node.stats.hull -= 0.21;
        if (node.stats.hull <= 0) {
          this.makeDeadBody(node);
          (this._core as AntCore).removeObject(node.object as NonNullable<ShuttleNode['object']>);
        } else {
          (node.display.view as ShuttleView).hit();
        }

        node.model.hasHit = false;
      }

      if ((!node.model.hasLeftEngine() && !node.model.hasRightEngine()) || node.stats.fuel <= 0) {
        node.model.selfdestructionDelay -= 2 * AntG.elapsed;
        if (node.model.selfdestructionDelay <= 0) {
          node.stats.hull = 0;
          this.makeDeadBody(node);
          (this._core as AntCore).removeObject(node.object as NonNullable<ShuttleNode['object']>);
        }
      }
    }
  }

  private makeDeadBody(aNode: ShuttleNode): void {
    AntEffectManager.makeEffect(aNode.display.view.x, aNode.display.view.y, 'Explosion_eff', G.gameState.layerFrontEffects);
    Factory.makeShuttleRagdoll(
      aNode.display.view.x,
      aNode.display.view.y,
      aNode.display.view.scaleX,
      new AntPoint(),
      new AntPoint(),
      aNode.stats.playerName,
    ); // the original also reads `.get(Ragdoll)` of the result into an unused local
    if (aNode.cargoHold.numCargo > 0) {
      Factory.makePassengerRagdoll(
        aNode.display.view.x,
        aNode.display.view.y,
        1,
        new AntPoint(),
        new AntPoint(),
        (aNode.display.shuttle as ShuttleView).passengerKind,
        (aNode.display.shuttle as ShuttleView).passengerColor as string,
      );
    }

    let coins = AntMath.fromPercent(20, aNode.stats.coins) | 0; // :int
    coins = AntMath.floor(coins / 5) | 0;
    aNode.stats.takeCoins(coins * 5);
    while (coins > 0) {
      Factory.makeCoin(
        aNode.display.view.x + AntMath.randomRangeInt(-5, 5),
        aNode.display.view.y + AntMath.randomRangeInt(-5, 5),
      );
      coins--;
    }

    AntG.sounds.play('SndShuttleExplosion01', aNode.display.view);
    (AntG.getCamera() as AntCamera).shake(5, 4);
  }

  private updateEngines(aNode: ShuttleNode): void {
    aNode.model.update();
    if (aNode.stats.engineGasTime > 0) {
      if (aNode.model.hasLeftEngine()) {
        aNode.model.getLeftEnginePosition(this._enginePoint);
        if (Config.debugSettings.showSmokeParticles) {
          G.gameState.smokeSimulation.pour2(
            this._enginePoint.x + AntMath.randomRangeInt(-3, 3),
            this._enginePoint.y + AntMath.randomRangeInt(-3, 3),
            aNode.display.view.angle + 90,
            3,
          );
        }

        if (Config.debugSettings.showFireParticles) {
          G.gameState.fireSimulation.pour(
            this._enginePoint.x + AntMath.randomRangeInt(-2, 2), // STUB(T2.2)
            this._enginePoint.y + AntMath.randomRangeInt(-2, 2),
            aNode.display.view.angle + 90,
            3,
          );
        }
      }

      if (aNode.model.hasRightEngine()) {
        aNode.model.getRightEnginePosition(this._enginePoint);
        if (Config.debugSettings.showSmokeParticles) {
          G.gameState.smokeSimulation.pour2(
            this._enginePoint.x + AntMath.randomRangeInt(-3, 3),
            this._enginePoint.y + AntMath.randomRangeInt(-3, 3),
            aNode.display.view.angle + 90,
            3,
          );
        }

        if (Config.debugSettings.showFireParticles) {
          G.gameState.fireSimulation.pour(
            this._enginePoint.x + AntMath.randomRangeInt(-2, 2),
            this._enginePoint.y + AntMath.randomRangeInt(-2, 2),
            aNode.display.view.angle + 90,
            3,
          );
        }
      }

      aNode.stats.fuel -= aNode.stats.fuelRate * AntG.elapsed;
      aNode.model.activateEffects(true);
      this.playEngineSound(aNode.display.view);
    } else {
      aNode.model.activateEffects(false);
      this.stopEngineSound(aNode.display.view);
    }

    aNode.stats.engineGasTime -= 2 * AntG.elapsed;
  }

  private onShuttleNodeRemoved = (aNode: ShuttleNode): void => {
    this.stopEngineSound(aNode.display.view);
  };

  private playEngineSound(aSource: AntActor): void {
    if (!AntG.sounds.isPlaying('EngineGas_snd', aSource)) {
      // AS3 `play("EngineGas_snd", aSource, 999)`: 999 is the Boolean parameter aLoop (converted to true), aLoops stays 1.
      AntG.sounds.play('EngineGas_snd', aSource, Boolean(999));
    }
  }

  private stopEngineSound(aSource: AntActor): void {
    if (AntG.sounds.isPlaying('EngineGas_snd', aSource)) {
      AntG.sounds.stop('EngineGas_snd', aSource);
    }
  }
}
