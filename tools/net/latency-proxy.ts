// Not a port (T3.7). A TCP proxy that delays the traffic of both directions independently, to try the LAN game under
// a bad network (docs/05-verification.md §8):
//
//   npx tsx tools/net/latency-proxy.ts --listen 47030 --target 127.0.0.1:47020 --delay 30 --jitter 15
//
// then the client joins `127.0.0.1:47030`. Every chunk is released `delay ± jitter` ms after it came in, the byte order
// of a direction is kept. The UDP beacons are not proxied: join by the address. The code is in proxy.ts (the tests use it).
import { parseProxyArgs, startProxy, type ProxyOptions } from './proxy';

function main(): void {
  let opts: ProxyOptions;
  try {
    opts = parseProxyArgs(process.argv.slice(2));
  } catch (e) {
    console.error('latency-proxy: ' + (e as Error).message);
    console.error('usage: tsx tools/net/latency-proxy.ts --listen 47030 --target 127.0.0.1:47020 --delay 30 --jitter 15');
    process.exit(2);
  }

  opts.onLog = (m) => console.info('[proxy] ' + m);
  startProxy(opts).then(
    (h) => {
      console.info(
        `[proxy] listening on :${h.port} -> ${opts.targetHost}:${opts.targetPort}, delay ${opts.delayMs} ± ${opts.jitterMs} ms each way`,
      );
      process.on('SIGINT', () => {
        console.info(`[proxy] up ${h.stats.up} B, down ${h.stats.down} B, ${h.stats.connections} connection(s)`);
        void h.close().then(() => process.exit(0));
      });
    },
    (e: Error) => {
      console.error('latency-proxy: ' + e.message);
      process.exit(1);
    },
  );
}

main();
