// Where the client mode connects to. Two sources: `--join=ip[:port]` (command line) and `#join=ip:port` in the URL hash,
// which the Join screen sets before it restarts the renderer (OnlineController.startClient). `#local` means "the session is
// over: the local game"; it switches `--join` off. `#local:<reason>` is the same, and JoinScreen opens with that failure.
import type { JoinFailure } from '../game/online/OnlineBridge';
import { parseAddress, type Address } from '../net/protocol';
import type { SessionCloseReason } from '../net/clientSession';

const JOIN_PREFIX = '#join=';
const LOCAL_HASH = '#local';
const FAILURES: readonly JoinFailure[] = ['failed', 'full', 'version', 'lost'];

/** The hash that makes the renderer start as a network client of `aHost:aPort`. */
export function joinHash(aHost: string, aPort: number): string {
  return JOIN_PREFIX + aHost + ':' + aPort;
}

/** null: the local game. The hash wins over the flag; a bad address in the hash is not repaired by the flag. */
export function resolveJoinTarget(aFlagJoin: string | undefined, aHash: string): Address | null {
  if (aHash.startsWith(JOIN_PREFIX)) {
    return parseAddress(aHash.slice(JOIN_PREFIX.length));
  }
  if (aFlagJoin !== undefined && !aHash.startsWith(LOCAL_HASH)) {
    return parseAddress(aFlagJoin);
  }
  return null;
}

/** What JoinScreen tells for a session that ended: null for a normal end (the player left himself). */
export function joinFailureOf(aReason: SessionCloseReason | null): JoinFailure | null {
  switch (aReason) {
    case null:
    case 'left':
      return null;
    case 'rejected_full':
      return 'full';
    case 'rejected_version':
      return 'version';
    case 'connect_failed':
    case 'handshake_timeout':
    case 'rejected_busy':
      return 'failed';
    default:
      return 'lost'; // host_quit, timeout, connection_lost, protocol_error
  }
}

/** The hash of the local game, with the failure for JoinScreen when there is one. */
export function localHash(aFailure: JoinFailure | null): string {
  return aFailure === null ? LOCAL_HASH : LOCAL_HASH + ':' + aFailure;
}

/** The failure that `localHash` carried (null: none, or not ours). */
export function failureFromHash(aHash: string): JoinFailure | null {
  if (!aHash.startsWith(LOCAL_HASH + ':')) return null;
  const f = aHash.slice(LOCAL_HASH.length + 1);
  return FAILURES.find((x) => x === f) ?? null;
}

/** T5.2: `#local:crashed` is set by the main process when it replaces a window that crashed or hung; the menu says so once. */
export function noticeFromHash(aHash: string): 'crashed' | null {
  return aHash === LOCAL_HASH + ':crashed' ? 'crashed' : null;
}
