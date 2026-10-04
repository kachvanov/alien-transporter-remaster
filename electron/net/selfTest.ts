// Not a port (T3.7). The TEST button of the Host screen (docs/03 §8): opens a TCP connection to every address of this
// machine on the port of the host. An address that connects shows that the server listens on that interface, not only on
// loopback. (A connection to one's own address does not go through the firewall, so this does not prove that other
// machines get in: for that `Test-NetConnection <ip> -Port 47020` from the other machine, see docs/03 §8.)
import { connect } from 'node:net';

export interface SelfTestEntry {
  address: string;
  ok: boolean;
  /** `ECONNREFUSED`, `timeout`, ... */
  error?: string;
}

export interface SelfTestResult {
  /** Every address connected (and there was at least one). */
  ok: boolean;
  port: number;
  results: SelfTestEntry[];
}

/** Tries one address. */
export function probeTcp(aAddress: string, aPort: number, aTimeoutMs: number): Promise<SelfTestEntry> {
  return new Promise<SelfTestEntry>((resolve) => {
    const socket = connect({ host: aAddress, port: aPort });
    let done = false;
    const finish = (aEntry: SelfTestEntry): void => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(aEntry);
      }
    };
    const timer = setTimeout(() => finish({ address: aAddress, ok: false, error: 'timeout' }), aTimeoutMs);
    socket.once('connect', () => finish({ address: aAddress, ok: true }));
    socket.once('error', (e: NodeJS.ErrnoException) => finish({ address: aAddress, ok: false, error: e.code ?? e.message }));
  });
}

/** `aAddresses`: what the Host screen shows (IPv4 of the machine, no loopback). */
export async function selfTest(aAddresses: readonly string[], aPort: number, aTimeoutMs = 2000): Promise<SelfTestResult> {
  const results = await Promise.all(aAddresses.map((a) => probeTcp(a, aPort, aTimeoutMs)));
  return { ok: results.length > 0 && results.every((r) => r.ok), port: aPort, results };
}
