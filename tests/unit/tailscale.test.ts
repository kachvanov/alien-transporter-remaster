import { createSocket } from 'node:dgram';
import type { NetworkInterfaceInfo } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  broadcastAddresses,
  encodeBeacon,
  encodeProbe,
  getLocalIPv4,
  isProbe,
  LanDiscovery,
  type BeaconInfo,
  type DiscoveredGame,
} from '../../electron/net/discovery';
import {
  defaultRunCommand,
  isPointToPoint,
  isTailscaleAddress,
  MAX_PEERS,
  parseTailscaleStatus,
  prefixLength,
  tailscaleCliCandidates,
  tailscaleLocalAddresses,
  TailscalePeers,
  type RunCommand,
} from '../../electron/net/tailscale';

const INFO: BeaconInfo = { buildHash: 'abc123', hostName: 'MacBook', port: 47020, status: 'waiting' };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('waitFor timeout');
    await sleep(10);
  }
}

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

/** What `tailscale status --json` looks like (trimmed to the fields that matter). */
const STATUS = JSON.stringify({
  Version: '1.74.1',
  BackendState: 'Running',
  Self: { HostName: 'my-mac', Online: true, TailscaleIPs: ['100.100.23.23', 'fd7a:115c:a1e0::1'] },
  Peer: {
    'nodekey:aaa': {
      HostName: 'friend-pc',
      DNSName: 'friend-pc.tail1234.ts.net.',
      OS: 'windows',
      Online: true,
      TailscaleIPs: ['100.101.5.6', 'fd7a:115c:a1e0::2'],
    },
    'nodekey:bbb': { HostName: 'offline-phone', Online: false, TailscaleIPs: ['100.90.1.1'] },
    'nodekey:ccc': { HostName: 'v6-only', Online: true, TailscaleIPs: ['fd7a:115c:a1e0::3'] },
    'nodekey:ddd': { HostName: 'bogus', Online: true, TailscaleIPs: ['8.8.8.8', 'not-an-ip'] },
    'nodekey:eee': { HostName: 'nas', Online: true, TailscaleIPs: ['100.64.0.7'] },
    'nodekey:fff': { Online: true },
    'nodekey:ggg': null,
  },
});

describe('address classification', () => {
  it('100.64.0.0/10 is Tailscale, the rest is not', () => {
    for (const ip of ['100.64.0.0', '100.100.23.23', '100.127.255.255']) expect(isTailscaleAddress(ip)).toBe(true);
    for (const ip of ['100.63.255.255', '100.128.0.0', '10.0.0.1', '192.168.1.5', '8.8.8.8', '100.100.1', '100.100.1.1.1', 'x', '', '100.100.1.256', '100.100.1.-1']) {
      expect(isTailscaleAddress(ip)).toBe(false);
    }
  });

  it('prefixLength / isPointToPoint', () => {
    expect(prefixLength('255.255.255.255')).toBe(32);
    expect(prefixLength('255.255.255.0')).toBe(24);
    expect(prefixLength('255.255.255.254')).toBe(31);
    expect(prefixLength('0.0.0.0')).toBe(0);
    expect(prefixLength('255.0.255.0')).toBeNull();
    expect(prefixLength('nope')).toBeNull();
    expect(isPointToPoint({ netmask: '255.255.255.255' })).toBe(true);
    expect(isPointToPoint({ netmask: '255.255.255.254' })).toBe(true);
    expect(isPointToPoint({ netmask: '255.255.255.252' })).toBe(false);
    expect(isPointToPoint({ netmask: '255.255.255.0' })).toBe(false);
    expect(isPointToPoint({ netmask: 'nope' })).toBe(false);
  });

  const ifaces = {
    lo0: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true, mac: '', cidr: null }],
    en0: [{ address: '192.168.1.23', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '', cidr: null }],
    // macOS: Tailscale is a utun with a /32
    utun4: [
      { address: '100.100.23.23', netmask: '255.255.255.255', family: 'IPv4', internal: false, mac: '', cidr: null },
      { address: 'fd7a:115c:a1e0::1', netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', family: 'IPv6', internal: false, mac: '', cidr: null },
    ],
  } as unknown as NodeJS.Dict<NetworkInterfaceInfo[]>;

  it('the broadcast list has no "broadcast" of the /32 Tailscale interface; the LAN one is unchanged', () => {
    expect(broadcastAddresses(ifaces)).toEqual(['255.255.255.255', '192.168.1.255']);
  });

  it('the Tailscale address is still shown on the Host screen', () => {
    expect(getLocalIPv4(ifaces)).toEqual(['192.168.1.23', '100.100.23.23']);
  });

  it('tailscaleLocalAddresses finds the 100.64/10 addresses only', () => {
    expect(tailscaleLocalAddresses(ifaces)).toEqual(['100.100.23.23']);
    expect(tailscaleLocalAddresses({})).toEqual([]);
  });
});

describe('parseTailscaleStatus', () => {
  it('online peers with a Tailscale IPv4 only, Self excluded', () => {
    expect(parseTailscaleStatus(STATUS)).toEqual([
      { ip: '100.101.5.6', hostName: 'friend-pc' },
      { ip: '100.64.0.7', hostName: 'nas' },
    ]);
  });

  it('garbage, wrong shapes and an empty tailnet give []', () => {
    for (const text of ['', 'not json', 'null', '[]', '42', '{}', '{"Peer":null}', '{"Peer":[1,2]}', '{"Peer":{"a":{"Online":true,"TailscaleIPs":"100.1.1.1"}}}']) {
      expect(parseTailscaleStatus(text)).toEqual([]);
    }
  });

  it('is capped and has no duplicates', () => {
    const peer: Record<string, unknown> = {};
    for (let k = 0; k < 200; k++) peer[`n${k}`] = { Online: true, TailscaleIPs: [`100.100.${k >> 8}.${k & 255}`] };
    peer['dup'] = { Online: true, TailscaleIPs: ['100.100.0.0'] };
    const peers = parseTailscaleStatus(JSON.stringify({ Peer: peer }));
    expect(peers).toHaveLength(MAX_PEERS);
    expect(new Set(peers.map((p) => p.ip)).size).toBe(MAX_PEERS);
  });

  it('long host names are cut', () => {
    const peers = parseTailscaleStatus(JSON.stringify({ Peer: { a: { Online: true, HostName: 'x'.repeat(500), TailscaleIPs: ['100.64.1.1'] } } }));
    expect(peers[0]?.hostName).toHaveLength(64);
  });
});

describe('TailscalePeers (the CLI is faked)', () => {
  it('asks `status --json` only (read-only, fixed arguments) and keeps the list', async () => {
    const calls: Array<[string, string[], number]> = [];
    const run: RunCommand = (file, args, timeout) => {
      calls.push([file, args, timeout]);
      return Promise.resolve(STATUS);
    };
    const t = new TailscalePeers({ run, candidates: ['tailscale'], timeoutMs: 1234 });
    expect(t.addresses()).toEqual([]); // nothing before the first answer, and list() does not wait
    await t.refresh();
    expect(calls).toEqual([['tailscale', ['status', '--json'], 1234]]);
    expect(t.addresses()).toEqual(['100.101.5.6', '100.64.0.7']);
    expect(t.list()[0]).toEqual({ ip: '100.101.5.6', hostName: 'friend-pc' });
  });

  it('tries the next candidate when one is missing; an absolute path that does not exist is not even started', async () => {
    const started: string[] = [];
    const run: RunCommand = (file) => {
      started.push(file);
      return file === '/opt/ts/tailscale' ? Promise.resolve(STATUS) : Promise.reject(new Error('ENOENT'));
    };
    const t = new TailscalePeers({
      run,
      candidates: ['tailscale', '/missing/tailscale', '/opt/ts/tailscale'],
      exists: (p) => p === '/opt/ts/tailscale',
    });
    await t.refresh();
    expect(started).toEqual(['tailscale', '/opt/ts/tailscale']);
    expect(t.addresses()).toHaveLength(2);
  });

  it('no CLI at all / CLI fails / CLI times out: empty list, no throw', async () => {
    const t1 = new TailscalePeers({ run: () => Promise.reject(new Error('ENOENT')), candidates: ['tailscale'] });
    await expect(t1.refresh()).resolves.toBeUndefined();
    expect(t1.addresses()).toEqual([]);

    const t2 = new TailscalePeers({ run: () => Promise.reject(new Error('timed out')), candidates: ['a', 'b'] });
    await expect(t2.refresh()).resolves.toBeUndefined();
    expect(t2.addresses()).toEqual([]);

    const t3 = new TailscalePeers({ run: () => Promise.resolve('Tailscale is stopped.'), candidates: ['tailscale'] });
    await t3.refresh();
    expect(t3.addresses()).toEqual([]);

    const t4 = new TailscalePeers({ run: () => { throw new Error('sync boom'); }, candidates: ['tailscale'] });
    await t4.refresh();
    expect(t4.addresses()).toEqual([]);
  });

  it('a stopped Tailscale clears the list on the next refresh', async () => {
    let answer: Promise<string> = Promise.resolve(STATUS);
    const t = new TailscalePeers({ run: () => answer, candidates: ['tailscale'], minRefreshMs: 0 });
    await t.refresh();
    expect(t.addresses()).toHaveLength(2);
    answer = Promise.reject(new Error('gone'));
    await t.refresh();
    expect(t.addresses()).toEqual([]);
  });

  it('refresh is not re-entrant and is rate limited', async () => {
    let n = 0;
    const run: RunCommand = () => {
      n++;
      return Promise.resolve(STATUS);
    };
    const t = new TailscalePeers({ run, candidates: ['tailscale'], minRefreshMs: 60_000 });
    await Promise.all([t.refresh(), t.refresh(), t.refresh()]);
    await t.refresh();
    expect(n).toBe(1);

    const t2 = new TailscalePeers({ run, candidates: ['tailscale'], minRefreshMs: 0 });
    n = 0;
    await t2.refresh();
    await t2.refresh();
    expect(n).toBe(2);
  });

  it('remembers the candidate that worked and tries it first', async () => {
    const started: string[] = [];
    const run: RunCommand = (file) => {
      started.push(file);
      return file === 'b' ? Promise.resolve(STATUS) : Promise.reject(new Error('nope'));
    };
    const t = new TailscalePeers({ run, candidates: ['a', 'b'], minRefreshMs: 0 });
    await t.refresh();
    await t.refresh();
    expect(started).toEqual(['a', 'b', 'b']);
  });

  it('the real runner: a missing binary rejects (silently handled above), a slow one is killed by the timeout', async () => {
    await expect(defaultRunCommand('/definitely/not/here/tailscale', ['status', '--json'], 500)).rejects.toBeTruthy();
    const t0 = Date.now();
    await expect(defaultRunCommand(process.execPath, ['-e', 'setTimeout(()=>{}, 20000)'], 300)).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('the CLI candidates are fixed strings per platform', () => {
    expect(tailscaleCliCandidates('darwin')).toContain('/Applications/Tailscale.app/Contents/MacOS/Tailscale');
    expect(tailscaleCliCandidates('win32')).toContain('C:\\Program Files\\Tailscale\\tailscale.exe');
    for (const p of ['darwin', 'win32', 'linux'] as const) expect(tailscaleCliCandidates(p)[0]).toBe('tailscale');
  });
});

describe('probe format', () => {
  it('encodes and recognizes', () => {
    expect(JSON.parse(encodeProbe().toString())).toEqual({ game: 'AT-remaster', proto: 1, probe: true });
    expect(isProbe(encodeProbe())).toBe(true);
    expect(isProbe(encodeBeacon(INFO))).toBe(false);
    expect(isProbe(Buffer.from('garbage'))).toBe(false);
    expect(isProbe(Buffer.from('null'))).toBe(false);
    expect(isProbe(Buffer.from(JSON.stringify({ game: 'other', proto: 1, probe: true })))).toBe(false);
    expect(isProbe(Buffer.from(JSON.stringify({ game: 'AT-remaster', proto: 2, probe: true })))).toBe(false);
  });
});

describe('unicast discovery between two local sockets (fake peers on 127.0.0.1)', () => {
  const made: LanDiscovery[] = [];
  afterEach(() => {
    for (const d of made.splice(0)) d.dispose();
  });

  // two instances share one machine here, so each listens on its own port and names the other's as the "peer port"
  function make(port: number, extra: object = {}): LanDiscovery {
    const d = new LanDiscovery({
      port,
      targets: () => [], // no broadcast at all: only unicast can work, as on Tailscale
      bindAddress: '127.0.0.1',
      beaconIntervalMs: 50,
      probeIntervalMs: 50,
      ttlMs: 400,
      minUpdateIntervalMs: 20,
      ...extra,
    });
    made.push(d);
    return d;
  }

  it('the host pushes its beacon to a peer', async () => {
    const [hostPort, clientPort] = [await freePort(), await freePort()];
    const host = make(hostPort, { peers: () => ['127.0.0.1'], peerPort: clientPort });
    const client = make(clientPort);
    await client.startScan('abc123');
    host.startBeacon(INFO);
    await waitFor(() => client.list().length === 1);
    expect(client.list()[0]).toMatchObject({ ip: '127.0.0.1', port: 47020, hostName: 'MacBook', buildHashMatches: true });
  });

  it('a client probes its peer and a host that answers probes replies with a beacon (no push, no broadcast)', async () => {
    const [hostPort, clientPort] = [await freePort(), await freePort()];
    const host = make(hostPort, { answerProbes: true }); // knows no peers: cannot push
    const client = make(clientPort, { peers: () => ['127.0.0.1'], peerPort: hostPort });
    const updates: DiscoveredGame[][] = [];
    client.onUpdate((g) => updates.push(g));
    host.startBeacon(INFO);
    await sleep(100);
    await client.startScan('abc123');
    await waitFor(() => client.list().length === 1);
    expect(client.list()[0]).toMatchObject({ ip: '127.0.0.1', port: 47020, status: 'waiting' });

    // the game stays in the list while the host keeps answering, and goes away after the host stops
    host.stopBeacon();
    await waitFor(() => client.list().length === 0);
  });

  it('a host without answerProbes (default) does not answer', async () => {
    const [hostPort, clientPort] = [await freePort(), await freePort()];
    const host = make(hostPort);
    const client = make(clientPort, { peers: () => ['127.0.0.1'], peerPort: hostPort });
    host.startBeacon(INFO);
    await client.startScan('abc123');
    await sleep(300);
    expect(client.list()).toEqual([]);
  });

  it('no host beacon running: a probe gets no answer, and the host listener closes with the beacon', async () => {
    const [hostPort, clientPort] = [await freePort(), await freePort()];
    const host = make(hostPort, { answerProbes: true });
    const client = make(clientPort, { peers: () => ['127.0.0.1'], peerPort: hostPort });
    host.startBeacon(INFO);
    await sleep(100);
    host.stopBeacon();
    await client.startScan('abc123');
    await sleep(250);
    expect(client.list()).toEqual([]);
    // the port is free again: a new instance can bind it exclusively
    const s = createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject);
      s.bind(hostPort, '127.0.0.1', () => resolve());
    });
    s.close();
  });

  it('the scan and the host share one socket on the port when both run', async () => {
    const port = await freePort();
    const d = make(port, { answerProbes: true });
    await d.startScan('abc123');
    d.startBeacon(INFO);
    await sleep(100);
    d.stopScan();
    expect(d.beaconRunning).toBe(true);
    d.stopBeacon();
    expect(d.beaconRunning).toBe(false);
  });

  it('peers are refreshed in the background; a failing or throwing peer source does not break anything', async () => {
    const [hostPort, clientPort] = [await freePort(), await freePort()];
    let refreshes = 0;
    const errors: Error[] = [];
    const host = make(hostPort, {
      peers: () => ['127.0.0.1'],
      peerPort: clientPort,
      refreshPeers: () => {
        refreshes++;
        return Promise.reject(new Error('cli failed'));
      },
      onError: (e: Error) => errors.push(e),
    });
    const client = make(clientPort, {
      refreshPeers: () => {
        throw new Error('sync boom');
      },
    });
    await client.startScan('abc123');
    host.startBeacon(INFO);
    await waitFor(() => client.list().length === 1);
    expect(refreshes).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it('a scan-only client ignores a probe sent to it', async () => {
    const port = await freePort();
    const client = make(port);
    let updates = 0;
    client.onUpdate(() => updates++);
    await client.startScan('abc123');
    const sock = createSocket('udp4');
    await new Promise<void>((resolve) => sock.send(encodeProbe(), port, '127.0.0.1', () => resolve()));
    await sleep(100);
    expect(updates).toBe(0);
    sock.close();
  });

  it('a busy port still rejects the scan with a readable error', async () => {
    const blocker = createSocket('udp4'); // no reuseAddr
    const port = await new Promise<number>((resolve) => blocker.bind(0, '127.0.0.1', () => resolve(blocker.address().port)));
    const client = make(port);
    await expect(client.startScan('abc123')).rejects.toThrow(/Cannot search for LAN games/);
    expect(client.scanRunning).toBe(false);
    blocker.close();
  });
});
