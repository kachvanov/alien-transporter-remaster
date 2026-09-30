// Port of ru/alientransporter/components/PassengerMediator.as

import type { ShuttleNode } from '../nodes/ShuttleNode';
import type { StationNode } from '../nodes/StationNode';

export class PassengerMediator {
  static readonly className = 'PassengerMediator';

  lowerLimit: number;
  upperLimit: number;
  station: StationNode | null = null;
  hasTicket: boolean;
  justSpawned: boolean;
  isGone: boolean;
  private _landedShuttles: ShuttleNode[];
  private _availShuttles: ShuttleNode[];

  constructor(aHasTicket: boolean, aJustSpawned: boolean) {
    // super();
    this.lowerLimit = 0;
    this.upperLimit = 0;
    this.hasTicket = aHasTicket;
    this.justSpawned = aJustSpawned;
    this.isGone = false;
    this._landedShuttles = [];
    this._availShuttles = [];
  }

  destroy(): void {
    this._landedShuttles.length = 0;
    this._landedShuttles = null as unknown as ShuttleNode[]; // AS3: _landedShuttles = null
  }

  addShuttle(aNode: ShuttleNode): void {
    if (!this.hasShuttle(aNode)) {
      this._landedShuttles.push(aNode);
    }
  }

  removeShuttle(aNode: ShuttleNode): void {
    const index = this._landedShuttles.indexOf(aNode); // :int
    if (index >= 0 && index < this._landedShuttles.length) {
      (this._landedShuttles as (ShuttleNode | null)[])[index] = null;
      this._landedShuttles.splice(index, 1);
    }
  }

  hasShuttle(aNode: ShuttleNode): boolean {
    const index = this._landedShuttles.indexOf(aNode); // :int
    return index >= 0 && index < this._landedShuttles.length;
  }

  private updateAvailList(): void {
    this._availShuttles.length = 0;
    let i = this._landedShuttles.length - 1; // :int
    while (i >= 0) {
      const shuttle = this._landedShuttles[i--]!;
      if (!shuttle.cargoHold.isFull()) {
        this._availShuttles[this._availShuttles.length] = shuttle;
      }
    }
  }

  get hasLandedShuttles(): boolean {
    return this._landedShuttles.length > 0;
  }

  /** The getter refreshes the list of available shuttles (as in the original). */
  get hasAvailShuttles(): boolean {
    this.updateAvailList();
    return this._availShuttles.length > 0;
  }

  getShuttle(): ShuttleNode | null {
    return this.hasAvailShuttles ? this._availShuttles[0]! : null;
  }
}
