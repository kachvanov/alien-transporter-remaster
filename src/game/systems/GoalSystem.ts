// Port of ru/alientransporter/systems/GoalSystem.as

import type { AntCore } from '../../engine/ants/AntCore';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import { AntSystem } from '../../engine/ants/AntSystem';
import { AntG } from '../../engine/core/AntG';
import { G } from '../G';
import { ActionNode } from '../nodes/ActionNode';
import { GoalManagerNode } from '../nodes/GoalManagerNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { TriggerNode } from '../nodes/TriggerNode';
import { PassengerBarUIView } from '../ui/PassengerBarUIView'; // STUB(T1.9e)

export class GoalSystem extends AntSystem {
  static readonly className = 'GoalSystem';

  private _goalManagerNodes: AntNodeList<GoalManagerNode> | null = null;
  private _actionNodes: AntNodeList<ActionNode> | null = null;
  private _triggerNodes: AntNodeList<TriggerNode> | null = null;
  private _shuttleNodes: AntNodeList<ShuttleNode> | null = null;
  private _passengerBar: PassengerBarUIView | null = null;
  private _core: AntCore | null = null;

  constructor() {
    super();
  }

  override addToCore(aCore: AntCore): void {
    this._goalManagerNodes = aCore.getNodes(GoalManagerNode);
    this._goalManagerNodes.eventNodeAdded.add(this.onGoalManagerNodeAdded);
    this._goalManagerNodes.eventNodeRemoved.add(this.onGoalManagerNodeRemoved);
    this._shuttleNodes = aCore.getNodes(ShuttleNode);
    this._shuttleNodes.eventNodeAdded.add(this.onShuttleNodeAdded);
    this._actionNodes = aCore.getNodes(ActionNode);
    this._triggerNodes = aCore.getNodes(TriggerNode);
    this._core = aCore;
  }

  override removeFromCore(_aCore: AntCore): void {
    void _aCore;
    const goalManagerNodes = this._goalManagerNodes as AntNodeList<GoalManagerNode>;
    goalManagerNodes.eventNodeAdded.remove(this.onGoalManagerNodeAdded);
    goalManagerNodes.eventNodeRemoved.remove(this.onGoalManagerNodeRemoved);
    this._goalManagerNodes = null;
    (this._shuttleNodes as AntNodeList<ShuttleNode>).eventNodeAdded.remove(this.onShuttleNodeAdded);
    this._shuttleNodes = null;
    this._actionNodes = null;
    this._triggerNodes = null;
    this._core = null;
  }

  track(aKind: string, aValue = 1): void {
    const goalManagerNodes = this._goalManagerNodes as AntNodeList<GoalManagerNode>;
    let i = 0; // :* (an int in practice)
    while (i < goalManagerNodes.numNodes) {
      const goalManagerNode = goalManagerNodes.get(i++) as GoalManagerNode;
      if (goalManagerNode.goal.track(aKind, aValue)) {
        if (goalManagerNode.goal.isCompleted() && !goalManagerNode.goal.isActivated) {
          this.callAction(goalManagerNode);
          goalManagerNode.goal.isActivated = true;
        }

        (this._passengerBar as PassengerBarUIView).value = goalManagerNode.goal.value;
      }
    }
  }

  private callAction(aNode: GoalManagerNode): void {
    let i: number; // :* (an int in practice)
    let n: number; // :int
    if (aNode.goal.targetAliases != null) {
      i = 0;
      n = aNode.goal.targetAliases.length | 0;
      while (i < n) {
        this.callObject(aNode.goal.targetAliases[i++] as string, aNode.info.alias as string);
      }
    }

    if (aNode.goal.triggerAliases != null) {
      i = 0;
      n = aNode.goal.triggerAliases.length | 0;
      while (i < n) {
        this.callTrigger(aNode.goal.triggerAliases[i++] as string, aNode.info.alias as string);
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

  private onGoalManagerNodeAdded = (aNode: GoalManagerNode): void => {
    aNode.goal.goalValue =
      aNode.goal.goalDef * ((this._shuttleNodes as AntNodeList<ShuttleNode>).numNodes == 0 ? 1 : (this._shuttleNodes as AntNodeList<ShuttleNode>).numNodes);
    if (this._passengerBar == null) {
      this._passengerBar = G.gameState.layerInterface.recycle(PassengerBarUIView) as PassengerBarUIView;
      this._passengerBar.x = AntG.widthHalf;
      this._passengerBar.y = 38;
      this._passengerBar.maxValue = aNode.goal.goalValue;
      this._passengerBar.value = 0;
      this._passengerBar.revive();
      this._passengerBar.show();
    }
  };

  private onGoalManagerNodeRemoved = (_aNode: GoalManagerNode): void => {
    void _aNode;
    if ((this._goalManagerNodes as AntNodeList<GoalManagerNode>).numNodes == 0 && this._passengerBar != null) {
      const passengerBar = this._passengerBar;
      passengerBar.hide(() => passengerBar.kill()); // AS3: hide(_passengerBar.kill), a bound method
      this._passengerBar = null;
    }
  };

  private onShuttleNodeAdded = (_aNode: ShuttleNode): void => {
    void _aNode;
    const goalManagerNodes = this._goalManagerNodes as AntNodeList<GoalManagerNode>;
    let i = 0; // :* (an int in practice)
    while (i < goalManagerNodes.numNodes) {
      const goalManagerNode = goalManagerNodes.get(i++) as GoalManagerNode;
      if (G.gameData.isTwoPlayerMode) {
        goalManagerNode.goal.goalValue = goalManagerNode.goal.goalDef * 2;
      }

      if (this._passengerBar != null) {
        this._passengerBar.maxValue = goalManagerNode.goal.goalValue;
        this._passengerBar.value = goalManagerNode.goal.value;
      }
    }
  };
}
