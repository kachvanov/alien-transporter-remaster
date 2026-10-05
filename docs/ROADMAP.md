# ROADMAP — tasks, dependencies, parallelism

One task card — one agent session. Task card files: `docs/tasks/<ID>-<slug>.md`. The `[x]` marks and merge-commit hashes are set **only by the orchestrator** (`/orchestrate`); the current state is in `docs/STATUS.md`. How to run this — `docs/ORCHESTRATION.md`.

Sizes: **S** — up to ~300 lines or configuration; **M** — ~300–1000; **L** — ~1000–2000 (if it comes out larger, split it and note it in the report).

## M0 — Foundation and extraction

| | ID | Task | Depends on | Size |
|---|---|---|---|---|
| [x] | T0.1 | Repository scaffold (electron-vite, TS, ESLint boundaries, Vitest, Playwright, scripts) `a3c363e` | — | M |
| [x] | T0.2 | JPEXS + decompilation → `reference/` `05e22c1` | T0.1 | S |
| [x] | T0.3 | `SymbolInfo.java` in the pipeline → `symbols.json`, `placements.json` `aec4b79` | T0.2 | S |
| [x] | T0.4 | Sprite rasterization, whitelist/blacklist, trim/dedupe, atlases, `manifest.json`, alpha masks `9c63578` | T0.3 | L |
| [x] | T0.5 | Sounds → OGG + `sounds.json`, loop check `91f3ce0` | T0.3 | S |
| [x] | T0.6 | Fonts, missions, texts, effects → JSON + zod `7437cf7` | T0.2 | M |
| [x] | T0.7 | Levels and models → JSON + overlay check `51b5de0` | T0.4 | M |
| [x] | T0.8 | Dev Asset Viewer `18550ca` | T0.4, T0.7 | M |

## M1 — Vertical slice: Level01 playable (solo and two players)

| | ID | Task | Depends on | Size |
|---|---|---|---|---|
| [x] | T1.1 | Anthill utilities: AntMath/PRNG, geom, signals, plugins (Task/Tween), AS3 helpers, int-report `8189ffe` | T0.1 | M |
| [x] | T1.2 | Scene: AntBasic/Entity/Actor/Animation/Camera/TileMap/State, AntG, input, AssetRegistry `1ef4970` | T1.1, T0.4 | L |
| [x] | T1.3 | ECS "ants" `9135dae` | T1.1 | M |
| [x] | T1.4 | Physics: box2dweb + port of Box2D-for-Anthill + ModelManager `11f462c` | T1.2, T0.7 | L |
| [x] | T1.5 | `Frame` format: writer/reader/uid/teleport `f80ee62` | T1.2 | M |
| [x] | T1.6 | Sim runtime: 35 Hz GameLoop, worker, headless, SaveStorage, InputRouter `b030894` | T1.2, T1.3, T1.5 | M |
| [x] | T1.7 | Electron shell + Pixi render + FramePlayer + letterbox + atlases + input `503ec59` | T1.5, T0.4 | L |
| [x] | T1.8 | Sound: port of AntSound/AntSoundManager + AudioEngine `211b2c0` | T1.2, T0.5, T1.7 | M |
| [x] | T1.9a | Port of game data: Config/G/Assets/Models/AvailKeys, data/, components/, tags/, nodes/ `bc2150c` | T1.3, T1.4 | L |
| [x] | T1.9b | Port of map/, levels/, models/ (ClipProxy, Factory, Ground, LevelCore) `257fb53` | T1.9a, T0.7 | L |
| [x] | T1.9c | Control/Shuttle/Health/Render/Station systems + ShuttleView and neighboring views `8a6fd9f` | T1.9b | L |
| [x] | T1.9d | ai/, Passenger/Spawn/Trigger/Portal/Goal systems + PassengerView `32bb860` | T1.9b | L |
| [x] | T1.9e | GameState (layers), Label/fonts, HUD (UISystem) → **Level01 playable** `3476088` | T1.9c, T1.9d, T1.6, T1.7, T1.8, T0.6 | L |

**✅ M1:** `npm run dev -- --start-level=Level01`. The shuttle flies, lands, burns and refuels fuel, passengers board and exit, the portal opens, sound works. P2 joins with the W key. Stubs are marked `STUB(Txx)`.

## M2 — Full port

| | ID | Task | Depends on | Size |
|---|---|---|---|---|
| [x] | T2.1 | Magnet/Missile/Ragdoll/Sensor/ObjectSpawn/Menu systems + remaining views | M1 | L |
| [x] | T2.2 | elements/: PhysicalMap + ElementSimulation (smoke, fire, oil) | M1 | M |
| [x] | T2.3 | Particle effects (AntEffect*) + StaticEffect | M1 | M |
| [x] | T2.4 | Living lights: AntLight/Environment (beams, touches, alpha masks) + rendering | M1 | M |
| [x] | T2.5 | ui/ (all views) + full Label | M1 | L |
| [x] | T2.6 | screens/ + PrepareState + transitions, without sponsor elements | T2.5 | L |
| [x] | T2.7 | Missions, content and unlocks, MusicManager/Sounds, pause and settings, Casual/Hardcore | T2.6 | M |
| [x] | T2.8 | Saves and settings (`save.json`/`settings.json`), Classic 35 fps, graphics tier | T2.7 | M |

T2.1–T2.5 run in parallel (2–3 agents). T2.1 may temporarily rely on `STUB(T2.3)` for effects.

**✅ M2:** all 20 levels can be completed; the garage (ships, colors, key remapping), missions, stars and unlocks work; progress survives a restart; two players on one PC works; `grep -r "STUB(" src` is empty.

## M3 — LAN play

| | ID | Task | Depends on | Size |
|---|---|---|---|---|
| [x] | T3.1 | `net/protocol`: handshake, input, codes, tests | T1.5 | S | (merge 35d0c3c)
| [x] | T3.2 | Host: ws server in main, worker↔main MessagePort bridge, heartbeat | T3.1, T1.7 | M | (merge 9d3ec9b)
| [x] | T3.3 | Client: WebSocket, jitter buffer, input, disconnects, overlay | T3.1, T1.7 | M | (merge ecdf411)
| [x] | T3.4 | Online screens (Host/Join, IP entry, game list) in the original's style | T2.6, T3.5 | M | (merge 58d9698)
| [x] | T3.5 | UDP auto-discovery | T1.7 | S | (merge 474cac7)
| [x] | T3.6 | Integration into the game: remote P2, client's ship, P2 leaving, pause | T3.2, T3.3, T3.4, T2.8 | M | (merge cbdbf76)
| [x] | T3.7 | Network tests, latency proxy, macOS/Windows network permissions | T3.6 | S | (merge 0df7ea6)

T3.1, T3.2, T3.3, T3.5 can start in parallel with M2.

**✅ M3 (passed 2026-10-04):** the checklist from `05-verification.md` §8 is passed, including the Mac ↔ Windows pairing.

## M4 — Fidelity, optimization, builds

| | ID | Task | Depends on | Size |
|---|---|---|---|---|
| [x] | T4.1 | Input recording and golden replays (headless) | T1.9e (extend as M2 progresses) | M | (merge d6d6153)
| [x] | T4.2 | Parity check against the original: visual (pixelmatch vs Ruffle) and behavioral (in frames) | T2.8 | M | (merges dfab79f + f5e96f7; visual part done; behaviour column measured for scenarios 1 (equivalent), 2, 5, 6 — see docs/05 §5; 3, 4, 7 need new Ruffle clips)
| [x] | T4.3 | Simulation optimization without changing golden hashes + perf log | T4.1, T2.8 | M | (merge 900423d; the 1 ms budget is not met in the app, see STATUS)
| [x] | T4.4 | Graphics tiers and memory budget (Windows) | T2.8 | S | (merge d5948fb; the Windows measurement awaits the laptop)
| [x] | T4.5 | macOS build (dmg arm64, icon, ad-hoc signing, Info.plist) | T2.8, T3.6 | S | (merge 0b2b11d)
| [x] | T4.6 | Windows build (NSIS + portable x64; cross-build or GitHub Actions) | T2.8, T3.6 | S | (merge 909f596; the Windows check awaits the user)
| [x] | T4.7 | User README (in English): installation, LAN, firewall | T4.5, T4.6, T3.7 | S | (merge 70fa5d7; the user's check is pending)

**✅ M4:** the budgets from `05` §9 are met on both machines; the dmg and exe are installed and work; LAN between the built versions works.

## M5 — Backlog after M4 (at the user's discretion)

| | ID | Task | Depends on | Size |
|---|---|---|---|---|
| [x] | T5.1 | Client in a network game: menu buttons look unavailable, "the host's turn" hint | T3.6, T3.4 | S | (merge cd572dd)
| [ ] | T5.2 | White screen/window freeze during long network play (Windows more often, Mac less): diagnosis, cause, fix, watchdog | T3.6, T4.5, T4.6 | M |
| [x] | T5.3 | Automatic dmg+exe build on the Mac after a merge into main (local, git hook, no cloud CI: original assets) | T4.5, T4.6 | S–M | (merge 49ec902)
| [x] | T5.5 | Tidy `dist/` layout: `latest/` with stable names, `archive/` with one previous build, hard links, migration of the flat folder | T5.3 | S | (merge 6db99d5)

Do not start until the user says so (or the M4 gates are closed).

## Critical path

T0.1 → T0.2 → T0.3 → T0.4 → T1.2 → T1.4 → T1.9a → T1.9b → T1.9c/d → T1.9e → T2.5 → T2.6 → T2.7 → T2.8 → T3.6 → T4.5/T4.6.

## Rules for stubs

If a task needs functionality from a future task, put in a minimal stub with a comment `// STUB(T2.3): explosion effects` (greppable). A stub must not change the call order: the call stays, only the body becomes empty. The task that implements the functionality must remove its own `STUB(<its ID>)` markers.
