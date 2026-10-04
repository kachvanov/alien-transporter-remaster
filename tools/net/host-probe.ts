// Not a port (T3.7). From the second machine, before the game: does the host answer, and how good is the Wi-Fi?
//
//   npx tsx tools/net/host-probe.ts 192.168.0.5            (port 47020)
//   npx tsx tools/net/host-probe.ts 192.168.0.5:47020 --seconds 10
//
// The host must be running (`Online -> Host game`). `--hash <buildHash>` when the host is a build of another checkout
// (default: the buildHash of assets/manifest.json of this one). Exit code 0: the host answered, 1: no way to the host.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeHost } from './probe';

function usage(): never {
  console.error('usage: tsx tools/net/host-probe.ts <ip>[:port] [--seconds N] [--hash <buildHash>]');
  process.exit(2);
}

function localBuildHash(): string {
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as { buildHash?: unknown };
    if (typeof manifest.buildHash === 'string' && manifest.buildHash !== '') {
      return manifest.buildHash;
    }
  } catch {
    // (no assets here: the host will answer `reject: version`, which still shows that the way is open)
  }

  return 'host-probe-without-assets';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let address = '';
  let seconds = 5;
  let hash = localBuildHash();
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--seconds') {
      seconds = Number(args[++i]);
    } else if (a === '--hash') {
      hash = args[++i] ?? usage();
    } else if (a.startsWith('--') || address !== '') {
      usage();
    } else {
      address = a;
    }
  }

  const m = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(address);
  if (m === null || !Number.isFinite(seconds) || seconds < 1 || seconds > 120) {
    usage();
  }

  const host = m[1] as string;
  const port = m[2] !== undefined ? Number(m[2]) : 47020;
  console.log(`probing ${host}:${port} for ${seconds} s ...`);
  const r = await probeHost({ host, port, buildHash: hash, durationMs: seconds * 1000 });
  console.log(`result : ${r.outcome} - ${r.message}`);
  if (r.hostName !== undefined) {
    console.log(`host   : ${r.hostName}`);
  }

  if (r.outcome === 'ok') {
    console.log(`frames : ${r.frames} (${r.framesPerSec.toFixed(1)} per second; 35 is the full rate)`);
    console.log(`traffic: ${r.kbPerSec.toFixed(1)} KB/s (the budget is 500 KB/s)`);
    if (r.rttAvgMs !== null && r.rttMaxMs !== null) {
      console.log(`ping   : average ${r.rttAvgMs.toFixed(1)} ms, worst ${r.rttMaxMs.toFixed(1)} ms`);
    }
  }

  process.exit(r.outcome === 'failed' ? 1 : 0);
}

void main();
