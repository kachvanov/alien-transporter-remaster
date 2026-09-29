// Port of ru/antkarlov/anthill/utils/AntRating.as

export class AntRating {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _size = 0; // uint
  protected _ind = 0; // uint
  protected _data: number[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aSize: number, aDefault = 0) {
    aSize = aSize >>> 0; // aSize:uint
    this._size = (aSize <= 0 ? 1 : aSize) >>> 0;
    this._ind = 0;
    this._data = new Array<number>(this._size);
    for (let i = 0; i < this._size; i++) {
      this._data[i] = aDefault;
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  add(value: number): void {
    this._data[this._ind++] = value;
    if (this._ind >= this._size) {
      this._ind = 0;
    }
  }

  average(): number {
    let sum = 0;
    for (let i = 0; i < this._size; i++) {
      sum += this._data[i] as number;
    }
    return sum / this._size;
  }

  length(): number {
    return this._size | 0; // :int
  }
}
