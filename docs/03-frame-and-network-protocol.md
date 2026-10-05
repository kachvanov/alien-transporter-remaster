# 03 — `Frame` format and network protocol

Everything binary is **little-endian** (`DataView` with `littleEndian = true`). The same `Frame` format goes from the worker to the renderer and from the host to the client over the network. Implementation: `src/frame/` (writer/reader) and `src/net/protocol.ts`. Constants and versions live in `src/frame/constants.ts` and `src/net/protocol.ts`.

## 1. `Frame` (type = 0x01)

### Header (26 bytes)
| off | type | field | description |
|---|---|---|---|
| 0 | u8 | type | `0x01` |
| 1 | u32 | tick | simulation tick number (since the worker started) |
| 5 | u8 | flags | bit0 `paused`, bit1 `sceneReset` (all nodes teleport — screen/level change), bit2 `hasDebug` |
| 6 | u16 | musicTrack | `soundId` of the music track, `0xFFFF` = silence |
| 8 | u8 | musicVol | 0..255 (resulting MusicManager volume) |
| 9 | u8 | muteFlags | bit0 music muted, bit1 sounds muted |
| 10 | u16 | levelGroup | 1..20 — the `level-NN` atlas that must be loaded; `0xFFFF` — none |
| 12 | u16 | tickCost | duration of the last tick in hundredths of a ms (for F3) |
| 14 | u32 | reserved | 0 |
| 18 | u16 | nodeCount | |
| 20 | u16 | oneShotCount | |
| 22 | u16 | loopCount | |
| 24 | u16 | extBytes | informational: total size of the ext blocks (for validation) |

### Node, `nodeCount` of them, in draw order (back → front)
| type | field | condition |
|---|---|---|
| u32 | uid | `(entityId << 8) \| subIndex`; subIndex = 0 for ordinary entities, 0..255 for Label glyphs |
| u16 | texId | index into `manifest.frames`; `0xFFFF` — no texture (ext only) |
| u8 | flags | bit0 `teleport`, bit1 `hasScale`, bit2 `hasAlpha`, bit3 `hasTint`, bit4-5 `blend` (0 normal, 1 add, 2 overlay, 3 screen), bit6 `hasExt`, bit7 reserved |
| f32 | x | screen coordinates 800×600 (camera and scrollFactor already applied) |
| f32 | y | |
| f32 | rotation | radians, final (global) |
| f32, f32 | scaleX, scaleY | if `hasScale` (otherwise 1, 1) |
| u8 | alpha | if `hasAlpha` (0..255; otherwise 255) |
| u8, u8, u8 | r, g, b | if `hasTint` (multiply; otherwise white) |
| … | ext | if `hasExt`: see below |

A node is written only if the entity and all its ancestors are `exists && visible` and it has something to draw (an animation frame, a glyph or an ext). No "on screen" check is done: drawing off-screen is harmless, and unambiguity matters more.

### Ext blocks (`u8 extType` + data)
- `0x01 LIGHT` (AntLight):
  `u16 pointCount`, then `pointCount × (f32 x, f32 y)` — polygon in screen coordinates (the first point is the center of the source);
  `f32 gradCenterX, gradCenterY, gradRadius`;
  `u8 stopCount`, then `stopCount × (u8 ratio, u8 r, u8 g, u8 b, u8 a)`;
  `f32 blurX, blurY`.
- `0x02 DEBUG_LINES` (dev only, if `flags.hasDebug`): `u16 n`, then `n × (f32 x1, y1, x2, y2, u32 rgba)` — Box2D debug draw.

### OneShot (`oneShotCount` of them)
`u16 soundId | u8 volume (0..255) | i8 pan (−127..127 → −1..1)`

### Loop (`loopCount` of them — **all** loops active on this tick)
`u16 channelId | u16 soundId | u8 volume | i8 pan`. `channelId` is the stable id of the `AntSound` instance while it is playing.

### The `teleport` rule
FrameWriter sets `teleport = 1` if:
- the uid is new;
- the entity was `reset()`/`revive()`-d during this tick (the `justReset` flag in AntEntity; `reset`/`revive` set it, and FrameWriter clears it);
- the distance from the previous frame is more than 200 px;
- the header has `sceneReset`.

### Budget
~600 nodes × ~21 B + lights ≈ 13 KB per frame, ×35 ≈ 450 KB/s. Fine on a LAN. If measurements show more than 500 KB/s — first enable `perMessageDeflate` in `ws`, then think about deltas.

### Tests
Round-trip (write → read → deep equality) on synthetic frames: empty, 1000 nodes with all flags, a light with 100 points. Boundary values of u16/i8. An invalid (truncated) buffer → a clear error, not a crash.

## 2. Transport

- Host: `ws` (`WebSocketServer`, `noServer: false`, `port: 47020`, `perMessageDeflate: false`), listening on `0.0.0.0`. No more than one client at a time.
- Client: browser `WebSocket('ws://<ip>:<port>')`, `binaryType = 'arraybuffer'`.
- Text messages (JSON) — handshake and control; binary ones — `Frame` (0x01) and `Input` (0x02).
- The port is configurable (Settings → Network). The input field accepts `ip` or `ip:port`.

## 3. Handshake and control (JSON)

```jsonc
// client → host, right after open
{ "t": "hello", "proto": 1, "buildHash": "<manifest.buildHash>", "name": "MacBook", 
  "ship": { "shuttleKind": 0, "shuttleColor": 2, "engineKind": 0, "engineColor": 1 } }

// host → client
{ "t": "welcome", "proto": 1, "hostName": "Windows-PC", "tickRate": 35 }
{ "t": "reject", "reason": "full" | "version" | "busy" }     // and close the socket with code 4000/4001/4002

// host → client, on events
{ "t": "notice", "text": "Host paused" }                      // optional notifications
{ "t": "bye", "reason": "host_quit" }                         // the host closes the session

// client → host
{ "t": "bye" }                                                // the client leaves on its own
```
- `proto` — protocol version (a constant, starting at 1).
- `buildHash` must match: `texId` and `soundId` are indices into the shared manifest. If it does not match — `reject: version`, and the client shows "Different game version on host and client".

## 4. Client input (type = 0x02, 6 bytes)

`u8 type=0x02 | u32 seq | u8 bits` — bit0 `gas`, bit1 `left`, bit2 `right`, bit3 `pauseReq` (rising edge of the P press).
- The client uses its own local keys. For both the P1 layout (`keyP1Gas/Left/Right`) **and** the P2 layout (`keyP2*`) these mean "gas/left/right" — so the client can use either hand comfortably.
- Sent on every change of the bits, plus a heartbeat at 35 Hz.
- Host: packets with `seq` lower than the last one received are dropped. The latest state of the bits is passed to the worker (`InputRouter`) and applied at the start of the next tick.
- Mouse and menu keys are not sent to the host at all: the menu, the level and the garage are chosen by the host (T5.1).
- **"Client is view-only" mode** (T5.1, `DEVIATION: online`, client rendering only; the protocol and `PROTO_VERSION` were not changed). The condition is derived from the frame header: `levelGroup == 0xFFFF` (the host's LevelManager has no level: main menu, level select, garage, the "level complete"/restart screen) for more than 12 consecutive frames. Any frame with a level (1..20) turns the mode off immediately. While the mode is on, the client renderer draws the buttons (`Btn*` symbols with several frames in the manifest) muted (alpha x0.45, tint 0x9a9a9a; the button's hover/down frames are shown as "up") and a "WAITING FOR THE HOST" hint in the bitmap font at the bottom of the screen; `<html data-view-only="true|false">` is a hook for e2e. Logic: `src/render/ClientViewModel.ts`.

## 5. Keepalive and disconnects

- The host sends a ping once per second (`ws.ping()`); no pong within 5 s — the client is considered disconnected.
- Client: no `Frame` for 3 s — show "Connection lost", close the socket, return to the main menu.
- **The client disconnected mid-level:** the host disables remote input, the P2 ship is removed from the level the same way as in the original when P2 leaves the game (find the corresponding path in `UISystem`/`GameScreen`, otherwise remove the shuttle without an explosion), and the notification "Player 2 disconnected" appears. The host's game continues.
- **The host closed the game or went to the "Online → Stop" menu:** `{t:"bye"}`, then close. The client shows a message and returns to the menu.

## 6. Client jitter buffer

- Incoming `Frame`s are put in a queue with an `arrivalTime`.
- Target delay `D` = from 1.5 to 3 ticks (43 to 86 ms). Start at 2 ticks, adapt to jitter: `D = clamp(1.5, 3, 1 + 2·σ(intervals)/tick)`, recomputed once per second.
- Playback clock: `renderTick = latestTick − D` (fractional). `FramePlayer` interpolates between the frames `floor(renderTick)` and `ceil(renderTick)`.
- If the buffer holds more than 6 frames (catching up after a network pause) — drop the old ones down to `D`.
- Sound: oneShot events are played when their frame becomes "current" for rendering. Loops are reconciled against the current frame.

## 7. UDP auto-discovery (port 47021)

- Every second the host sends a JSON datagram to `255.255.255.255:47021` and to the broadcast address of each IPv4 interface (`os.networkInterfaces()`, address | ~mask):
  ```json
  { "game": "AT-remaster", "proto": 1, "buildHash": "…", "hostName": "MacBook-Pro", "port": 47020, "status": "waiting" | "full" }
  ```
- The client (`dgram`, `reuseAddr: true`, bind `0.0.0.0:47021`) collects the replies into a list `{ip (rinfo.address), hostName, port, status, lastSeen}` and drops entries older than 3 s. A mismatching `buildHash` is shown greyed out with the caption "different version".
- All of this lives in main (`electron/net/discovery.ts`); the list goes to the renderer over IPC.
- **Over Tailscale / other point-to-point networks (FIX-6).** A Tailscale interface (utun on macOS, the "Tailscale" adapter on Windows) is a `/32` with an address in `100.64.0.0/10`: it has no broadcast, so the broadcast above never reaches the other machine (interfaces with a /31 or /32 mask are therefore skipped when the broadcast list is built; their addresses are still shown on the Host screen). On top of the broadcast, discovery uses **unicast** to the online peers of the tailnet:
  - The peers come from `electron/net/tailscale.ts`: a background, read-only call of `tailscale status --json` (fixed arguments, no user input, 2 s timeout, repeated at most every 4 s while a beacon or scan runs). CLI candidates: `tailscale` in PATH, macOS `/Applications/Tailscale.app/Contents/MacOS/Tailscale`, Windows `C:\Program Files\Tailscale\tailscale.exe`. Online peers with an IPv4 in 100.64.0.0/10 are kept (max 64). A missing CLI, an error or a timeout is silent: the peer list is empty and discovery is exactly what it was (broadcast only). `list()` never waits for the CLI.
  - The host additionally sends the same beacon to every peer, `<peer>:47021`, once a second (the host may be the only side that has the CLI).
  - A scanning client sends every peer a probe `{ "game": "AT-remaster", "proto": 1, "probe": true }` to `<peer>:47021` once a second, from its scan socket (the client may be the only side that has the CLI).
  - A running host listens on `0.0.0.0:47021` (`reuseAddr`; the same socket the scan uses when both run) and answers a probe with the beacon, unicast to the sender. So a unicast probe arriving on the host's Tailscale address is answered.
  - `proto` and `buildHash` are unchanged (an old build ignores the probe: `parseBeacon` rejects it as it has no `status`). Manual entry of `ip:port` and `lastJoinAddress` are unaffected and remain the fallback when Tailscale has no CLI (for example the host's Tailscale address is on the Host screen).

## 8. Platform requirements

- macOS: in `electron-builder` → `mac.extendInfo.NSLocalNetworkUsageDescription = "Alien Transporter uses the local network to find and join LAN games."`. The first LAN connection or broadcast triggers a system prompt — it must be allowed. If the macOS firewall is enabled — "Allow incoming connections".
- Windows: on the first `listen`, Defender Firewall asks for access — "Private networks" must be allowed. The Wi-Fi network must be "Private" (Settings → Network → Wi-Fi → Properties). The README should give step-by-step instructions with the check command `Test-NetConnection <ip> -Port 47020`.
- Tailscale (FIX-6): UDP 47021 and TCP 47020 must be allowed on the Tailscale interface too. macOS needs nothing extra (the "Allow incoming connections" prompt covers all interfaces). On Windows the Tailscale adapter gets its own network profile, usually "Public": the Defender rule created for Electron/the game must include "Public networks" for discovery to work over Tailscale (or enter the address by hand: a TCP rule is also needed in that case). Discovery over Tailscale needs the Tailscale CLI on at least one of the two machines (macOS: the app bundle contains it; Windows: it is installed with the app); without it enter `ip:port` by hand.
- The Online → Host screen shows all IPv4 addresses of the machine (except 127.0.0.1 and link-local 169.254.*) and the port.
