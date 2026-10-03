// Port of ru/alientransporter/systems/SensorSystem.as
//
// STUB(T2.4): the touch of the ray of the light with the shuttle comes from AntLight (the pixels of the shuttle). Until
// T2.4 the end of every node of update() runs the temporary geometric test of the view (SensorView.stubUpdateLight,
// "the shuttle is inside the sector"). It is at the end of the node on purpose: AntLight.bake() works at the draw of
// the frame, after the systems, so the system sees the touch of the previous frame. T2.4 deletes the test, the
// ShuttleNode list and the method below.

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntObject } from '../../engine/ants/AntObject';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { ActionNode } from '../nodes/ActionNode';
import { BlinkerNode } from '../nodes/BlinkerNode';
import { SensorNode } from '../nodes/SensorNode';
import { ShuttleNode } from '../nodes/ShuttleNode'; // STUB(T2.4)
import { TriggerNode } from '../nodes/TriggerNode';

export class SensorSystem extends AntSystem {
  static readonly className = 'SensorSystem';

  private _sensorNodes: AntNodeList<SensorNode> | null = null;
  private _triggerNodes: AntNodeList<TriggerNode> | null = null;
  private _actionNodes: AntNodeList<ActionNode> | null = null;
  private _blinkerNodes: AntNodeList<BlinkerNode> | null = null;
  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null; // STUB(T2.4)
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._sensorNodes = aCore.getNodes(SensorNode);
    this._triggerNodes = aCore.getNodes(TriggerNode);
    this._actionNodes = aCore.getNodes(ActionNode);
    this._blinkerNodes = aCore.getNodes(BlinkerNode);
    this._shuttleNodes = aCore.getNodes(ShuttleNode); // STUB(T2.4)
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._sensorNodes = null;
    this._triggerNodes = null;
    this._actionNodes = null;
    this._blinkerNodes = null;
    this._shuttleNodes = null; // STUB(T2.4)
    this._core = null;
  }

  override update(): void {
    const sensorNodes = this._sensorNodes as AntNodeList<SensorNode>;
    let i = 0; // :* (an int in practice)
    while (i < sensorNodes.numNodes) {
      const node = sensorNodes.get(i++) as SensorNode;
      if (node.sensor.isActive) {
        if (node.sensor.rotate) {
          if (node.sensor.currentDelay <= 0) {
            node.view.angle += node.sensor.rotationSpeed * node.sensor.dir * AntG.elapsed;
            if (node.view.angle > node.sensor.upperRotation) {
              node.view.angle = node.sensor.upperRotation;
              node.sensor.currentDelay = node.sensor.rotationDelay;
              node.sensor.dir *= -1;
            } else if (node.view.angle < node.sensor.lowerRotation) {
              node.view.angle = node.sensor.lowerRotation;
              node.sensor.currentDelay = node.sensor.rotationDelay;
              node.sensor.dir *= -1;
            }
          } else {
            node.sensor.currentDelay -= 2 * AntG.elapsed;
          }
        }

        node.view.isActive = node.sensor.isActive;
        this.updateBlinker(node);
        if (node.view.isPressed()) {
          this.callAction(node);
          AntG.sounds.play('SndSensorAlarm');
          if (node.sensor.once) {
            node.sensor.isActive = false;
            node.sensor.isActivated = true;
            node.view.hide(node.object as AntObject);
          }
        }
      } else {
        node.view.isActive = node.sensor.isActive;
        this.updateBlinker(node);
      }

      node.view.update();
      this.stubUpdateLight(node); // STUB(T2.4)
    }
  }

  /** STUB(T2.4): the geometric test of the touch of the light of the sensor with the shuttles. */
  private stubUpdateLight(aNode: SensorNode): void {
    const shuttleNodes = this._shuttleNodes as AntNodeList<ShuttleNode>;
    const shuttles: { x: number; y: number }[] = [];
    let i = 0;
    while (i < shuttleNodes.numNodes) {
      const shuttle = shuttleNodes.get(i++) as ShuttleNode;
      shuttles.push({ x: shuttle.display.view.x, y: shuttle.display.view.y });
    }

    aNode.view.stubUpdateLight(shuttles);
  }

  private updateBlinker(aNode: SensorNode): void {
    if (aNode.sensor.blinkerAlias != null && aNode.sensor.blinkerAlias != '') {
      const blinkerNodes = this._blinkerNodes as AntNodeList<BlinkerNode>;
      let i = 0; // :* (an int in practice)
      while (i < blinkerNodes.numNodes) {
        const blinker = blinkerNodes.get(i++) as BlinkerNode;
        if (blinker.info.alias == aNode.sensor.blinkerAlias) {
          if (aNode.sensor.isActive) {
            if (aNode.view.isPressed()) {
              blinker.view.switchAnimation('red');
            } else if (aNode.view.isReleased()) {
              blinker.view.switchAnimation('green');
            } else if (!aNode.view.isDown()) {
              blinker.view.switchAnimation('green');
            }
          } else if (!aNode.sensor.isActive && !aNode.sensor.isActivated) {
            blinker.view.switchAnimation('off');
          }
        }
      }
    }
  }

  private callAction(aNode: SensorNode): void {
    let i: number; // :* (an int in practice)
    let n: number; // :int
    if (aNode.sensor.targetAliases != null) {
      i = 0;
      n = aNode.sensor.targetAliases.length | 0;
      while (i < n) {
        this.callObject(aNode.sensor.targetAliases[i++] as string, aNode.info.alias as string);
      }
    }

    if (aNode.sensor.triggerAliases != null) {
      i = 0;
      n = aNode.sensor.triggerAliases.length | 0;
      while (i < n) {
        this.callTrigger(aNode.sensor.triggerAliases[i++] as string, aNode.info.alias as string);
      }
    }
  }

  private callObject(aTargetAlias: string, aSourceAlias: string): void {
    const actionNodes = this._actionNodes as AntNodeList<ActionNode>;
    let i = 0; // :* (an int in practice)
    while (i < actionNodes.numNodes) {
      const actionNode = actionNodes.get(i++) as ActionNode;
      if (actionNode.info.alias == aTargetAlias && actionNode.info.alias != aSourceAlias) {
        actionNode.action.call(aTargetAlias);
      }
    }
  }

  private callTrigger(aTargetAlias: string, aSourceAlias: string): void {
    const triggerNodes = this._triggerNodes as AntNodeList<TriggerNode>;
    let i = 0; // :* (an int in practice)
    while (i < triggerNodes.numNodes) {
      const triggerNode = triggerNodes.get(i++) as TriggerNode;
      if (triggerNode.info.alias == aTargetAlias && triggerNode.info.alias != aSourceAlias) {
        triggerNode.trigger.isActive = !triggerNode.trigger.isActive;
      }
    }
  }
}
