// Port of ru/alientransporter/missions/MissionData.as
//
// Ported by T2.6 because LevelCompleteScreen reads it (the missions of the end of a level). The MissionManager
// that fills it is still the stub of T2.7 (no missions in the list), so no instance exists in a game yet.
// DEVIATION: `fromObject` of the original writes a line to the log with trace(); it is dropped.

import type { AnyObject } from '../../engine/utils/types';

export class MissionData {
  private static _id = 0; // int

  id: number; // int
  iconBig: string | null;
  iconSmall: string | null;
  missionText: string | null;
  unlockedText: string | null;
  hintText: string | null;
  awardId: string | null;
  statName: string | null;
  goalValue: number;
  difficult: number; // int
  lastValue: number;
  value: number;
  isActive: boolean;
  isCompleted: boolean;

  constructor() {
    // super();
    this.id = MissionData._id++ | 0;
    this.iconBig = null;
    this.iconSmall = null;
    this.missionText = null;
    this.unlockedText = null;
    this.hintText = null;
    this.awardId = null;
    this.statName = null;
    this.goalValue = 0;
    this.difficult = 1;
    this.lastValue = 0;
    this.value = 0;
    this.isActive = false;
    this.isCompleted = false;
  }

  resetMissionId(): void {
    MissionData._id = 0;
  }

  track(aValue = 1): void {
    this.value += aValue;
    this.value = this.value > this.goalValue ? this.goalValue : this.value;
  }

  toObject(): AnyObject {
    return {
      id: this.id,
      lastValue: this.lastValue,
      value: this.value,
      isActive: this.isActive,
      isCompleted: this.isCompleted,
    };
  }

  fromObject(aData: AnyObject): void {
    if (this.id == aData['id']) {
      this.lastValue = aData['lastValue'] as number;
      this.value = aData['value'] as number;
      this.isActive = aData['isActive'] as boolean;
      this.isCompleted = aData['isCompleted'] as boolean;
    }
  }

  reset(): void {
    this.lastValue = 0;
    this.value = 0;
    this.isActive = false;
    this.isCompleted = false;
  }
}
