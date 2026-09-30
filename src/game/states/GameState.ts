// STUB(T1.9e): stand-in for ru/alientransporter/states/GameState.as.
// T1.9e ports the real state (layers, systems, create()) and replaces this file. The layer fields have the
// names of the original; here they are plain groups created in the constructor so that G.gameState.layerX
// is usable in tests.

import { AntEntity } from '../../engine/core/AntEntity';
import { AntState } from '../../engine/core/AntState';

/** STUB(T2.2): stand-in for ru/alientransporter/elements/ElementSimulation.as. */
export class StubElementSimulation {
  /** AS3 `pour(aX:Number, aY:Number, aVelocityX:Number, aVelocityY:Number)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pour(_aX: number, _aY: number, _aVelocityX: number, _aVelocityY: number): void {}

  clear(): void {}
}

/** STUB(T2.4): stand-in for ru/antkarlov/anthill/extensions/livinglights/AntLightEnvironment.as. */
export class StubLightEnvironment {
  /** AS3 `add(aChild:AntEntity):AntEntity`. */
  add(aChild: AntEntity): AntEntity {
    return aChild;
  }
}

export class GameState extends AntState {
  cameraAnchor: AntEntity = new AntEntity();
  layerBack: AntEntity = new AntEntity();
  layerBackEffects: AntEntity = new AntEntity();
  layerBG: AntEntity = new AntEntity();
  layerBGPassengers: AntEntity = new AntEntity();
  layerHouses: AntEntity = new AntEntity();
  layerIndicators: AntEntity = new AntEntity();
  layerMain: AntEntity = new AntEntity();
  layerPhysic: AntEntity = new AntEntity();
  layerFGPassengers: AntEntity = new AntEntity();
  layerFragments: AntEntity = new AntEntity();
  layerEngineEffects: AntEntity = new AntEntity();
  layerShuttles: AntEntity = new AntEntity();
  layerBonuses: AntEntity = new AntEntity();
  layerMainEffects: AntEntity = new AntEntity();
  layerFG: AntEntity = new AntEntity();
  layerRocks: AntEntity = new AntEntity();
  layerFrontEffects: AntEntity = new AntEntity();
  layerInterface: AntEntity = new AntEntity();
  layerPopups: AntEntity = new AntEntity();
  layerMenuBG: AntEntity = new AntEntity();
  layerMenu: AntEntity = new AntEntity();
  layerMenuFG: AntEntity = new AntEntity();

  // STUB(T2.2, T2.4): the element simulations and the light environment; only what map/Factory.ts and
  // map/LevelCore.ts call (pour, clear, add) with the signatures of the original; they do nothing.
  oilSimulation: StubElementSimulation = new StubElementSimulation();
  smokeSimulation: StubElementSimulation = new StubElementSimulation();
  fireSimulation: StubElementSimulation = new StubElementSimulation();
  lightEnvironment: StubLightEnvironment = new StubLightEnvironment();

  /** AS3 `setFancyQuality(aValue:Boolean)`: the value is only remembered. */
  fancyQuality = true;

  setFancyQuality(aValue: boolean): void {
    this.fancyQuality = aValue;
  }
}
