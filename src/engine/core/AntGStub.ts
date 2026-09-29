// STUB(T1.2): temporary stand-in for ru/antkarlov/anthill/AntG.as.
// T1.2 replaces this file with the real `AntG` (src/engine/core/AntG.ts) and deletes it.
// Only the members that T1.1 code touches are declared: `plugins`, `elapsed`, `timeScale`.
// Initial values follow AntG.init(): timeScale = 1, elapsed = 0.02, plugins = new AntPluginManager.

import { AntPluginManager } from '../plugins/AntPluginManager';

/** STUB(T1.2): placeholder for ru.antkarlov.anthill.AntCamera (passed to IPlugin.draw). */
export type AntCamera = object;

export class AntG {
  static timeScale = 1;
  static elapsed = 0.02;
  static plugins: AntPluginManager = new AntPluginManager();
}
