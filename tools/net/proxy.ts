// Not a port (T3.7). The latency proxy as a library (the command line is tools/net/latency-proxy.ts): a TCP proxy that
// delays the traffic of both directions independently. Every chunk is released `delay ± jitter` ms after it came in, the
// byte order of a direction is kept (DelayLine).

import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { DelayLine } from './delayLine';

export interface ProxyOptions {
  listenPort: number;
  targetHost: string;
  targetPort: number;
  delayMs: number;
  jitterMs: number;
  /** Address to listen on (default: all interfaces). */
  listenHost?: string;
  onLog?: (aMessage: string) => void;
}

export interface ProxyHandle {
  readonly server: Server;
  /** The port that is listened on (useful with `listenPort: 0`). */
  readonly port: number;
  /** Bytes forwarded: client -> target and target -> client. */
  readonly stats: { up: number; down: number; connections: number };
  close(): Promise<void>;
}

type Chunk = Buffer | null; // null: the end of the stream (FIN)

/** One direction: `from` -> delay -> `to`. */
function pipeDelayed(aFrom: Socket, aTo: Socket, aOpts: ProxyOptions, aCount: (aBytes: number) => void): DelayLine<Chunk> {
  const line = new DelayLine<Chunk>({
    delayMs: aOpts.delayMs,
    jitterMs: aOpts.jitterMs,
    deliver: (chunk) => {
      if (aTo.destroyed) {
        return;
      }

      if (chunk === null) {
        aTo.end();
      } else {
        aCount(chunk.length);
        aTo.write(chunk);
      }
    },
  });
  aFrom.on('data', (d: Buffer) => line.push(d));
  aFrom.on('end', () => line.push(null));
  return line;
}

export function startProxy(aOpts: ProxyOptions): Promise<ProxyHandle> {
  const log = aOpts.onLog ?? (() => undefined);
  const stats = { up: 0, down: 0, connections: 0 };
  const open = new Set<Socket>();
  // (allowHalfOpen: the FIN of one side must reach the other side after the data that is still waiting in the delay line)
  const server = createServer({ allowHalfOpen: true }, (client) => {
    stats.connections++;
    const id = stats.connections;
    log(`#${id} ${client.remoteAddress ?? '?'}:${client.remotePort ?? '?'} -> ${aOpts.targetHost}:${aOpts.targetPort}`);
    const target = createConnection({ host: aOpts.targetHost, port: aOpts.targetPort, allowHalfOpen: true });
    for (const s of [client, target]) {
      s.setNoDelay(true);
      open.add(s);
    }

    // The target is not ready yet: what the client sends waits in its socket (paused until connect).
    client.pause();
    target.once('connect', () => client.resume());
    const up = pipeDelayed(client, target, aOpts, (n) => (stats.up += n));
    const down = pipeDelayed(target, client, aOpts, (n) => (stats.down += n));
    let closed = false;
    const shut = (): void => {
      if (closed) {
        return;
      }

      closed = true;
      up.close();
      down.close();
      client.destroy();
      target.destroy();
      open.delete(client);
      open.delete(target);
      log(`#${id} closed`);
    };
    client.on('error', shut);
    target.on('error', (e) => {
      log(`#${id} target: ${e.message}`);
      shut();
    });
    client.on('close', shut);
    target.on('close', shut);
  });
  return new Promise<ProxyHandle>((resolve, reject) => {
    server.once('error', reject);
    server.listen(aOpts.listenPort, aOpts.listenHost ?? '0.0.0.0', () => {
      server.off('error', reject);
      const addr = server.address();
      resolve({
        server,
        port: typeof addr === 'object' && addr !== null ? addr.port : aOpts.listenPort,
        stats,
        close: () =>
          new Promise<void>((done) => {
            for (const s of open) {
              s.destroy();
            }

            server.close(() => done());
          }),
      });
    });
  });
}

/** `--listen 47030 --target 127.0.0.1:47020 --delay 30 --jitter 15` (`--name=value` works too). */
export function parseProxyArgs(aArgs: readonly string[]): ProxyOptions {
  const values = new Map<string, string>();
  for (let i = 0; i < aArgs.length; i++) {
    const arg = aArgs[i] as string;
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }

    const eq = arg.indexOf('=');
    if (eq >= 0) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const next = aArgs[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }

      values.set(arg.slice(2), next);
      i++;
    }
  }

  for (const k of values.keys()) {
    if (!['listen', 'target', 'delay', 'jitter'].includes(k)) {
      throw new Error(`unknown option --${k}`);
    }
  }

  const num = (aName: string, aDefault: number, aMax: number): number => {
    const raw = values.get(aName);
    if (raw === undefined) {
      return aDefault;
    }

    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > aMax) {
      throw new Error(`--${aName} must be a number 0..${aMax}`);
    }

    return n;
  };
  const listenPort = num('listen', 47030, 65535);
  const target = values.get('target') ?? '127.0.0.1:47020';
  const m = /^(.+):(\d{1,5})$/.exec(target);
  if (m === null || Number(m[2]) < 1 || Number(m[2]) > 65535) {
    throw new Error('--target must be host:port');
  }

  return {
    listenPort,
    targetHost: m[1] as string,
    targetPort: Number(m[2]),
    delayMs: num('delay', 30, 10_000),
    jitterMs: num('jitter', 15, 10_000),
  };
}
