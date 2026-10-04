// Not a port (T3.7). Checks a host of the LAN game from another machine, without the game (the command line is
// tools/net/host-probe.ts): opens the WebSocket, says `hello`, counts the Frames for a few seconds and measures the round
// trip with ws pings. It answers the question "does the other machine get in?" (firewall, Wi-Fi isolation, wrong address)
// and gives the numbers for docs/05-verification.md §8-§9 (Frames per second, KB/s, RTT). The slot of the client is taken
// for the time of the probe, so run it when the real client is not connected.
import WebSocket from 'ws';
import { encodeInput, encodeMessage, PROTO_VERSION } from '../../src/net/protocol';

export interface ProbeOptions {
  host: string;
  port: number;
  /** `manifest.buildHash` of the host: another one makes the host answer `reject: version` (still proves the way is open). */
  buildHash: string;
  /** How long to listen to the Frames, ms. */
  durationMs?: number;
  /** Time to open the socket, ms. */
  connectTimeoutMs?: number;
}

export interface ProbeResult {
  /** `ok`: welcome and Frames; `rejected_*`: the host answered, but refused; `failed`: no way to the host. */
  outcome: 'ok' | 'rejected_version' | 'rejected_full' | 'rejected_other' | 'failed';
  /** What went wrong, for the person at the keyboard. */
  message: string;
  hostName?: string;
  frames: number;
  bytes: number;
  framesPerSec: number;
  kbPerSec: number;
  /** Round trips of `ws.ping()` (ms): average and the worst. */
  rttAvgMs: number | null;
  rttMaxMs: number | null;
}

const EMPTY: Omit<ProbeResult, 'outcome' | 'message'> = {
  frames: 0,
  bytes: 0,
  framesPerSec: 0,
  kbPerSec: 0,
  rttAvgMs: null,
  rttMaxMs: null,
};

export function probeHost(aOpts: ProbeOptions): Promise<ProbeResult> {
  const durationMs = aOpts.durationMs ?? 5000;
  const connectTimeoutMs = aOpts.connectTimeoutMs ?? 5000;
  return new Promise<ProbeResult>((resolve) => {
    const ws = new WebSocket(`ws://${aOpts.host}:${aOpts.port}`, { handshakeTimeout: connectTimeoutMs, perMessageDeflate: false });
    let frames = 0;
    let bytes = 0;
    let hostName: string | undefined;
    let welcomed = false;
    let startedAt = 0;
    let done = false;
    const rtts: number[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    let pingSentAt = 0;

    const finish = (aOutcome: ProbeResult['outcome'], aMessage: string): void => {
      if (done) {
        return;
      }

      done = true;
      for (const t of timers) {
        clearInterval(t);
        clearTimeout(t);
      }

      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeMessage({ t: 'bye' }));
        }

        ws.close();
      } catch {
        // (already closed)
      }

      const seconds = startedAt > 0 ? Math.max((performance.now() - startedAt) / 1000, 0.001) : 1;
      resolve({
        ...EMPTY,
        outcome: aOutcome,
        message: aMessage,
        hostName,
        frames,
        bytes,
        framesPerSec: frames / seconds,
        kbPerSec: bytes / 1024 / seconds,
        rttAvgMs: rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null,
        rttMaxMs: rtts.length > 0 ? Math.max(...rtts) : null,
      });
    };

    ws.on('open', () => {
      ws.send(
        encodeMessage({
          t: 'hello',
          proto: PROTO_VERSION,
          buildHash: aOpts.buildHash,
          name: 'host-probe',
          ship: { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 },
        }),
      );
    });
    ws.on('pong', () => {
      if (pingSentAt > 0) {
        rtts.push(performance.now() - pingSentAt);
        pingSentAt = 0;
      }
    });
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (welcomed) {
          frames++;
          bytes += data.length;
        }

        return;
      }

      let msg: { t?: string; reason?: string; hostName?: string };
      try {
        msg = JSON.parse(data.toString()) as typeof msg;
      } catch {
        return;
      }

      if (msg.t === 'welcome') {
        welcomed = true;
        hostName = msg.hostName;
        startedAt = performance.now();
        // the heartbeat of docs/03 §4 (the host drops a client that is silent), and a ping every 250 ms
        let seq = 0;
        timers.push(setInterval(() => ws.send(encodeInput({ seq: ++seq, bits: 0 })), 1000 / 35));
        timers.push(
          setInterval(() => {
            if (pingSentAt === 0 && ws.readyState === WebSocket.OPEN) {
              pingSentAt = performance.now();
              ws.ping();
            }
          }, 250),
        );
        timers.push(setTimeout(() => finish('ok', 'the host answers'), durationMs));
      } else if (msg.t === 'reject') {
        const reason = msg.reason ?? '?';
        if (reason === 'version') {
          finish('rejected_version', 'the host answers, but it is another build of the game (buildHash differs)');
        } else if (reason === 'full') {
          finish('rejected_full', 'the host answers, but it already has a player');
        } else {
          finish('rejected_other', `the host refused: ${reason}`);
        }
      } else if (msg.t === 'bye') {
        finish(welcomed ? 'ok' : 'rejected_other', 'the host said bye: ' + (msg.reason ?? '?'));
      }
    });
    ws.on('close', () => finish(welcomed ? 'ok' : 'failed', welcomed ? 'the host closed the connection' : 'the connection was closed before the welcome'));
    ws.on('error', (e: NodeJS.ErrnoException) => {
      const code = e.code ?? '';
      const hint =
        code === 'ECONNREFUSED'
          ? 'nothing listens on that address and port (the host is not started, or a wrong port)'
          : code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ETIMEDOUT' || /timed out|timeout/i.test(e.message)
            ? 'no way to the host: a wrong address, another network, Wi-Fi client isolation, or the firewall of the host drops the port'
            : e.message;
      finish('failed', `${code || 'error'}: ${hint}`);
    });
  });
}
