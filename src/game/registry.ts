// Not a port of a single file: the replacement of flash.utils.getDefinitionByName for the game classes
// (docs/04-porting-guide.md section 3, "getDefinitionByName -> src/game/registry.ts").
//
// The survey of reference/as3/ru/alientransporter (grep getDefinitionByName / getQualifiedClassName):
//  - getDefinitionByName is not used in the game at all (only AntFamily and AntAnimation of the engine, both
//    replaced: AntFamily by `static components`, AntAnimation by the AssetRegistry);
//  - getQualifiedClassName is used once, in map/ObjectManager.createFrom(clip): it needs the class NAME of a
//    library clip, which ClipProxy.cls already provides (qualifiedName(), cast.ts), not a game class.
// The registry below maps the short class name (`static readonly className`) of the data, component, tag and node
// classes to the constructor, for code that has a name and needs the class (and for tests).

import type { Ctor } from '../engine/utils/types';
import { AIBehavior } from './components/AIBehavior';
import { ActionBehavior } from './components/ActionBehavior';
import { ArrowPoint } from './components/ArrowPoint';
import { CargoHold } from './components/CargoHold';
import { CoinPoint } from './components/CoinPoint';
import { Death } from './components/Death';
import { Display } from './components/Display';
import { DisplayUI } from './components/DisplayUI';
import { EffectInfo } from './components/EffectInfo';
import { ExpelObject } from './components/ExpelObject';
import { FlyingLabel } from './components/FlyingLabel';
import { FuelIndicator } from './components/FuelIndicator';
import { GoalManager } from './components/GoalManager';
import { Health } from './components/Health';
import { Info } from './components/Info';
import { KeyPoint } from './components/KeyPoint';
import { KeyboardControl } from './components/KeyboardControl';
import { Killer } from './components/Killer';
import { Magnet } from './components/Magnet';
import { Magnetable } from './components/Magnetable';
import { MissilePoint } from './components/MissilePoint';
import { ObjectRemover } from './components/ObjectRemover';
import { ObjectSpawner } from './components/ObjectSpawner';
import { PassengerMediator } from './components/PassengerMediator';
import { Physic } from './components/Physic';
import { PhysicModel } from './components/PhysicModel';
import { Portal } from './components/Portal';
import { Ragdoll } from './components/Ragdoll';
import { Sensor } from './components/Sensor';
import { ShuttleControl } from './components/ShuttleControl';
import { ShuttleSpawn } from './components/ShuttleSpawn';
import { ShuttleStats } from './components/ShuttleStats';
import { ShuttleUISync } from './components/ShuttleUISync';
import { SpawnManager } from './components/SpawnManager';
import { SpawnPoint } from './components/SpawnPoint';
import { StaticEffect } from './components/StaticEffect';
import { Station } from './components/Station';
import { Transporter } from './components/Transporter';
import { Trigger } from './components/Trigger';
import { Tutorial } from './components/Tutorial';
import { WaitingTimer } from './components/WaitingTimer';
import { GroundTag } from './tags/GroundTag';
import { MissileTag } from './tags/MissileTag';
import { PassengerTag } from './tags/PassengerTag';
import { ShuttleTag } from './tags/ShuttleTag';
import { ActionNode } from './nodes/ActionNode';
import { ArrowPointNode } from './nodes/ArrowPointNode';
import { BlinkerNode } from './nodes/BlinkerNode';
import { CoinPointNode } from './nodes/CoinPointNode';
import { ExpelObjectNode } from './nodes/ExpelObjectNode';
import { FlyingLabelNode } from './nodes/FlyingLabelNode';
import { GoalManagerNode } from './nodes/GoalManagerNode';
import { HealthNode } from './nodes/HealthNode';
import { KeyPointNode } from './nodes/KeyPointNode';
import { MagnetNode } from './nodes/MagnetNode';
import { MagnetableNode } from './nodes/MagnetableNode';
import { MissileNode } from './nodes/MissileNode';
import { MissilePointNode } from './nodes/MissilePointNode';
import { ObjectRemoveNode } from './nodes/ObjectRemoveNode';
import { ObjectSpawnNode } from './nodes/ObjectSpawnNode';
import { PassengerNode } from './nodes/PassengerNode';
import { PhysicRenderNode } from './nodes/PhysicRenderNode';
import { PlayerNode } from './nodes/PlayerNode';
import { PortalNode } from './nodes/PortalNode';
import { RagdollNode } from './nodes/RagdollNode';
import { SensorNode } from './nodes/SensorNode';
import { ShuttleNode } from './nodes/ShuttleNode';
import { ShuttleSpawnNode } from './nodes/ShuttleSpawnNode';
import { ShuttleUINode } from './nodes/ShuttleUINode';
import { SpawnManagerNode } from './nodes/SpawnManagerNode';
import { SpawnPointNode } from './nodes/SpawnPointNode';
import { StaticEffectNode } from './nodes/StaticEffectNode';
import { StationNode } from './nodes/StationNode';
import { TransporterNode } from './nodes/TransporterNode';
import { TriggerNode } from './nodes/TriggerNode';
import { VisualNode } from './nodes/VisualNode';
import { GameData } from './data/GameData';
import { LevelData } from './data/LevelData';
import { PlayerData } from './data/PlayerData';

const classes = new Map<string, Ctor>();

function register(...aClasses: Ctor[]): void {
  for (const c of aClasses) {
    classes.set((c as unknown as { className: string }).className, c);
  }
}

// components
register(
  AIBehavior,
  ActionBehavior,
  ArrowPoint,
  CargoHold,
  CoinPoint,
  Death,
  Display,
  DisplayUI,
  EffectInfo,
  ExpelObject,
  FlyingLabel,
  FuelIndicator,
  GoalManager,
  Health,
  Info,
  KeyPoint,
  KeyboardControl,
  Killer,
  Magnet,
  Magnetable,
  MissilePoint,
  ObjectRemover,
  ObjectSpawner,
  PassengerMediator,
  Physic,
  PhysicModel,
  Portal,
  Ragdoll,
  Sensor,
  ShuttleControl,
  ShuttleSpawn,
  ShuttleStats,
  ShuttleUISync,
  SpawnManager,
  SpawnPoint,
  StaticEffect,
  Station,
  Transporter,
  Trigger,
  Tutorial,
  WaitingTimer,
);

// tags
register(
  GroundTag,
  MissileTag,
  PassengerTag,
  ShuttleTag,
);

// nodes
register(
  ActionNode,
  ArrowPointNode,
  BlinkerNode,
  CoinPointNode,
  ExpelObjectNode,
  FlyingLabelNode,
  GoalManagerNode,
  HealthNode,
  KeyPointNode,
  MagnetNode,
  MagnetableNode,
  MissileNode,
  MissilePointNode,
  ObjectRemoveNode,
  ObjectSpawnNode,
  PassengerNode,
  PhysicRenderNode,
  PlayerNode,
  PortalNode,
  RagdollNode,
  SensorNode,
  ShuttleNode,
  ShuttleSpawnNode,
  ShuttleUINode,
  SpawnManagerNode,
  SpawnPointNode,
  StaticEffectNode,
  StationNode,
  TransporterNode,
  TriggerNode,
  VisualNode,
);

// data
register(
  GameData,
  LevelData,
  PlayerData,
);

/** AS3 `getDefinitionByName(name)`: throws for an unknown name, like the original (ReferenceError). */
export function getDefinitionByName(aName: string): Ctor {
  const found = classes.get(aName);
  if (found === undefined) {
    throw new ReferenceError('Error #1065: Variable ' + aName + ' is not defined.');
  }
  return found;
}

/** True when the name is registered. */
export function hasDefinition(aName: string): boolean {
  return classes.has(aName);
}

/** All registered names (registration order). */
export function getDefinitionNames(): string[] {
  return [...classes.keys()];
}
