// Not a port (T5.2). Where does the simulation grow? Plays a golden replay (then idle input), takes two heap snapshots A and B
// (`--a=` and `--b=` ticks, after a full GC) and prints what grew between them, by the kind and the name of the heap objects.
//
//   NODE_OPTIONS=--expose-gc npx tsx tools/perf/heap-diff.ts --replay=level11-barrels --a=21000 --b=84000 [--top=25]
//
// Reading the output: `count` and `KB` are the change of the number and the size of the objects of that kind between A and B.
// Constructor names (`Object`, `Array`, `(array)`) are generic: look at the biggest growth of the named classes first.

import { Session } from 'node:inspector/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { GameLoop } from '../../src/sim/GameLoop';
import { replayInput } from '../../src/sim/replay';
import { makeReplayState } from '../../src/sim/replayState';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import { loadReplays } from '../../tests/golden/registry';

function arg(aName: string, aDefault: string): string {
  const p = '--' + aName + '=';
  const found = process.argv.find((a) => a.startsWith(p));
  return found !== undefined ? found.slice(p.length) : aDefault;
}

interface Kind {
  count: number;
  size: number;
}

async function snapshot(aSession: Session): Promise<Map<string, Kind>> {
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  gc?.();
  gc?.();
  let text = '';
  const onChunk = (m: { params: { chunk: string } }): void => {
    text += m.params.chunk;
  };
  aSession.on('HeapProfiler.addHeapSnapshotChunk', onChunk as never);
  await aSession.post('HeapProfiler.takeHeapSnapshot', { reportProgress: false } as never);
  aSession.removeListener('HeapProfiler.addHeapSnapshotChunk', onChunk as never);
  const snap = JSON.parse(text) as {
    snapshot: { meta: { node_fields: string[]; node_types: (string | string[])[] } };
    nodes: number[];
    strings: string[];
  };
  const fields = snap.snapshot.meta.node_fields;
  const stride = fields.length;
  const iType = fields.indexOf('type');
  const iName = fields.indexOf('name');
  const iSize = fields.indexOf('self_size');
  const types = snap.snapshot.meta.node_types[0] as string[];
  const kinds = new Map<string, Kind>();
  for (let i = 0; i < snap.nodes.length; i += stride) {
    const type = types[snap.nodes[i + iType] as number] as string;
    if (type === 'hidden' || type === 'synthetic') continue;
    const name = type === 'string' || type === 'concatenated string' || type === 'sliced string' ? '(' + type + ')' : (snap.strings[snap.nodes[i + iName] as number] as string).slice(0, 60);
    const key = type + ' ' + name;
    const k = kinds.get(key) ?? { count: 0, size: 0 };
    k.count++;
    k.size += snap.nodes[i + iSize] as number;
    kinds.set(key, k);
  }
  return kinds;
}

async function main(): Promise<void> {
  const name = arg('replay', 'level11-barrels');
  const a = Number(arg('a', '21000'));
  const b = Number(arg('b', '84000'));
  const top = Number(arg('top', '25'));
  const item = loadReplays().find((r) => r.name === name);
  if (item === undefined) throw new Error('no such replay: ' + name);
  const replay = item.replay;
  const loop = new GameLoop({
    assets: new FileAssetSource(process.env['ASSETS_DIR'] ?? resolve(process.cwd(), 'assets'), (p) => readFile(p)),
    save: new MemorySaveStorage(),
    seed: replay.seed,
    host: { onFrame: () => undefined, openExternal: () => undefined, log: () => undefined },
    initialState: makeReplayState(replay),
    clock: () => 0,
  });
  await loop.init();
  const input = replayInput({ ...replay, ticks: Math.max(replay.ticks, b) });
  const session = new Session();
  session.connect();
  let before: Map<string, Kind> | null = null;
  for (let i = 0; i <= b; i++) {
    if (i === a) before = await snapshot(session);
    if (i === b) {
      const after = await snapshot(session);
      const rows: { key: string; dCount: number; dSize: number }[] = [];
      for (const [key, k] of after) {
        const o = before?.get(key) ?? { count: 0, size: 0 };
        rows.push({ key, dCount: k.count - o.count, dSize: k.size - o.size });
      }
      rows.sort((x, y) => y.dSize - x.dSize);
      console.log(`${name}: growth between tick ${a} and ${b} (${((b - a) / 35 / 60).toFixed(0)} min of game), by size`);
      for (const r of rows.slice(0, top)) console.log(`  ${(r.dSize / 1024).toFixed(0).padStart(8)} KB  ${String(r.dCount).padStart(8)} objects  ${r.key}`);
      rows.sort((x, y) => y.dCount - x.dCount);
      console.log('by count');
      for (const r of rows.slice(0, top)) console.log(`  ${(r.dSize / 1024).toFixed(0).padStart(8)} KB  ${String(r.dCount).padStart(8)} objects  ${r.key}`);
      break;
    }
    loop.tick(input(i));
  }
}

void main();
