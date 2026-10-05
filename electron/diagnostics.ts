// Not a port (T5.2). The wiring of crash.log into Electron (main process): the events of the processes and of the window, the
// reports of the renderer (IPC `diag:event`, `diag:stats`), the state line every 30 s, and the safety net: a renderer that is gone,
// hung for 10 s, or a lost GPU process that does not come back is replaced by a fresh page (`recover`), see main.ts.
// The pure parts are in crashLog.ts and diagState.ts (unit-tested).

import { cpus, freemem, homedir, totalmem } from 'node:os';
import { app, ipcMain, powerMonitor, screen, type BrowserWindow, type RenderProcessGoneDetails } from 'electron';
import { EventLimiter, type CrashLog, type Fields } from './crashLog';
import { metricsFields, sanitizeRendererEvent, sanitizeRendererStats, type ProcessMetric } from './diagState';

/** The window that does not answer for this long is replaced. */
export const UNRESPONSIVE_KILL_MS = 10_000;
/** The GPU process is gone: the renderer gets this long to report that its WebGL context is back. */
export const GPU_RESTORE_MS = 6_000;
export const STATE_INTERVAL_MS = 30_000;

export type RecoveryCause = 'render_gone' | 'unresponsive' | 'gpu_gone';

export interface DiagnosticsDeps {
  log: CrashLog;
  getWindow(): BrowserWindow | null;
  /** Statistics of the host server (the socket buffer, frames sent and skipped); empty when not hosting. */
  hostStats(): Fields;
  isQuitting(): boolean;
  /** Replaces the page of the window with a fresh one at the menu (never touches the save). */
  recover(aCause: RecoveryCause, aDetail: string): void;
  /** Interval of the state line, ms (tests make it short). */
  stateIntervalMs?: number;
}

export class Diagnostics {
  private readonly _deps: DiagnosticsDeps;
  private readonly _limiter = new EventLimiter(60);
  private _lastStats: Fields | null = null;
  private _lastStatsAt = 0;
  private _stateTimer: ReturnType<typeof setInterval> | null = null;
  private _lagTimer: ReturnType<typeof setInterval> | null = null;
  private _lagLast = 0;
  private _lagMax = 0;
  private _hangTimer: ReturnType<typeof setTimeout> | null = null;
  private _hangSince = 0;
  private _gpuTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingCause: RecoveryCause | null = null;
  private _attached: BrowserWindow | null = null;

  constructor(aDeps: DiagnosticsDeps) {
    this._deps = aDeps;
  }

  /** Process-wide events and the timers. Call once, before the window is made (some events fire at once). */
  install(): void {
    const log = this._deps.log;

    process.on('uncaughtException', (e: Error) => {
      log.write('MAIN_UNCAUGHT', { message: e.message, stack: e.stack });
      log.flushSync();
    });
    process.on('unhandledRejection', (reason: unknown) => {
      log.write('MAIN_REJECTION', { reason: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason) });
    });

    app.on('child-process-gone', (_event, d) => {
      log.write('CHILD_GONE', { type: d.type, reason: d.reason, exitCode: d.exitCode, name: d.name ?? d.serviceName });
      log.flushSync();
      if (d.type === 'GPU' && d.reason !== 'clean-exit') {
        this.armGpuTimer();
      }
    });
    app.on('gpu-info-update', () => {
      log.write('GPU_INFO_UPDATE', gpuStatus());
    });
    app.on('render-process-gone', (_event, _wc, d) => this.onRenderGone(d));

    this._lagLast = Date.now();
    this._lagTimer = setInterval(() => {
      const now = Date.now();
      this._lagMax = Math.max(this._lagMax, now - this._lagLast - 1000);
      this._lagLast = now;
    }, 1000);
    this._stateTimer = setInterval(() => this.writeState(), this._deps.stateIntervalMs ?? STATE_INTERVAL_MS);

    void app.whenReady().then(() => {
      powerMonitor.on('suspend', () => log.write('POWER', { state: 'suspend' }));
      powerMonitor.on('resume', () => log.write('POWER', { state: 'resume' }));
      powerMonitor.on('lock-screen', () => log.write('POWER', { state: 'lock-screen' }));
      powerMonitor.on('unlock-screen', () => log.write('POWER', { state: 'unlock-screen' }));
      screen.on('display-added', () => log.write('DISPLAY', { change: 'added', count: screen.getAllDisplays().length }));
      screen.on('display-removed', () => log.write('DISPLAY', { change: 'removed', count: screen.getAllDisplays().length }));
      screen.on('display-metrics-changed', (_e, display, changed) =>
        log.write('DISPLAY', { change: 'metrics:' + changed.join('+'), scale: display.scaleFactor }),
      );
      void app
        .getGPUInfo('basic')
        .then((info) => {
          const gpu = (info as { gpuDevice?: { active?: boolean; vendorId?: number; deviceId?: number }[] }).gpuDevice ?? [];
          const active = gpu.find((g) => g.active === true) ?? gpu[0];
          log.write('GPU', { vendor: active?.vendorId, device: active?.deviceId, ...gpuStatus() });
        })
        .catch(() => undefined);
    });
  }

  /** The IPC of the renderer. */
  registerIpc(): void {
    ipcMain.on('diag:event', (event, name: unknown, fields: unknown) => {
      if (this._attached === null || event.sender !== this._attached.webContents) {
        return;
      }

      const clean = sanitizeRendererEvent(name, fields);
      if (clean === null) {
        return;
      }

      if (clean.name === 'WEBGL_CONTEXT_RESTORED') {
        this.clearGpuTimer();
      }

      if (!this._limiter.allow(Date.now())) {
        return;
      }

      const dropped = this._limiter.takeDropped();
      if (dropped > 0) {
        this._deps.log.write('RENDERER_EVENTS_DROPPED', { count: dropped });
      }

      this._deps.log.write(clean.name, clean.fields);
    });
    ipcMain.on('diag:stats', (event, stats: unknown) => {
      if (this._attached === null || event.sender !== this._attached.webContents) {
        return;
      }

      const clean = sanitizeRendererStats(stats);
      if (clean !== null) {
        this._lastStats = clean;
        this._lastStatsAt = Date.now();
      }
    });
  }

  /** The events of one window (call again for a window that is made later; the previous one must be gone). */
  attachWindow(aWin: BrowserWindow): void {
    this._attached = aWin;
    const wc = aWin.webContents;
    const log = this._deps.log;

    wc.on('unresponsive', () => {
      log.write('UNRESPONSIVE');
      log.flushSync();
      this._hangSince = Date.now();
      this.clearHangTimer();
      this._hangTimer = setTimeout(() => {
        this._hangTimer = null;
        if (wc.isDestroyed() || wc.isDevToolsOpened() || this._deps.isQuitting()) {
          return;
        }

        log.write('HANG_KILL', { afterMs: Date.now() - this._hangSince });
        log.flushSync();
        this._pendingCause = 'unresponsive';
        wc.forcefullyCrashRenderer(); // (render-process-gone follows: onRenderGone recovers)
      }, UNRESPONSIVE_KILL_MS);
    });
    wc.on('responsive', () => {
      log.write('RESPONSIVE', { afterMs: this._hangSince > 0 ? Date.now() - this._hangSince : undefined });
      this.clearHangTimer();
    });
    wc.on('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      log.write('LOAD_FAILED', { code, description, mainFrame: isMainFrame });
    });
    wc.on('did-start-loading', () => this.clearHangTimer());
    for (const name of ['show', 'hide', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen'] as const) {
      aWin.on(name as 'show', () => log.write('WINDOW', { event: name }));
    }
  }

  dispose(): void {
    this.clearHangTimer();
    this.clearGpuTimer();
    if (this._stateTimer !== null) {
      clearInterval(this._stateTimer);
    }

    if (this._lagTimer !== null) {
      clearInterval(this._lagTimer);
    }
  }

  /** The state line (also called by tests). */
  writeState(): void {
    const metrics: ProcessMetric[] = app.getAppMetrics().map((m) => ({
      type: m.type,
      pid: m.pid,
      workingSetKB: m.memory.workingSetSize,
      privateKB: m.memory.privateBytes ?? 0,
      cpuPercent: m.cpu.percentCPUUsage,
    }));
    const fields: Fields = {
      ...metricsFields(metrics),
      sys_free: Math.round(freemem() / 1048576),
      main_lag_max: Math.round(this._lagMax),
      renderer_age: this._lastStatsAt > 0 ? Math.round((Date.now() - this._lastStatsAt) / 1000) : undefined,
      ...this._deps.hostStats(),
      ...(this._lastStats ?? {}),
    };
    this._lagMax = 0;
    this._deps.log.write('STATE', fields);
  }

  /** The first lines of a run: what the machine is. */
  writeStart(aFields: Fields): void {
    this._deps.log.write('START', {
      ...aFields,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      cpu: (cpus()[0]?.model ?? '?') + ' x' + cpus().length,
      ram_total_mb: Math.round(totalmem() / 1048576),
      locale: app.getLocale(),
      ...gpuStatus(),
    });
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private onRenderGone(aDetails: RenderProcessGoneDetails): void {
    const log = this._deps.log;
    log.write('RENDER_GONE', { reason: aDetails.reason, exitCode: aDetails.exitCode });
    log.flushSync();
    this.clearHangTimer();
    this.clearGpuTimer();
    const cause: RecoveryCause = this._pendingCause ?? 'render_gone';
    this._pendingCause = null;
    if (aDetails.reason === 'clean-exit' || this._deps.isQuitting()) {
      return;
    }

    this._deps.recover(cause, aDetails.reason);
  }

  private armGpuTimer(): void {
    this.clearGpuTimer();
    this._gpuTimer = setTimeout(() => {
      this._gpuTimer = null;
      if (this._deps.isQuitting()) {
        return;
      }

      this._deps.log.write('GPU_NOT_RESTORED', { afterMs: GPU_RESTORE_MS });
      this._deps.recover('gpu_gone', 'no WebGL context after ' + GPU_RESTORE_MS + ' ms');
    }, GPU_RESTORE_MS);
  }

  private clearGpuTimer(): void {
    if (this._gpuTimer !== null) {
      clearTimeout(this._gpuTimer);
      this._gpuTimer = null;
    }
  }

  private clearHangTimer(): void {
    if (this._hangTimer !== null) {
      clearTimeout(this._hangTimer);
      this._hangTimer = null;
    }
  }
}

/** `app.getGPUFeatureStatus()`: webgl / webgl2 / gpu_compositing as Chromium decided (software or hardware). */
function gpuStatus(): Fields {
  try {
    const s = app.getGPUFeatureStatus() as unknown as Record<string, string>;
    return { webgl: s['webgl'], webgl2: s['webgl2'], gpu_compositing: s['gpu_compositing'] };
  } catch {
    return {};
  }
}

/** The home directories whose names must not get into the log. */
export function homeDirsToHide(): string[] {
  return [homedir()];
}
