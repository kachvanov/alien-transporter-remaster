// Port of ru/antkarlov/anthill/ants/IFamily.as

import type { Ctor } from '../utils/types';
import type { AntNodeList } from './AntNodeList';
import type { AntObject } from './AntObject';

export interface IFamily {
  addObject(aObject: AntObject): void;
  removeObject(aObject: AntObject): void;
  componentAdded(aObject: AntObject, aComponentClass: Ctor): void;
  componentRemoved(aObject: AntObject, aComponentClass: Ctor): void;
  clear(): void;
  readonly nodes: AntNodeList;
}
