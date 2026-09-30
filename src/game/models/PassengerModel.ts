// STUB(T1.9b): stand-in for ru/alientransporter/models/PassengerModel.as.
// T1.9b ports the real class and replaces this file. The node classes of T1.9a need the class itself.
// Note for T1.9b: PhysicModel probes hitPoint/hitForce/hasHit with `in`; the passenger model has none of
// them (in the original too), so do not declare them.

import { BasicModel } from './BasicModel';

export class PassengerModel extends BasicModel {
  static readonly className = 'PassengerModel';
}
