// Not a port. T4.3: the top of the self time of a V8 .cpuprofile by function.
//   node --import tsx --cpu-prof --cpu-prof-dir=<dir> tools/perf/profile.ts --ticks=8000
//   node tools/perf/cpuprof-top.mjs <dir>/<file>.cpuprofile [N] [callersOf=<function name>|inclusive]
// With `callersOf=name` the self time of that function is listed by its callers (two levels up).
import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) {
  for (const c of n.children ?? []) parent.set(c, n.id);
}

const self = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i];
  self.set(id, (self.get(id) ?? 0) + profile.timeDeltas[i]);
}

function nameOf(aId) {
  const cf = nodes.get(aId).callFrame;
  const url = cf.url.replace(/^.*\/(src|node_modules|tools)\//, '$1/');
  return `${cf.functionName || '(anonymous)'} ${url}:${cf.lineNumber + 1}`;
}

// `inclusive`: the time of the function with everything it calls (a function that is on the stack twice counts once per sample)
if (process.argv.includes('inclusive')) {
  const incl = new Map();
  let all = 0;
  for (const [id, t] of self) {
    all += t;
    const seen = new Set();
    for (let n = id; n !== undefined; n = parent.get(n)) {
      const key = nameOf(n);
      if (seen.has(key)) continue;
      seen.add(key);
      incl.set(key, (incl.get(key) ?? 0) + t);
    }
  }

  const rows = [...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[3]) || 40);
  for (const [key, t] of rows) console.log(((t / all) * 100).toFixed(1).padStart(5) + '%  ' + key);
  process.exit(0);
}

const callersArg = process.argv.find((a) => a.startsWith('callersOf='));
let total = 0;
for (const t of self.values()) total += t;
const byKey = new Map();
if (callersArg !== undefined) {
  const wanted = callersArg.slice('callersOf='.length);
  for (const [id, t] of self) {
    if (nodes.get(id).callFrame.functionName !== wanted) continue;
    const p1 = parent.get(id);
    const p2 = p1 === undefined ? undefined : parent.get(p1);
    const key = (p1 === undefined ? '-' : nameOf(p1)) + '  <-  ' + (p2 === undefined ? '-' : nameOf(p2));
    byKey.set(key, (byKey.get(key) ?? 0) + t);
  }
} else {
  for (const [id, t] of self) byKey.set(nameOf(id), (byKey.get(nameOf(id)) ?? 0) + t);
}

const top = [...byKey].sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[3]) || 40);
for (const [key, t] of top) console.log(((t / total) * 100).toFixed(1).padStart(5) + '%  ' + key);
