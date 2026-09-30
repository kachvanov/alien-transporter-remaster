// Port of ru/antkarlov/anthill/AntTileMap.as
//
// DEVIATIONS (docs/04-porting-guide.md §4): the original slices a MovieClip into BitmapData tiles
// asynchronously (setTimeout(step, 1), numPerStep tiles per step) and adds an AntActor per tile. Here a
// layer of a level is one texture (`symbolName`, e.g. "Level01BG_mc"): addClip() takes the symbol name
// instead of the clip class, cacheClips() has nothing to slice and finishes at once: for every queued
// clip eventProcess is dispatched with the accumulated ratio, after the last clip eventComplete follows,
// in the order of the original (eventStart, eventProcess..., eventComplete), all inside cacheClips().
// No tile actors are created (`tiles` stays a grid of nulls, no children). debugDraw() is not ported.

import { AntSignal } from '../signals/AntSignal';
import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import type { Ctor } from '../utils/types';
import { AntActor } from './AntActor';
import { AntAnimation } from './AntAnimation';
import type { AntCamera } from './AntCamera';
import { AntEntity } from './AntEntity';

interface ClipQueueItem {
  symbolName: string;
  areaLower: AntPoint;
  areaUpper: AntPoint;
}

export class AntTileMap extends AntEntity {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  eventStart: AntSignal<[AntTileMap]> | null;
  eventProcess: AntSignal<[AntTileMap, number]> | null;
  eventComplete: AntSignal<[AntTileMap]> | null;
  tiles: (AntEntity | null)[] | null;
  tileAxisOffset: AntPoint;
  numPerStep = 0; // int
  drawQuickly = false;

  /** Symbol of the layer texture (the first clip added by addClip); the FrameWriter emits it as `<symbol>#0`. */
  symbolName: string | null = null;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _internalTileSet: AntAnimation | null = null;
  protected _externalTileSet: AntAnimation | null = null;
  protected _tileWidth = 0; // int
  protected _tileHeight = 0; // int
  protected _numRows = 0; // int
  protected _numCols = 0; // int
  protected _numTiles = 0; // int
  protected _queue: ClipQueueItem[];
  protected _queueIndex = 0; // int
  protected _tileIndex = 0; // int
  protected _tilesTotal = 0; // int
  protected _clipRows = 0; // int
  protected _clipCols = 0; // int
  protected _tileOffsetX = 0; // int
  protected _tileOffsetY = 0; // int
  protected _processCurrent = 0; // int
  protected _processTotal = 0; // int
  protected _cacheStarted = false;
  protected _cacheFinished = false;
  protected _topLeft: AntPoint;
  protected _bottomRight: AntPoint;
  protected _curPoint: AntPoint;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this.eventStart = new AntSignal<[AntTileMap]>(AntTileMap);
    this.eventProcess = new AntSignal<[AntTileMap, number]>(AntTileMap, Number);
    this.eventComplete = new AntSignal<[AntTileMap]>(AntTileMap);
    this.tiles = [];
    this.tileAxisOffset = new AntPoint();
    this.numPerStep = 10;
    this.drawQuickly = false;
    this.children = [];
    this.numChildren = 0;
    this._tileWidth = 32;
    this._tileHeight = 32;
    this._numRows = 8;
    this._numCols = 8;
    this._queue = [];
    this._tileIndex = 0;
    this._tilesTotal = 0;
    this._queueIndex = 0;
    this._clipRows = 0;
    this._clipCols = 0;
    this._tileOffsetX = 0;
    this._tileOffsetY = 0;
    this._processCurrent = 0;
    this._processTotal = 0;
    this._cacheStarted = false;
    this._cacheFinished = false;
    this._topLeft = new AntPoint();
    this._bottomRight = new AntPoint();
    this._curPoint = new AntPoint();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    (this.eventStart as AntSignal<[AntTileMap]>).destroy();
    (this.eventProcess as AntSignal<[AntTileMap, number]>).destroy();
    (this.eventComplete as AntSignal<[AntTileMap]>).destroy();
    this.eventStart = null;
    this.eventProcess = null;
    this.eventComplete = null;
    if (this._internalTileSet != null) {
      this._internalTileSet.destroy();
      this._internalTileSet = null;
    }

    this._externalTileSet = null;
    super.destroy();
    this.tiles = null;
  }

  override kill(): void {
    const tiles = this.tiles as (AntEntity | null)[];
    let i = 0;
    const n = tiles.length | 0;
    while (i < n) {
      tiles[i] = null;
      i++;
    }

    super.kill();
  }

  /**
   * `addClip(aClass:Class, x1, y1, x2, y2)` -> the symbol name of the layer. The area is in tiles;
   * without arguments (-1) it is the whole map.
   */
  addClip(aSymbolName: string, aLowerX = -1, aLowerY = -1, aUpperX = -1, aUpperY = -1): void {
    aLowerX = aLowerX | 0;
    aLowerY = aLowerY | 0;
    aUpperX = aUpperX | 0;
    aUpperY = aUpperY | 0;
    const lower = aLowerX < 0 && aLowerY < 0 ? new AntPoint(0, 0) : new AntPoint(aLowerX, aLowerY);
    const upper = aUpperX < 0 && aUpperY < 0 ? new AntPoint(this._numCols, this._numRows) : new AntPoint(aUpperX, aUpperY);
    this._queue.push({ symbolName: aSymbolName, areaLower: lower, areaUpper: upper });
    if (this.symbolName == null) {
      this.symbolName = aSymbolName;
    }
  }

  cacheClips(): void {
    if (this._queue.length == 0) {
      throw new Error("WARNING: Unable to perform caching. Don't have clips for caching.");
    }

    if (this._cacheStarted) {
      throw new Error('WARNING: Unable to perform caching. Another clip in processing.');
    }

    this.kill();
    this.revive();
    this._queueIndex = -1;
    this._processCurrent = 0;
    this._cacheStarted = true;
    this._cacheFinished = false;
    (this.eventStart as AntSignal<[AntTileMap]>).dispatch(this);
    this.resetTileSet();
    this.cacheClip();
  }

  /** In the original `param1 is MovieClip` is never true for a Class: always null. */
  cacheClipQuickly(_aSymbolName: string): AntAnimation | null {
    void _aSymbolName;
    return null;
  }

  setMapSize(aCols: number, aRows: number): void {
    this._numCols = aCols | 0;
    this._numRows = aRows | 0;
    this._numTiles = (this._numCols * this._numRows) | 0;
    this.updateSettings();
  }

  setTileSize(aWidth: number, aHeight: number): void {
    this._tileWidth = aWidth | 0;
    this._tileHeight = aHeight | 0;
    this.updateSettings();
  }

  setTileSet(aTileSet: AntAnimation): void {
    let tile: AntActor | null;
    this._externalTileSet = aTileSet;
    let i = 0;
    while (i < this.numChildren) {
      const child = (this.children as (AntEntity | null)[])[i++] ?? null;
      tile = child instanceof AntActor ? child : null;
      if (tile != null) {
        tile.clearAnimations();
        tile.addAnimation(this._externalTileSet);
        tile.gotoAndStop(1);
      }
    }

    if (this._internalTileSet != null) {
      this._internalTileSet.destroy();
      this._internalTileSet = null;
    }
  }

  setTileSetFromCache(aName: string): void {
    this.setTileSet(AntAnimation.getFromCache(aName));
  }

  setScrollFactor(aX = 1, aY = 1): void {
    let tile: AntActor | null;
    let i = 0;
    while (i < this.numChildren) {
      const child = (this.children as (AntEntity | null)[])[i++] ?? null;
      tile = child instanceof AntActor ? child : null;
      if (tile != null) {
        tile.scrollFactorX = aX;
        tile.scrollFactorY = aY;
      }
    }

    this.scrollFactorX = aX;
    this.scrollFactorY = aY;
  }

  switchFrame(aTileIndex: number, aFrame: number): void {
    aTileIndex = aTileIndex | 0;
    aFrame = aFrame | 0;
    const tiles = this.tiles as (AntEntity | null)[];
    if (aTileIndex < 0 || aTileIndex >= tiles.length) {
      return;
    }

    const tile = tiles[aTileIndex] instanceof AntActor ? (tiles[aTileIndex] as AntActor) : null;
    if (tile != null && tile.exists) {
      tile.gotoAndStop(aFrame);
    }
  }

  getIndex(aCol: number, aRow: number): number {
    aCol = aCol | 0;
    aRow = aRow | 0;
    return AntMath.trimToRange(this._numCols * aRow + aCol, 0, this._numTiles - 1) | 0;
  }

  getIndexByPosition(aX: number, aY: number): number {
    const col = AntMath.floor((aX - this.globalX + this.tileAxisOffset.x) / this._tileWidth) | 0;
    const row = AntMath.floor((aY - this.globalY + this.tileAxisOffset.y) / this._tileHeight) | 0;
    return this.getIndex(
      AntMath.trimToRange(col, 0, this._numCols - 1),
      AntMath.trimToRange(row, 0, this._numRows - 1),
    );
  }

  getCoordinates(aIndex: number, aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    aIndex = AntMath.trimToRange(aIndex | 0, 0, this._numTiles - 1) | 0;
    aResult.y = AntMath.floor(aIndex / this._numCols);
    aResult.x = aIndex - aResult.y * this._numCols;
    return aResult;
  }

  getPosition(aIndex: number, aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    this.getCoordinates(aIndex, aResult);
    aResult.x = aResult.x * this._tileWidth + this.x - this.tileAxisOffset.x;
    aResult.y = aResult.y * this._tileHeight + this.y - this.tileAxisOffset.y;
    return aResult;
  }

  getGlobalPosition(aIndex: number, aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    this.getPosition(aIndex, aResult);
    if (this.parent != null) {
      aResult.x += this.parent.globalX;
      aResult.y += this.parent.globalY;
    }

    return aResult;
  }

  getMyTile<T extends AntEntity = AntEntity>(aIndex: number, aClass: Ctor<T> | null = null): AntEntity | null {
    aIndex = aIndex | 0;
    const tiles = this.tiles as (AntEntity | null)[];
    if (aIndex < 0 || aIndex >= tiles.length) {
      return null;
    }

    const coords = this.getCoordinates(aIndex);
    let tile: AntEntity | null = tiles[aIndex] ?? null;
    if (tile == null) {
      if (aClass != null) {
        tile = this.recycle(aClass) as AntEntity;
        if (!tile.exists) {
          tile.revive();
          const j = tiles.indexOf(tile) | 0;
          if (j >= 0 && j < tiles.length) {
            tiles[j] = null;
          }
        }

        tile.reset(coords.x * this._tileWidth, coords.y * this._tileHeight);
        tiles[aIndex] = tile;
        return tile;
      }

      return null;
    }

    return tile;
  }

  getTile(aIndex: number, aCreate = false): AntActor | null {
    aIndex = aIndex | 0;
    const tiles = this.tiles as (AntEntity | null)[];
    if (aIndex < 0 || aIndex >= tiles.length) {
      return null;
    }

    const coords = this.getCoordinates(aIndex);
    let tile: AntActor | null = tiles[aIndex] instanceof AntActor ? (tiles[aIndex] as AntActor) : null;
    if (tile == null) {
      if (aCreate) {
        tile = this.recycle(AntActor) as AntActor;
        if (!tile.exists) {
          tile.revive();
          tile.clearAnimations();
          const j = tiles.indexOf(tile) | 0;
          if (j >= 0 && j < tiles.length) {
            tiles[j] = null;
          }
        }

        if (this._externalTileSet != null) {
          tile.addAnimation(this._externalTileSet);
          tile.gotoAndStop(1);
        }

        tile.active = false;
        tile.reset(coords.x * this._tileWidth, coords.y * this._tileHeight);
        tiles[aIndex] = tile;
        return tile;
      }

      return null;
    }

    return tile;
  }

  queryRectIndexes(aIndexA: number, aIndexB: number, aResult: number[] | null = null): number[] {
    aIndexA = aIndexA | 0;
    aIndexB = aIndexB | 0;
    if (aResult == null) {
      aResult = [];
    }

    if (aIndexA == aIndexB) {
      aResult[aResult.length] = aIndexA;
      return aResult;
    }

    let tmp;
    const a = this.getCoordinates(aIndexA);
    const b = this.getCoordinates(aIndexB);
    if (b.x < a.x) {
      tmp = b.x;
      b.x = a.x;
      a.x = tmp;
    }

    if (b.y < a.y) {
      tmp = b.y;
      b.y = a.y;
      a.y = tmp;
    }

    if (a.y == b.y) {
      let i = a.x | 0;
      while (i <= b.x) {
        aResult[aResult.length] = this.getIndex(i, a.y);
        i++;
      }
    } else {
      let i = a.y | 0;
      while (i <= b.y) {
        let j = a.x | 0;
        while (j <= b.x) {
          aResult[aResult.length] = this.getIndex(j, i);
          j++;
        }
        i++;
      }
    }

    return aResult;
  }

  override draw(aCamera: AntCamera): void {
    if (this.drawQuickly) {
      this.drawQuick(aCamera);
    } else {
      super.draw(aCamera);
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected drawQuick(aCamera: AntCamera): void {
    const sx = aCamera.scroll.x * -1 * this.scrollFactorX;
    const sy = aCamera.scroll.y * -1 * this.scrollFactorY;
    this.getCoordinates(this.getIndexByPosition(sx, sy), this._topLeft);
    this.getCoordinates(this.getIndexByPosition(sx + aCamera.width, sy + aCamera.height), this._bottomRight);
    this._bottomRight.increment(1);
    const cols = (this._bottomRight.x - this._topLeft.x) | 0; // :int
    const rows = (this._bottomRight.y - this._topLeft.y) | 0; // :int
    const total = (cols * rows) | 0; // :int
    this._curPoint.copyFrom(this._topLeft);
    const tiles = this.tiles as (AntEntity | null)[];
    let i = 0; // :int
    while (i < total) {
      const t = tiles[this.getIndex(this._curPoint.x, this._curPoint.y)] ?? null;
      const tile = t instanceof AntActor ? t : null;
      if (tile != null && tile.exists && tile.visible) {
        if (tile.isPlaying) {
          tile.update();
        }

        tile.updateBounds();
        tile.drawActor(aCamera);
      }

      ++this._curPoint.x;
      if (this._curPoint.x >= this._bottomRight.x) {
        this._curPoint.x = this._topLeft.x;
        ++this._curPoint.y;
      }
      i++;
    }
  }

  protected resetTileSet(): void {
    if (this._internalTileSet != null) {
      this._internalTileSet.destroy();
    }

    this._internalTileSet = new AntAnimation('TileMap');
    this._internalTileSet.width = this._tileWidth;
    this._internalTileSet.height = this._tileHeight;
    this._internalTileSet.totalFrames = this._processTotal = this.numTilesForCaching();
  }

  protected updateSettings(): void {
    let tile: AntActor | null;
    this.width = this._numCols * this._tileWidth;
    this.height = this._numRows * this._tileHeight;
    const tiles = this.tiles as (AntEntity | null)[];
    let i; // :int
    const oldLength = tiles.length | 0; // :int
    if (tiles.length < this._numTiles) {
      tiles.length = this._numTiles;
    } else if (tiles.length > this._numTiles) {
      i = (this._numTiles - 1) | 0;
      while (i < oldLength) {
        tile = tiles[i] instanceof AntActor ? (tiles[i] as AntActor) : null;
        if (tile != null) {
          tile.destroy();
        }

        tiles[i] = null;
        i++;
      }

      tiles.length = this._numTiles;
    }

    const coords = new AntPoint();
    i = 0;
    while (i < oldLength) {
      this.getCoordinates(i, coords);
      tile = tiles[i] instanceof AntActor ? (tiles[i] as AntActor) : null;
      if (tile != null) {
        tile.x = coords.x * this._tileWidth;
        tile.y = coords.y * this._tileHeight;
      }
      i++;
    }
  }

  protected cacheClip(): void {
    ++this._queueIndex;
    const item = this._queue[this._queueIndex] as ClipQueueItem;
    this._clipCols = (item.areaUpper.x - item.areaLower.x) | 0;
    this._clipRows = (item.areaUpper.y - item.areaLower.y) | 0;
    this._tileOffsetX = item.areaLower.x | 0;
    this._tileOffsetY = item.areaLower.y | 0;
    this._tileIndex = 0;
    this._tilesTotal = ((item.areaUpper.x - item.areaLower.x) * (item.areaUpper.y - item.areaLower.y)) | 0;
    this.step();
  }

  /**
   * The original processes numPerStep tiles per call and re-schedules itself with setTimeout; the
   * whole clip is "cut" in one go here.
   */
  protected step(): void {
    this._processCurrent = (this._processCurrent + (this._tilesTotal - this._tileIndex)) | 0;
    this._tileIndex = this._tilesTotal;
    (this.eventProcess as AntSignal<[AntTileMap, number]>).dispatch(this, this._processCurrent / this._processTotal);
    if (this._tileIndex == this._tilesTotal) {
      if (this._queueIndex + 1 >= this._queue.length) {
        this._queue.length = 0;
        this._cacheFinished = true;
        this._cacheStarted = false;
        (this.eventComplete as AntSignal<[AntTileMap]>).dispatch(this);
      } else {
        this.cacheClip();
      }
    }
  }

  protected numTilesForCaching(): number {
    let n = 0; // :int
    let i = 0;
    const count = this._queue.length | 0;
    while (i < count) {
      const item = this._queue[i++];
      if (item != null) {
        n = (n + (item.areaUpper.x - item.areaLower.x) * (item.areaUpper.y - item.areaLower.y)) | 0;
      }
    }

    return n;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get numCols(): number {
    return this._numCols;
  }

  get numRows(): number {
    return this._numRows;
  }

  get numTiles(): number {
    return this._numTiles;
  }

  get tileWidth(): number {
    return this._tileWidth;
  }

  get tileHeight(): number {
    return this._tileHeight;
  }

  get mapWidth(): number {
    return (this._numCols * this._tileWidth) | 0;
  }

  get mapHeight(): number {
    return (this._numRows * this._tileHeight) | 0;
  }

  /** True once the last cacheClips() has completed (the original keeps it private-ish, unread). */
  get cacheFinished(): boolean {
    return this._cacheFinished;
  }
}
