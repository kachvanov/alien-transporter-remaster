// Port of ru/alientransporter/missions/MissionManager.as
//
// DEVIATION: `loadMissions(XmlMissions)` reads the embedded XML class; here the same XML is assets/data/missions.json
// of the data step (`{Mission: [{SubProp: [{name, value}]}]}`, docs/04 §5), taken from AssetRegistry.current. A game
// without missions.json (a test that did not load it) has no missions: getNewMission() then gives null.
// DEVIATION: the ids of the missions are the keys of the save (MissionData.fromObject). The original creates the
// manager once per process (the ids 0..18); here every G.init() creates one, so the counter is reset first.
// DEVIATION: `fromObject` of the original throws a TypeError (null / no `missionList`) for a save without missions;
// here such a save is ignored.

import { AssetRegistry } from '../../engine/assets/AssetRegistry';
import { AntMath } from '../../engine/utils/AntMath';
import type { AnyObject } from '../../engine/utils/types';
import { MissionData } from './MissionData';

/** The type of the field of MissionData that `<SubProp name=...>` is assigned to (AS3 coerces by the declared type). */
type FieldKind = 'string' | 'number' | 'int' | 'boolean';

const MISSION_FIELDS: Readonly<Record<string, FieldKind>> = {
  id: 'int',
  iconBig: 'string',
  iconSmall: 'string',
  missionText: 'string',
  unlockedText: 'string',
  hintText: 'string',
  awardId: 'string',
  statName: 'string',
  goalValue: 'number',
  difficult: 'int',
  lastValue: 'number',
  value: 'number',
  isActive: 'boolean',
  isCompleted: 'boolean',
};

export class MissionManager {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _difficultLevel: number; // int
  private _missions: MissionData[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this._difficultLevel = 1;
    this._missions = [];
    MissionData.resetIds();
    this.loadMissions();
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private loadMissions(): void {
    const registry = AssetRegistry.current;
    if (registry == null) {
      return;
    }

    let xml: AnyObject;
    try {
      xml = registry.getMissions();
    } catch {
      return; // missions.json is not loaded: see the header
    }

    this.loadXML(xml);
  }

  private loadXML(aXml: AnyObject): void {
    const missions = (aXml['Mission'] ?? []) as AnyObject[];
    for (const mission of missions) {
      this.loadMissionFrom(mission);
    }
  }

  private loadMissionFrom(aXml: AnyObject): void {
    let name: string;
    const data = new MissionData();
    const props = (aXml['SubProp'] ?? []) as { name: string; value: string }[];
    for (const prop of props) {
      name = prop.name;
      if (!Object.prototype.hasOwnProperty.call(MISSION_FIELDS, name)) {
        continue; // !data.hasOwnProperty(name)
      }

      switch (name) {
        case 'goal':
        case 'difficult':
          this.setField(data, name, parseFloat(prop.value));
          break;
        default:
          this.setField(data, name, prop.value);
      }
    }

    this._missions.push(data);
  }

  /** `data[name] = value`: the value is converted to the declared type of the field, like AS3 does. */
  private setField(aData: MissionData, aName: string, aValue: string | number): void {
    const target = aData as unknown as Record<string, unknown>;
    switch (MISSION_FIELDS[aName]) {
      case 'string':
        target[aName] = String(aValue);
        break;
      case 'number':
        target[aName] = Number(aValue);
        break;
      case 'int':
        target[aName] = Number(aValue) | 0;
        break;
      case 'boolean':
        target[aName] = typeof aValue === 'string' ? aValue.length > 0 && aValue !== 'false' : Boolean(aValue);
        break;
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  clearData(): void {
    let i = (this._missions.length - 1) | 0; // :int
    while (i >= 0) {
      (this._missions[i--] as MissionData).reset();
    }

    this._difficultLevel = 1;
  }

  track(aKind: string, aValue = 1): void {
    aValue = aValue | 0; // aValue:int
    let mission: MissionData;
    let i = 0; // :int
    const n = this._missions.length | 0; // :int
    while (i < n) {
      mission = this._missions[i++] as MissionData;
      if (mission.isActive && mission.statName == aKind) {
        mission.track(aValue);
      }
    }
  }

  getNewMission(): MissionData | null {
    let mission: MissionData;
    const n = this._missions.length | 0; // :int
    const list: MissionData[] = [];
    let difficult = this._difficultLevel | 0; // :int
    while (list.length == 0) {
      let i = 0; // :int
      while (i < n) {
        mission = this._missions[i++] as MissionData;
        if (mission.difficult == difficult && !mission.isActive && !mission.isCompleted) {
          list.push(mission);
        }
      }

      if (++difficult >= 6) {
        break;
      }
    }

    if (list.length > 0) {
      mission = list[AntMath.randomRangeInt(0, list.length - 1)] as MissionData;
      mission.isActive = true;
      if (list.length == 1) {
        ++this._difficultLevel;
      }

      return mission;
    }

    return null;
  }

  getActiveMissions(aList: MissionData[] | null): MissionData[] {
    if (aList == null) {
      aList = [];
    }

    let mission: MissionData;
    let i = 0; // :int
    const n = this._missions.length | 0; // :int
    while (i < n) {
      mission = this._missions[i++] as MissionData;
      if (mission.isActive && !mission.isCompleted) {
        aList.push(mission);
      }
    }

    return aList;
  }

  toObject(): AnyObject {
    let mission: MissionData;
    let i = 0; // :int
    const n = this._missions.length | 0; // :int
    const list: AnyObject[] = [];
    while (i < n) {
      mission = this._missions[i++] as MissionData;
      list.push(mission.toObject());
    }

    return {
      difficultLevel: this._difficultLevel,
      missionList: list,
    };
  }

  fromObject(aData: AnyObject | null): void {
    if (aData == null || !Array.isArray(aData['missionList'])) {
      return;
    }

    this._difficultLevel = (aData['difficultLevel'] as number) | 0;
    const list = aData['missionList'] as AnyObject[];
    let i = 0; // :int
    const n = list.length | 0; // :int
    const m = this._missions.length | 0; // :int
    while (i < n) {
      let j = 0; // :int
      const saved = list[i++] as AnyObject;
      while (j < m) {
        (this._missions[j++] as MissionData).fromObject(saved);
      }
    }
  }
}
