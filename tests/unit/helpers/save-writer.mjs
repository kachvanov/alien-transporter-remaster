// Child process of tests/unit/save.test.ts: writes save.json again and again (a big object, so that a kill
// often lands in the middle of a write) until the test kills it with SIGKILL.
import { JsonDocument } from '../../../electron/save.ts';

const doc = new JsonDocument(process.argv[2]);
const pad = 'x'.repeat(300_000);
let n = 0;
// the first write is done before "ready": the file exists when the test kills the process
await doc.set('alientransporter', { n: n++, pad });
console.log('ready');
for (;;) {
  await doc.set('alientransporter', { n: n++, pad });
}
