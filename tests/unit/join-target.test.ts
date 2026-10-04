import { describe, expect, it } from 'vitest';
import { failureFromHash, joinFailureOf, joinHash, localHash, resolveJoinTarget } from '../../src/app/joinTarget';

describe('joinTarget (the Join screen restarts the renderer in the client mode)', () => {
  it('joinHash -> resolveJoinTarget round trip', () => {
    expect(resolveJoinTarget(undefined, joinHash('192.168.31.146', 47020))).toEqual({ host: '192.168.31.146', port: 47020 });
    expect(resolveJoinTarget(undefined, joinHash('10.0.0.2', 5000))).toEqual({ host: '10.0.0.2', port: 5000 });
  });

  it('the hash wins over --join', () => {
    expect(resolveJoinTarget('1.1.1.1', '#join=2.2.2.2:47020')).toEqual({ host: '2.2.2.2', port: 47020 });
  });

  it('--join works without a hash, #local switches it off', () => {
    expect(resolveJoinTarget('1.1.1.1:47020', '')).toEqual({ host: '1.1.1.1', port: 47020 });
    expect(resolveJoinTarget('1.1.1.1', '#local')).toBeNull();
  });

  it('no target, or a bad one', () => {
    expect(resolveJoinTarget(undefined, '')).toBeNull();
    expect(resolveJoinTarget('nonsense', '')).toBeNull();
    expect(resolveJoinTarget(undefined, '#join=999.1.1.1')).toBeNull();
    expect(resolveJoinTarget('1.1.1.1', '#join=bad')).toBeNull();
  });
});

describe('joinTarget: the way back to JoinScreen', () => {
  it('a failure survives the reload in the hash and switches --join off', () => {
    for (const f of ['failed', 'full', 'version', 'lost'] as const) {
      expect(failureFromHash(localHash(f))).toBe(f);
      expect(resolveJoinTarget('1.1.1.1', localHash(f))).toBeNull();
    }
    expect(failureFromHash(localHash(null))).toBeNull();
    expect(failureFromHash('#local:bogus')).toBeNull();
    expect(failureFromHash('')).toBeNull();
  });

  it('session reasons map to what JoinScreen shows', () => {
    expect(joinFailureOf('rejected_full')).toBe('full');
    expect(joinFailureOf('rejected_version')).toBe('version');
    expect(joinFailureOf('connect_failed')).toBe('failed');
    expect(joinFailureOf('handshake_timeout')).toBe('failed');
    expect(joinFailureOf('connection_lost')).toBe('lost');
    expect(joinFailureOf('host_quit')).toBe('lost');
    expect(joinFailureOf('left')).toBeNull();
    expect(joinFailureOf(null)).toBeNull();
  });
});
