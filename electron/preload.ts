// Preload: `window.at` (types: src/app/at.d.ts, docs/01-architecture.md §9). Works under sandbox: true +
// contextIsolation. The net.* and discovery.* parts arrive with M3.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AtApi, DiscoveredGame } from '../src/app/at';
import { decodeFlagsArg } from './flags';

const api: AtApi = {
  platform: process.platform,
  app: {
    flags: decodeFlagsArg(process.argv),
    toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen') as Promise<void>,
    isFullscreen: () => ipcRenderer.invoke('app:is-fullscreen') as Promise<boolean>,
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url) as Promise<boolean>,
    quit: () => ipcRenderer.send('app:quit'),
    getLocalIPv4: () => ipcRenderer.invoke('app:local-ipv4') as Promise<string[]>,
  },
  discovery: {
    startBeacon: (info) => ipcRenderer.invoke('discovery:start-beacon', info) as Promise<void>,
    stopBeacon: () => ipcRenderer.invoke('discovery:stop-beacon') as Promise<void>,
    startScan: (buildHash) => ipcRenderer.invoke('discovery:start-scan', buildHash) as Promise<void>,
    stopScan: () => ipcRenderer.invoke('discovery:stop-scan') as Promise<void>,
    onUpdate: (cb) => {
      const listener = (_e: IpcRendererEvent, games: DiscoveredGame[]): void => cb(games);
      ipcRenderer.on('discovery:update', listener);
      return () => {
        ipcRenderer.removeListener('discovery:update', listener);
      };
    },
  },
  save: {
    load: (key) => ipcRenderer.invoke('save:load', key) as Promise<unknown>,
    write: (key, data) => ipcRenderer.invoke('save:write', key, data) as Promise<void>,
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, unknown>>,
    set: (patch) => ipcRenderer.invoke('settings:set', patch) as Promise<Record<string, unknown>>,
  },
};

contextBridge.exposeInMainWorld('at', api);
