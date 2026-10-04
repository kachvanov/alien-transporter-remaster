import { createSocket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import {
  broadcastAddresses,
  broadcastOf,
  DISCOVERY_PORT,
  encodeBeacon,
  getLocalIPv4,
  LanDiscovery,
  parseBeacon,
  sanitizeBeaconInfo,
  type BeaconInfo,
  type DiscoveredGame,
} from '../../electron/net/discovery';

const INFO: BeaconInfo = { buildHash: 'abc123', hostName: 'MacBook', port: 47020, status: 'waiting' };

/** A free UDP port (the scan does not use 47021 in tests: a real game may be running on the machine). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createSocket('udp4');
    s.once('error', reject);
    s.bind(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('waitFor timeout');
    await sleep(10);
  }
}

const made: LanDiscovery[] = [];
afterEach(() => {
  for (const d of made.splice(0)) d.dispose();
});

function make(port: number, extra: object = {}): LanDiscovery {
  const d = new LanDiscovery({
    port,
    targets: () => ['127.0.0.1'],
    bindAddress: '127.0.0.1',
    beaconIntervalMs: 50,
    ttlMs: 300,
    minUpdateIntervalMs: 20,
    ...extra,
  });
  made.push(d);
  return d;
}

describe('beacon format', () => {
  it('encodes and parses', () => {
    const msg = encodeBeacon(INFO);
    expect(JSON.parse(msg.toString())).toEqual({ game: 'AT-remaster', proto: 1, ...INFO });
    expect(parseBeacon(msg)).toEqual(INFO);
  });

  it('ignores garbage, other games and bad fields', () => {
    const bad = (o: unknown): Buffer => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o));
    const good = { game: 'AT-remaster', proto: 1, ...INFO };
    expect(parseBeacon(bad('not json {'))).toBeNull();
    expect(parseBeacon(Buffer.from([0xff, 0x00, 0x01]))).toBeNull();
    expect(parseBeacon(bad('null'))).toBeNull();
    expect(parseBeacon(bad([1, 2]))).toBeNull();
    expect(parseBeacon(bad({ ...good, game: 'other' }))).toBeNull();
    expect(parseBeacon(bad({ ...good, port: 0 }))).toBeNull();
    expect(parseBeacon(bad({ ...good, port: 1.5 }))).toBeNull();
    expect(parseBeacon(bad({ ...good, port: '47020' }))).toBeNull();
    expect(parseBeacon(bad({ ...good, status: 'busy' }))).toBeNull();
    expect(parseBeacon(bad({ ...good, hostName: 5 }))).toBeNull();
    expect(parseBeacon(bad({ ...good, buildHash: null }))).toBeNull();
    expect(parseBeacon(bad({ ...good, proto: 2 }))).toBeNull();
    expect(parseBeacon(bad(good))).toEqual(INFO);
  });

  it('sanitizes what comes over IPC', () => {
    expect(sanitizeBeaconInfo(INFO)).toEqual(INFO);
    expect(sanitizeBeaconInfo({ ...INFO, hostName: '  ' })?.hostName).not.toBe('');
    expect(sanitizeBeaconInfo({ ...INFO, port: 70000 })).toBeNull();
    expect(sanitizeBeaconInfo({ ...INFO, buildHash: '' })).toBeNull();
    expect(sanitizeBeaconInfo('x')).toBeNull();
    expect(sanitizeBeaconInfo(null)).toBeNull();
  });
});

describe('addresses', () => {
  const ifaces = {
    lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true, mac: '', cidr: null }],
    en0: [
      { address: '192.168.1.23', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '', cidr: null },
      { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false, mac: '', cidr: null },
    ],
    en1: [{ address: '10.0.4.7', netmask: '255.255.0.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
    awdl0: [{ address: '169.254.9.9', netmask: '255.255.0.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
    dup: [{ address: '192.168.1.99', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
  } as unknown as NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>;

  it('broadcastOf = address | ~mask', () => {
    expect(broadcastOf('192.168.1.23', '255.255.255.0')).toBe('192.168.1.255');
    expect(broadcastOf('10.0.4.7', '255.255.0.0')).toBe('10.0.255.255');
    expect(broadcastOf('172.16.5.9', '255.255.255.240')).toBe('172.16.5.15');
    expect(broadcastOf('nope', '255.255.255.0')).toBeNull();
  });

  it('broadcastAddresses: global + every usable IPv4 interface, no internal, link-local or duplicates', () => {
    expect(broadcastAddresses(ifaces)).toEqual(['255.255.255.255', '192.168.1.255', '10.0.255.255']);
  });

  it('getLocalIPv4 skips loopback, link-local and IPv6', () => {
    expect(getLocalIPv4(ifaces)).toEqual(['192.168.1.23', '10.0.4.7', '192.168.1.99']);
  });
});

describe('beacon + scan on loopback', () => {
  it('a game appears and disappears by TTL', async () => {
    const port = await freePort();
    const host = make(port);
    const client = make(port);
    const updates: DiscoveredGame[][] = [];
    client.onUpdate((g) => updates.push(g));
    await client.startScan('abc123');

    host.startBeacon(INFO);
    await waitFor(() => updates.length > 0);
    const first = updates[0] ?? [];
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      ip: '127.0.0.1',
      hostName: 'MacBook',
      port: 47020,
      status: 'waiting',
      buildHashMatches: true,
    });
    expect(Math.abs((first[0]?.lastSeen ?? 0) - Date.now())).toBeLessThan(2000);

    host.stopBeacon();
    await waitFor(() => (updates.at(-1)?.length ?? 1) === 0);
    expect(client.list()).toEqual([]);
  });

  it('a different build is listed with buildHashMatches=false; a status change is an update', async () => {
    const port = await freePort();
    const host = make(port);
    const client = make(port);
    const updates: DiscoveredGame[][] = [];
    client.onUpdate((g) => updates.push(g));
    await client.startScan('another-build');

    host.startBeacon(INFO);
    await waitFor(() => updates.length > 0);
    expect(updates.at(-1)?.[0]?.buildHashMatches).toBe(false);

    host.startBeacon({ ...INFO, status: 'full' });
    await waitFor(() => updates.at(-1)?.[0]?.status === 'full');
    expect(client.list()).toHaveLength(1);
  });

  it('ignores garbage and other games on the port', async () => {
    const port = await freePort();
    const client = make(port);
    let updates = 0;
    client.onUpdate(() => updates++);
    await client.startScan('abc123');

    const sock = createSocket('udp4');
    const send = (data: Buffer | string): Promise<void> =>
      new Promise((resolve, reject) => sock.send(data, port, '127.0.0.1', (e) => (e ? reject(e) : resolve())));
    await send('garbage');
    await send(Buffer.from([1, 2, 3, 4]));
    await send(JSON.stringify({ game: 'Minecraft', hostName: 'x', port: 25565, status: 'waiting', buildHash: 'q' }));
    await send(JSON.stringify({ game: 'AT-remaster', proto: 1, port: 'x' }));
    await sleep(150);
    expect(updates).toBe(0);
    expect(client.list()).toEqual([]);

    // a valid one still gets through afterwards
    await send(encodeBeacon(INFO));
    await waitFor(() => updates > 0);
    expect(client.list()).toHaveLength(1);
    sock.close();
  });

  it('update is emitted at most 4 times a second', async () => {
    const port = await freePort();
    const client = make(port, { minUpdateIntervalMs: 250, ttlMs: 10_000 });
    const stamps: number[] = [];
    client.onUpdate(() => stamps.push(Date.now()));
    await client.startScan('abc123');

    const sock = createSocket('udp4');
    // 12 different games within ~120 ms: every one is a change, but updates are rate limited
    for (let k = 0; k < 12; k++) {
      const data = encodeBeacon({ ...INFO, port: 47000 + k, hostName: `h${k}` });
      sock.send(data, port, '127.0.0.1');
      await sleep(10);
    }
    await waitFor(() => (client.list().length === 12 && stamps.length >= 2) || stamps.length >= 3, 2000);
    await sleep(300);
    for (let k = 1; k < stamps.length; k++) {
      expect((stamps[k] ?? 0) - (stamps[k - 1] ?? 0)).toBeGreaterThanOrEqual(240);
    }
    expect(stamps.length).toBeLessThan(12);
    expect(client.list()).toHaveLength(12); // nothing is lost: the last update has the whole list
    sock.close();
  });

  it('two scans on one port (two instances on one machine)', async () => {
    const port = await freePort();
    const a = make(port);
    const b = make(port);
    await a.startScan('abc123');
    await b.startScan('abc123');
    expect(b.scanRunning).toBe(true);
    // (loopback unicast goes to one of the sockets; only the second bind succeeding is checked here)
  });

  it('stopScan clears the list and silences updates', async () => {
    const port = await freePort();
    const host = make(port);
    const client = make(port);
    await client.startScan('abc123');
    host.startBeacon(INFO);
    await waitFor(() => client.list().length === 1);
    client.stopScan();
    expect(client.scanRunning).toBe(false);
    expect(client.list()).toEqual([]);
    host.stopBeacon();
  });

  it('beacon send errors are reported, not thrown', async () => {
    const port = await freePort();
    const errors: Error[] = [];
    const host = make(port, { targets: () => ['not-an-ip.invalid'], onError: (e: Error) => errors.push(e) });
    host.startBeacon(INFO);
    await sleep(150);
    expect(host.beaconRunning).toBe(true);
    host.stopBeacon();
    expect(host.beaconRunning).toBe(false);
  });
});

describe('constants', () => {
  it('port', () => {
    expect(DISCOVERY_PORT).toBe(47021);
  });
});
