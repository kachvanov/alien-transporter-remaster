// STUB(T2.7): stand-in for ru/alientransporter/missions/MissionManager.as.
// T2.7 ports the real class (missions from missions.json) and replaces this file. GameData needs
// toObject/fromObject for its save; here they store nothing. T2.6 added getActiveMissions/getNewMission (the end of
// a level, screens/LevelCompleteScreen.ts): there are no missions, the list stays empty and getNewMission() gives
// null, which the screen handles like the original does at the end of the list of missions.

import type { AnyObject } from '../../engine/utils/types';
import type { MissionData } from './MissionData';

export class MissionManager {
  clearData(): void {}

  /** AS3 `track(aKind:String, aValue:int = 1)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  track(_aKind: string, _aValue = 1): void {}

  /** AS3 `getNewMission():MissionData` (null when every mission is done). */
  getNewMission(): MissionData | null {
    return null;
  }

  /** AS3 `getActiveMissions(aList:Vector.<MissionData>):Vector.<MissionData>`. */
  getActiveMissions(aList: MissionData[]): MissionData[] {
    return aList;
  }

  toObject(): AnyObject {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fromObject(_aData: AnyObject | null): void {}
}
