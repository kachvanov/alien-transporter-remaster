// Port of ru/alientransporter/models/IRagdollModel.as
// (complete: the interface has only these three members in the original)

import type { AnyObject } from '../../engine/utils/types';

export interface IRagdollModel {
  fadeOut(): boolean;
  bodies: AnyObject;
}
