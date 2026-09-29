import { contextBridge } from 'electron';

// Scaffold preload (T0.1). The real `window.at` API arrives in later tasks
// (docs/01-architecture.md §9). Works under sandbox: true + contextIsolation.
contextBridge.exposeInMainWorld('at', {
  platform: process.platform,
});
