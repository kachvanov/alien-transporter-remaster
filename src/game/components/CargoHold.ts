// Port of ru/alientransporter/components/CargoHold.as

import type { AntObject } from '../../engine/ants/AntObject';
import { G } from '../G';

/** AS3 `Object` {cargoId, destination, indicator} of the cargo list. */
export interface Cargo {
  cargoId: string;
  destination: string;
  indicator: AntObject;
}

export class CargoHold {
  static readonly className = 'CargoHold';

  capacity: number; // int
  private _cargoList: (Cargo | null)[];
  private _numCargo: number; // int

  constructor(aCapacity = 1) {
    // super();
    this.capacity = aCapacity | 0;
    this._cargoList = [];
    this._numCargo = 0;
  }

  destroy(): void {
    let i = 0;
    while (i < this._cargoList.length) {
      G.core.removeObject(this._cargoList[i++]!.indicator);
    }
  }

  loadCargo(aCargoId: string, aDestination: string, aIndicator: AntObject): void {
    if (this._numCargo < this.capacity) {
      this._cargoList[this._numCargo] = {
        cargoId: aCargoId,
        destination: aDestination,
        indicator: aIndicator,
      };
      ++this._numCargo;
    }
  }

  /**
   * As in the original the loop index is never decremented: the call is only safe when the LAST loaded
   * cargo has this destination (with the capacity 1 of every shuttle that always holds; callers check
   * hasCargo() first). Do not "fix": a mismatch hangs here exactly as it does in the original.
   */
  unloadCargo(aDestination: string): void {
    const i = this._cargoList.length - 1; // :int
    while (i >= 0) {
      if (this._cargoList[i]!.destination == aDestination) {
        G.core.removeObject(this._cargoList[i]!.indicator);
        this._cargoList[i] = null;
        this._cargoList.splice(i, 1);
        --this._numCargo;
        break;
      }
    }
  }

  hasCargo(aDestination: string): boolean {
    return this.getCargo(aDestination) != null;
  }

  getCargo(aDestination: string): Cargo | null {
    let i = this._cargoList.length - 1; // :int
    while (i >= 0) {
      const cargo = this._cargoList[i--]!;
      if (cargo.destination == aDestination) {
        return cargo;
      }
    }

    return null;
  }

  getCargoKind(aDestination: string): string | null {
    const cargo = this.getCargo(aDestination);
    return cargo != null ? cargo.cargoId : null;
  }

  isFull(): boolean {
    return this._numCargo == this.capacity;
  }

  get numCargo(): number {
    return this._numCargo;
  }
}
