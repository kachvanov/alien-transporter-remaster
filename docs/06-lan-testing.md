# 06. LAN play verification (T3.7)

How to test the network, the results of the T3.7 run, and a step-by-step guide for the manual part (Mac ↔ Windows).
The checklist and budgets are in `05-verification.md` §8–§9, the protocol is in `03-frame-and-network-protocol.md`.

## 1. Tools

| What | Command |
|---|---|
| A proxy with delay (TCP, both directions independently, byte order preserved) | `npx tsx tools/net/latency-proxy.ts --listen 47030 --target 127.0.0.1:47020 --delay 30 --jitter 15`, the client connects to `127.0.0.1:47030` (UDP announcements do not go through the proxy: enter the address by hand) |
| Checking the host from a second machine without the game (TCP+WebSocket, frames/s, KB/s, ping) | `npx tsx tools/net/host-probe.ts 192.168.0.5 [--seconds 10]` (the client slot is occupied for the duration of the check) |
| Frame sizes by level (worst-case traffic) | `npx tsx tools/net/frame-sizes.ts [11 \| 1-20]` |
| Windows diagnostics (addresses, network profile, firewall rules, port) | `powershell -ExecutionPolicy Bypass -File tools\net\windows-check.ps1 [-Peer 192.168.0.5]` |
| Host traffic counter | when a client leaves, the host writes to stdout `[host] client left (...); sent to it: avg … KB/s, peak … KB/s` |
| The whole checklist on one machine (real Electron instances) | `T37_RUNS=5 T37_REPORT=1 npx playwright test tests/e2e/net-verification.spec.ts` (`T37_SHOTS=<folder>` — screenshots) |
| The Host screen: "YOUR ADDRESSES - PORT 47020", the TEST button | Online → Host game → TEST: connects to each of its own addresses and the port; `OK`/`FAIL ECONNREFUSED <ip>` |

TEST proves that the server listens on the network interfaces, and not only on loopback. It does **not** prove that the firewall
lets other machines in (the firewall does not filter a connection to one's own address) — for that, use `host-probe` / `Test-NetConnection` from a second machine.

## 2. Results of the single-machine run (MacBook, two Electron instances, Level11)

Measuring the "client input latency": in the client page, from the `keydown` of ArrowUp (thrust) to the render frame in which the P2 ship appeared
(a MutationObserver on `data-sprites`). It includes: the client's input polling (up to 1 screen frame), the path to the host, waiting for the host tick
(0…29 ms), the tick itself, the frame to the client, the jitter-buffer delay and rendering. It does not include the OS delay between the key press and the event, nor
the monitor's vertical sync (+0…16 ms). The host and the client share one CPU and GPU — on two machines the jitter is smaller.

| Scenario | Input latency, ms (5 runs) | Jitter buffer | Underruns / dropped in 20 s | Host→client traffic |
|---|---|---|---|---|
| Direct (127.0.0.1), buffer ≥ 1.5 ticks (before the fix) | 115 105 110 98 92 (median 105) | 1.50 ticks = 43 ms | 0 / 0 | avg 95, peak 127 KB/s |
| Direct, buffer ≥ 1.0 ticks (final) | 97 82 92 86 104 (median 92) | 1.13 ticks = 32 ms | 0 / 0 | avg 94, peak 125 KB/s |
| Through the proxy 30 ± 15 ms each way (3 runs) | 161 152 177 (≈ +60 ms RTT) | 1.87 ticks = 53 ms | 0 / 0 | avg 95, peak 120 KB/s |

- The host half of the path (ws client: thrust bit → the frame where P2 entered): median 41 ms (39…57).
- Auto-discovery: the host is visible 280–340 ms after the scan starts (≤ 2 s).
- Traffic by level (`frame-sizes`, 30 s of input, both players flying): average frame 3.3–6.3 KB (113–216 KB/s), the largest frame
  10.8 KB (Level12) — even if it were sent every tick, 368 KB/s. The 500 KB/s budget is met with a margin, `perMessageDeflate` is not needed.
- Jitter buffer: the lower bound of the delay D was reduced from 1.5 to 1 tick (DEVIATION, `src/app/main.ts`): on a quiet network D = 1.5 hit
  the floor and the input latency was ~105 ms; now it is ~92. A noisy network raises D by itself (D = 1 + 2σ/tick; behind the proxy 1.8–1.9).

## 3. The `05` §8 checklist

| # | Item | Result |
|---|---|---|
| 1 | two instances on one Mac, host + join via `127.0.0.1` | passed: `net-verification.spec.ts` (host `--host-start`, client `--join`), P2 enters on the client's thrust, the client's picture changes |
| 2 | auto-discovery ≤ 2 s | passed: 0.3 s (test `checklist 2`; the Join screen itself with the "different version" frame — `online-screens.spec.ts`) |
| 3 | client closed mid-level → the host continues, P2 removed, notification | passed: the host's ticks keep going, `client left (closed)` in stdout, "PLAYER 2 DISCONNECTED" on the host's screen (screenshot reviewed) |
| 4 | host closed → the client shows "Connection lost"/the reason, returns to the menu | passed: `netState=closed`, reason `host_quit` ("The host closed the game"), Enter → `mode=local` (the menu) |
| 5 | the same through latency-proxy | passed: the same checks 3–4 via `127.0.0.1:47030`, input latency ≈ 160 ms, 0 underruns |
| 6 | Mac ↔ Windows over Wi-Fi, both directions | **not done** — a human and a Windows laptop are needed, see §4 |
| + | client pause (P) = one press of P on the host | passed on a live host: a 90 ms `pauseReq` bit toggles `paused` in the frames once, the second time it clears it (ws client, `tests/e2e/net-verification.spec.ts`); plus unit tests. A human pressing P in the client window was not verified |

The firewall was not tested: on this Mac it is off (`socketfilterfw --getglobalstate` → disabled), all runs were on one machine via
loopback and TEST on the LAN address. The macOS prompt for local network access and the Defender Firewall window appear only on a real build / a second
machine — see step 6.

## 4. Manual step 6: Mac ↔ Windows

Needed: both computers on the same Wi-Fi network; on Windows, Java 17 and ffmpeg (for `npm run extract`), or a ready build
(`npm run build:win` — T4.6).

1. Windows (if there is no build of its own yet): `git clone`, `npm ci`, `npm run extract`, `npm run dev`. Put `AlienTransporter.swf`
   as described in `CLAUDE.md` (the `ORIGINAL_SWF` variable).
2. The Windows network must be **Private**: Settings → Network & Internet → Wi-Fi → network properties → Network profile → Private.
3. `powershell -ExecutionPolicy Bypass -File tools\net\windows-check.ps1` — look at the addresses and the profile.
4. **The Mac hosts.** Mac: Online → Host game, write down the address (the screen shows `ip:47020`), press TEST (it should be `OK`). On the first launch macOS
   will ask about the local network — allow it; if the macOS firewall is on — "Allow incoming connections".
   Windows: `npx tsx tools/net/host-probe.ts <mac-ip>` — wait for `result : ok`, ~35 frames/s, ping. Then in the game Online → Join game:
   the host should appear in the list within ≤ 2 s (otherwise enter the address by hand); join, fly with thrust (↑ ← →), check the smoothness and that P2 enters.
5. **Windows hosts.** Windows: Online → Host game → when the Defender Firewall prompt appears, tick "Private networks" and "Allow access"; TEST → `OK`.
   Mac: `npx tsx tools/net/host-probe.ts <windows-ip>`; then Join.
   If `host-probe` prints `ETIMEDOUT`/`EHOSTUNREACH`: the network profile is "Public", the firewall rule was not created (if you refused in the first window
   there is none — Settings → Windows Security → Firewall → "Allow an app through firewall", find Alien Transporter / Electron),
   or the router has "Wi-Fi client isolation" enabled. Check from the Mac: `nc -vz <windows-ip> 47020`; from Windows: `Test-NetConnection <mac-ip> -Port 47020`.
6. In each direction record: the auto-discovery list, `host-probe` (frames/s, KB/s, ping), smoothness and responsiveness by eye, F3 on the client.
   When a client leaves, the host writes the traffic to the console (`npm run dev` — in the terminal).

## 5. What was done in T3.7 besides the tools

- `electron-builder.yml`: `mac.extendInfo.NSLocalNetworkUsageDescription` (the text from `03` §8). For Windows nothing is needed in the build
  (the system itself creates the firewall rule on the first `listen`); the description for the README is in §4 (T4.7).
- The client name in `hello` is `os.hostname()` (it used to be hardcoded as `Player 2 (darwin)`); the host name in the beacon is already substituted
  in `electron/main.ts` (`sanitizeBeaconInfo`, an empty name is replaced with `os.hostname()`).
- Test: `DISCOVERY_PROTO` (electron/net/discovery.ts) equals `PROTO_VERSION` (src/net/protocol.ts).
