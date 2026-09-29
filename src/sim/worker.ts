// Scaffold sim worker (T0.1): posts a `tick` every 1000/35 ms.
// The real fixed-step GameLoop replaces this in a later task (docs/01-architecture.md §3).

interface WorkerScope {
  postMessage(message: unknown): void;
}

// Minimal local typing keeps this file independent of the DOM/WebWorker lib merge.
const scope = self as unknown as WorkerScope;

let n = 0;
setInterval(() => {
  n++;
  scope.postMessage({ type: 'tick', n });
}, 1000 / 35);
