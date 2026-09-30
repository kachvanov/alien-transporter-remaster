// Port of ru/alientransporter/Models.as
//
// DEVIATION (docs/04-porting-guide.md section 4): the original registers library classes
// (`addModelFromClip(Shuttle01Model_mc)`); here the clips are entries of assets/data/models.json, found by
// name (AntModelManager.addModelFromClip(name)). The source is given to the constructor or, by default,
// taken from the current AssetRegistry (its models must be loaded). Without a registry (unit tests
// without assets) the source is empty and no model is registered.
//
// DEVIATION: a clip that models.json does not have is skipped instead of failing. models.json currently
// lacks the 20 PassengerXxxRagdoll0N_mc clips (the extraction pipeline, T0.7, filters them out), so no
// passenger ragdoll model gets registered until that is fixed; `missing` lists the skipped names.

import { AssetRegistry } from '../engine/assets/AssetRegistry';
import { AntBox2DPrismaticJoint } from '../physics/anthill/joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../physics/anthill/joints/AntBox2DRevoluteJoint';
import { AntModelManager } from '../physics/anthill/models/AntModelManager';
import type { ModelClipJson } from '../physics/anthill/models/AntModelManager';
import { AntBox2DBoxShape } from '../physics/anthill/shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../physics/anthill/shapes/AntBox2DCircleShape';

/** The clips registered by the constructor of the original, in the same order. */
export const MODEL_CLIPS: readonly string[] = [
  'Shuttle01Model_mc', 'Shuttle01Ragdoll_mc', 'Shuttle02Model_mc', 'Shuttle02Ragdoll_mc',
  'Shuttle03Model_mc', 'Shuttle03Ragdoll_mc', 'Shuttle04Model_mc', 'Shuttle04Ragdoll_mc',
  'Passenger01Model_mc', 'MissileModel_mc', 'MissileRagdoll_mc', 'PassengerBlueRagdoll01_mc',
  'PassengerBlueRagdoll02_mc', 'PassengerBlueRagdoll03_mc', 'PassengerBlueRagdoll04_mc',
  'PassengerBlueRagdoll05_mc', 'PassengerPinkRagdoll01_mc', 'PassengerPinkRagdoll02_mc',
  'PassengerPinkRagdoll03_mc', 'PassengerPinkRagdoll04_mc', 'PassengerPinkRagdoll05_mc',
  'PassengerGreenRagdoll01_mc', 'PassengerGreenRagdoll02_mc', 'PassengerGreenRagdoll03_mc',
  'PassengerGreenRagdoll04_mc', 'PassengerGreenRagdoll05_mc', 'PassengerOrangeRagdoll01_mc',
  'PassengerOrangeRagdoll02_mc', 'PassengerOrangeRagdoll03_mc', 'PassengerOrangeRagdoll04_mc',
  'PassengerOrangeRagdoll05_mc', 'BoxSmallModel_mc', 'BoxSmallRagdoll_mc', 'BoxBigModel_mc',
  'BoxBigRagdoll_mc', 'BarrelModel_mc', 'BarrelRagdoll_mc', 'BarrelExpModel_mc', 'BarrelExpRagdoll_mc',
  'Rock01Model_mc', 'Rock02Model_mc', 'Rock03Model_mc', 'Rock04Model_mc', 'Rock05Model_mc', 'Rock06Model_mc',
  'Rock07Model_mc', 'Rock01Ragdoll_mc', 'Rock02Ragdoll_mc', 'Rock03Ragdoll_mc', 'Rock04Ragdoll_mc',
  'Rock05Ragdoll_mc', 'Rock06Ragdoll_mc', 'Rock07Ragdoll_mc',
];

export class Models {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  manager: AntModelManager;

  /** DEVIATION: names of MODEL_CLIPS that the models data does not have (skipped). */
  missing: string[] = [];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aSource: Record<string, ModelClipJson> | null = null) {
    // super();
    if (aSource == null && AssetRegistry.current != null) {
      aSource = AssetRegistry.current.getModels() as Record<string, ModelClipJson>;
    }

    this.manager = new AntModelManager(aSource);
    this.manager.registerShapeComponent('RectShape_com', AntBox2DBoxShape);
    this.manager.registerShapeComponent('CircleShape_com', AntBox2DCircleShape);
    this.manager.registerJointComponent('RevoluteJoint_com', AntBox2DRevoluteJoint);
    this.manager.registerJointComponent('PrismaticJoint_com', AntBox2DPrismaticJoint);

    // var _loc1_:Function = this.manager.addModelFromClip;
    const source = aSource ?? {};
    for (const clip of MODEL_CLIPS) {
      if (Object.prototype.hasOwnProperty.call(source, clip)) {
        this.manager.addModelFromClip(clip);
      } else {
        this.missing.push(clip);
      }
    }
  }
}
