// Port of ru/alientransporter/components/KeyPoint.as

import { AntMath } from '../../engine/utils/AntMath';
import type { SpawnPointNode } from '../nodes/SpawnPointNode';

export class KeyPoint {
  static readonly className = 'KeyPoint';

  x: number; // int
  y: number; // int
  radius: number; // int
  private _spawnPoints: SpawnPointNode[];
  private _numSpawnPoints: number; // int

  constructor(aX: number, aY: number) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
    this.radius = 60;
    this._spawnPoints = [];
    this._numSpawnPoints = 0;
  }

  destroy(): void {
    this._spawnPoints.length = 0;
    this._spawnPoints = null as unknown as SpawnPointNode[]; // AS3: _spawnPoints = null
  }

  isInside(aX: number, aY: number): boolean {
    return AntMath.distance(this.x, this.y, aX | 0, aY | 0) <= this.radius;
  }

  addSpawnPoint(aNode: SpawnPointNode): void {
    if (!this.hasSpawnPoint(aNode)) {
      this._spawnPoints.push(aNode);
      ++this._numSpawnPoints;
    }
  }

  hasSpawnPoint(aNode: SpawnPointNode): boolean {
    const index = this._spawnPoints.indexOf(aNode); // :int
    return index >= 0 && index < this._spawnPoints.length;
  }

  getSpawnPointAt(aIndex: number): SpawnPointNode | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._spawnPoints.length ? this._spawnPoints[aIndex]! : null;
  }

  getSpawnPoint(): SpawnPointNode | null {
    return this._spawnPoints.length > 0
      ? this._spawnPoints[AntMath.randomRangeInt(0, this._spawnPoints.length - 1)]!
      : null;
  }

  get numSpawnPoints(): number {
    return this._numSpawnPoints;
  }
}
