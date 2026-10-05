// Not a port (T5.2). The renderer side of crash.log: errors of the page, lost WebGL context, visibility of the page. Everything goes
// to the main process (`window.at.diag.report`), which writes `<userData>/crash.log`; nothing is written per frame.

export type DiagReport = (name: string, fields?: Record<string, string | number | boolean>) => void;

/** `window`, `document`, a canvas: anything with `addEventListener` (the tests pass an EventTarget). */
export type EventSource = EventTarget;

/** The same message repeated within this time is counted, not reported again (an error inside a render loop). */
const REPEAT_WINDOW_MS = 10_000;
const MAX_KEYS = 50;

function lastSegment(aPath: string): string {
  const cut = Math.max(aPath.lastIndexOf('/'), aPath.lastIndexOf('\\'));
  return cut >= 0 ? aPath.slice(cut + 1) : aPath;
}

/** `error` and `unhandledrejection` of the page. A repeat of the same text within 10 s is added to a counter. */
export function installErrorReporting(aTarget: EventSource, aReport: DiagReport, aNow: () => number = () => Date.now()): void {
  const seen = new Map<string, { at: number; repeats: number }>();
  const send = (aName: string, aText: string, aExtra: Record<string, string | number> = {}): void => {
    const now = aNow();
    const prev = seen.get(aText);
    if (prev !== undefined && now - prev.at < REPEAT_WINDOW_MS) {
      prev.repeats++;
      return;
    }

    if (seen.size >= MAX_KEYS) {
      seen.clear();
    }

    const repeats = prev?.repeats ?? 0;
    seen.set(aText, { at: now, repeats: 0 });
    aReport(aName, { message: aText.slice(0, 500), ...aExtra, ...(repeats > 0 ? { repeatsBefore: repeats } : {}) });
  };

  aTarget.addEventListener('error', (ev) => {
    const e = ev as unknown as { message?: unknown; filename?: unknown; lineno?: unknown; colno?: unknown; error?: unknown };
    const stack = e.error instanceof Error && e.error.stack !== undefined ? e.error.stack : '';
    send('PAGE_ERROR', String(e.message ?? ''), {
      file: lastSegment(String(e.filename ?? '')),
      line: Number(e.lineno ?? 0),
      col: Number(e.colno ?? 0),
      stack: stack.split('\n').slice(0, 6).join(' | '),
    });
  });
  aTarget.addEventListener('unhandledrejection', (ev) => {
    const r = (ev as unknown as { reason?: unknown }).reason;
    send('PAGE_REJECTION', r instanceof Error ? (r.stack?.split('\n').slice(0, 6).join(' | ') ?? r.message) : String(r));
  });
}

/** `webglcontextlost` / `webglcontextrestored` of the canvas (the lost-context count is on every line). */
export function watchCanvas(aCanvas: EventSource, aReport: DiagReport): void {
  let lost = 0;
  aCanvas.addEventListener('webglcontextlost', () => {
    lost++;
    aReport('WEBGL_CONTEXT_LOST', { count: lost });
  });
  aCanvas.addEventListener('webglcontextrestored', () => {
    aReport('WEBGL_CONTEXT_RESTORED', { count: lost });
  });
}

/** `visibilitychange` of the document: a hidden window stops requestAnimationFrame (hypothesis (f) of T5.2). */
export function watchVisibility(aDocument: EventSource & { visibilityState: string }, aReport: DiagReport): void {
  aDocument.addEventListener('visibilitychange', () => {
    aReport('VISIBILITY', { state: aDocument.visibilityState });
  });
}
