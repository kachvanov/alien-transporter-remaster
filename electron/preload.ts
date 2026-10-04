// Preload: `window.at` (types: src/app/at.d.ts, docs/01-architecture.md §9). Works under sandbox: true +
// contextIsolation. The net.* and discovery.* parts are M3.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AtApi, DiscoveredGame, HostEvent, SelfTestResult } from '../src/app/at';
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
    getHostName: () => ipcRenderer.invoke('app:hostname') as Promise<string>,
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
  net: {
    hostStart: (opts) => ipcRenderer.invoke('net:host-start', opts) as Promise<void>,
    hostStop: () => ipcRenderer.invoke('net:host-stop') as Promise<void>,
    selfTest: (addresses, port) => ipcRenderer.invoke('net:self-test', addresses, port) as Promise<SelfTestResult>,
    onHostEvent: (cb) => {
      const listener = (_e: IpcRendererEvent, event: HostEvent): void => cb(event);
      ipcRenderer.on('net:host-event', listener);
      return () => {
        ipcRenderer.removeListener('net:host-event', listener);
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

// The MessagePort of the network bridge of the host (T3.2): main -> preload -> the page (src/app/main.ts), which
// hands it to the sim worker. A port cannot cross contextBridge, window.postMessage is the way.
ipcRenderer.on('sim-port', (e) => {
  window.postMessage('sim-port', '*', e.ports);
});
