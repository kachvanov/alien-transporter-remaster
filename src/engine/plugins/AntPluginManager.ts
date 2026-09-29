// Port of ru/antkarlov/anthill/AntPluginManager.as

import type { AntCamera } from '../core/AntGStub'; // STUB(T1.2): becomes ../core/AntCamera
import { sortAS3 } from '../utils/as3array';
import type { AnyArgs } from '../utils/types';
import { isIPlugin } from './IPlugin';
import type { IPlugin } from './IPlugin';

export class AntPluginManager {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  protected static readonly ASCENDING = -1; // int
  protected static readonly DESCENDING = 1; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  listOfActive: (IPlugin | null)[] = [];
  listOfPaused: (IPlugin | null)[] = [];

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _numActive = 0; // int
  protected _numPaused = 0; // int
  protected _sortOrder = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this.listOfActive = [];
    this.listOfPaused = [];
    this._numActive = 0;
    this._numPaused = 0;
    this._sortOrder = AntPluginManager.DESCENDING;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  add(aPlugin: IPlugin): IPlugin {
    if (this.contains(aPlugin)) {
      return aPlugin;
    }

    let i = 0;
    while (i < this._numActive) {
      if (this.listOfActive[i] == null) {
        this.listOfActive[i] = aPlugin;
        // Array.sort of AS3 is not stable: sortAS3 reproduces the order Flash Player would produce.
        sortAS3(this.listOfActive, this.sortHandlerBound);
        return aPlugin;
      }
      i++;
    }

    this.listOfActive.push(aPlugin);
    sortAS3(this.listOfActive, this.sortHandlerBound);
    this._numActive++;
    return aPlugin;
  }

  addToPaused(aPlugin: IPlugin): IPlugin {
    if (this.contains(aPlugin)) {
      return aPlugin;
    }

    let i = 0;
    while (i < this._numPaused) {
      if (this.listOfPaused[i] == null) {
        this.listOfPaused[i] = aPlugin;
        return aPlugin;
      }
      i++;
    }

    this.listOfPaused.push(aPlugin);
    this._numPaused++;
    return aPlugin;
  }

  remove(aPlugin: IPlugin, aSplice = false): IPlugin {
    const i = this.listOfActive.indexOf(aPlugin) | 0; // :int
    if (i >= 0 && i < this.listOfActive.length) {
      this.listOfActive[i] = null;
      if (aSplice) {
        this.listOfActive.splice(i, 1);
        this._numActive--;
      }
    }

    this.removeFromPaused(aPlugin, aSplice);
    return aPlugin;
  }

  removeFromPaused(aPlugin: IPlugin, aSplice = false): IPlugin {
    const i = this.listOfPaused.indexOf(aPlugin) | 0; // :int
    if (i >= 0 && i < this.listOfPaused.length) {
      this.listOfPaused[i] = null;
      if (aSplice) {
        this.listOfPaused.splice(i, 1);
        this._numPaused--;
      }
    }

    return aPlugin;
  }

  removeSeveral(...aPlugins: AnyArgs): IPlugin[] | null {
    if (aPlugins == null) return null;

    const res: IPlugin[] = [];
    const list: AnyArgs = aPlugins.length == 1 && Array.isArray(aPlugins[0]) ? aPlugins[0] : aPlugins;
    const n = list.length | 0; // :int
    let i = 0;
    while (i < n) {
      this.removePlugin(list[i++], res);
    }

    return res;
  }

  contains(aPlugin: IPlugin): boolean {
    return this.listOfActive.indexOf(aPlugin) > -1 || this.listOfPaused.indexOf(aPlugin) > -1;
  }

  isActive(aPlugin: IPlugin): boolean {
    return this.listOfActive.indexOf(aPlugin) > -1;
  }

  isPaused(aPlugin: IPlugin): boolean {
    return this.listOfPaused.indexOf(aPlugin) > -1;
  }

  get(...aPlugins: AnyArgs): IPlugin[] | null {
    if (aPlugins == null) {
      return null;
    }

    const res: IPlugin[] = [];
    const list: AnyArgs = aPlugins.length == 1 && Array.isArray(aPlugins[0]) ? aPlugins[0] : aPlugins;
    const n = list.length | 0; // :int
    let i = 0;
    while (i < n) {
      this.getPlugin(list[i++], res);
    }

    return res;
  }

  pause(...aPlugins: AnyArgs): number {
    if (aPlugins == null) {
      return 0;
    }

    let count = 0; // :int
    const list: AnyArgs = aPlugins.length == 1 && Array.isArray(aPlugins[0]) ? aPlugins[0] : aPlugins;
    const n = list.length | 0; // :int
    let i = 0;
    while (i < n) {
      count += this.stopPlugin(list[i++]);
    }

    return count | 0;
  }

  resume(...aPlugins: AnyArgs): number {
    if (aPlugins == null) {
      return 0;
    }

    let count = 0; // :int
    const list: AnyArgs = aPlugins.length == 1 && Array.isArray(aPlugins[0]) ? aPlugins[0] : aPlugins;
    const n = list.length | 0; // :int
    let i = 0;
    while (i < n) {
      count += this.resumePlugin(list[i++]);
    }

    return count | 0;
  }

  update(): void {
    let i = 0;
    let plugin: IPlugin | null | undefined;
    while (i < this._numActive) {
      plugin = this.listOfActive[i++];
      if (plugin != null) {
        plugin.update();
      }
    }
  }

  draw(aCamera: AntCamera): void {
    let i = 0;
    let plugin: IPlugin | null | undefined;
    while (i < this._numActive) {
      plugin = this.listOfActive[i++];
      if (plugin != null) {
        plugin.draw(aCamera);
      }
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected removePlugin(aPlugin: unknown, aResult: IPlugin[] | null = null): IPlugin[] | null {
    if (aPlugin == null) return null;
    if (aResult == null) aResult = [];

    let i = 0;
    let plugin: IPlugin | null | undefined;
    while (i < this._numActive) {
      plugin = this.listOfActive[i++];
      if (this.compare(aPlugin, plugin)) {
        aResult.push(plugin as IPlugin);
        this.remove(plugin as IPlugin);
      }
    }

    i = 0;
    while (i < this._numPaused) {
      plugin = this.listOfPaused[i++];
      if (this.compare(aPlugin, plugin)) {
        aResult.push(plugin as IPlugin);
        this.remove(plugin as IPlugin);
      }
    }

    return aResult;
  }

  protected getPlugin(aPlugin: unknown, aResult: IPlugin[] | null = null): IPlugin[] | null {
    if (aPlugin == null) return null;
    if (aResult == null) aResult = [];

    let i = 0;
    let plugin: IPlugin | null | undefined;
    while (i < this._numActive) {
      plugin = this.listOfActive[i++];
      if (this.compare(aPlugin, plugin)) {
        aResult.push(plugin as IPlugin);
      }
    }

    i = 0;
    while (i < this._numPaused) {
      plugin = this.listOfPaused[i++];
      if (this.compare(aPlugin, plugin)) {
        aResult.push(plugin as IPlugin);
      }
    }

    return aResult;
  }

  protected stopPlugin(aPlugin: unknown): number {
    let count = 0; // :int
    let plugin: IPlugin | null | undefined;
    let i = 0;
    while (i < this._numActive) {
      plugin = this.listOfActive[i];
      if (this.compare(aPlugin, plugin)) {
        this.listOfActive[i] = null;
        this.addToPaused(plugin as IPlugin);
        count++;
      }
      i++;
    }

    return count | 0;
  }

  protected resumePlugin(aPlugin: unknown): number {
    let count = 0; // :int
    let plugin: IPlugin | null | undefined;
    let i = 0;
    while (i < this._numPaused) {
      plugin = this.listOfPaused[i];
      if (this.compare(aPlugin, plugin)) {
        this.listOfPaused[i] = null;
        this.add(plugin as IPlugin);
        count++;
      }
      i++;
    }

    return count | 0;
  }

  /**
   * aCondition: a tag (String), a plugin class (Class) or a plugin instance (IPlugin).
   * AS3: `aCondition is String && aPlugin.tag == aCondition`, `aCondition is Class && aPlugin is aCondition`,
   * `aCondition is IPlugin && aPlugin == aCondition`.
   */
  protected compare(aCondition: unknown, aPlugin: IPlugin | null | undefined): boolean {
    if (aCondition == null || aPlugin == null) {
      return false;
    }

    if (
      (typeof aCondition === 'string' && aPlugin.tag == aCondition) ||
      (typeof aCondition === 'function' && aPlugin instanceof aCondition) ||
      (isIPlugin(aCondition) && aPlugin == aCondition)
    ) {
      return true;
    }

    return false;
  }

  protected sortHandler(aPlugin1: IPlugin | null, aPlugin2: IPlugin | null): number {
    if (aPlugin1 == null) {
      return this._sortOrder;
    } else if (aPlugin2 == null) {
      return -this._sortOrder;
    }

    // String comparison of tags (`<`/`>` on AS3 Strings compares code units, null tag -> 0).
    const tag1 = aPlugin1.tag as unknown as string;
    const tag2 = aPlugin2.tag as unknown as string;
    if (tag1 < tag2) {
      return this._sortOrder;
    } else if (tag1 > tag2) {
      return -this._sortOrder;
    }

    return 0;
  }

  /** AS3 method closure: `sort(sortHandler)` passes a function permanently bound to `this`. */
  private sortHandlerBound = (aPlugin1: IPlugin | null, aPlugin2: IPlugin | null): number =>
    this.sortHandler(aPlugin1, aPlugin2);

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get numActive(): number {
    return this._numActive;
  }

  get numPaused(): number {
    return this._numPaused;
  }

  get numWorks(): number {
    let count = 0; // :int
    let i = 0;
    while (i < this._numActive) {
      if (this.listOfActive[i++] != null) {
        count++;
      }
    }

    return count | 0;
  }
}
