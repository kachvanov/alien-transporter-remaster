// Port of ru/alientransporter/systems/TriggerSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { ActionNode } from '../nodes/ActionNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { TriggerNode } from '../nodes/TriggerNode';

export class TriggerSystem extends AntSystem {
  static readonly className = 'TriggerSystem';

  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _triggerNodes: AntNodeList<TriggerNode> | null = null;
  private _actionNodes: AntNodeList<ActionNode> | null = null;

  constructor() {
    super();
    AntG.registerCommandWithArgs('call', this.onCall, [String]);
  }

  private onCall = (aAlias: string): void => {
    const actionNodes = this._actionNodes as AntNodeList<ActionNode>;
    let i = 0; // :* (an int in practice)
    while (i < actionNodes.numNodes) {
      const actionNode = actionNodes.get(i++) as ActionNode;
      if (actionNode.info.alias == aAlias) {
        actionNode.action.call('console');
      }
    }
  };

  override addToCore(aCore: AntCore): void {
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._triggerNodes = aCore.getNodes(TriggerNode);
    this._actionNodes = aCore.getNodes(ActionNode);
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    this._actionNodes = null;
    this._triggerNodes = null;
    this._shuttleNodes = null;
  }

  override update(): void {
    const triggerNodes = this._triggerNodes as AntNodeList<TriggerNode>;
    let i = 0; // :* (an int in practice)
    while (i < triggerNodes.numNodes) {
      const triggerNode = triggerNodes.get(i++) as TriggerNode;
      if (triggerNode.trigger.isActive && this.isShuttleInside(triggerNode)) {
        this.callAction(triggerNode);
        if (triggerNode.trigger.once) {
          triggerNode.trigger.isActive = false;
        }
      }
    }
  }

  private isShuttleInside(aNode: TriggerNode): boolean {
    const shuttleNodes = this._shuttleNodes as AntNodeList<ShuttleNode>;
    let i = 0; // :* (an int in practice)
    while (i < shuttleNodes.numNodes) {
      const shuttleNode = shuttleNodes.get(i++) as ShuttleNode;
      if (aNode.trigger.isInside(shuttleNode.display.view.x, shuttleNode.display.view.y)) {
        if (aNode.trigger.addShuttle(shuttleNode)) {
          return true;
        }
      } else {
        aNode.trigger.removeChuttle(shuttleNode);
      }
    }

    return false;
  }

  private callAction(aNode: TriggerNode): void {
    let i: number; // :* (an int in practice)
    let n: number; // :int
    if (aNode.trigger.targetAliases != null) {
      i = 0;
      n = aNode.trigger.targetAliases.length | 0;
      while (i < n) {
        this.callObject(aNode.trigger.targetAliases[i++] as string, aNode.info.alias as string);
      }
    }

    if (aNode.trigger.triggerAliases != null) {
      i = 0;
      n = aNode.trigger.triggerAliases.length | 0;
      while (i < n) {
        this.callTrigger(aNode.trigger.triggerAliases[i++] as string, aNode.info.alias as string);
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
