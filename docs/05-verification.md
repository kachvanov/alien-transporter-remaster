# 05 — Verification: tests, parity checks against the original, budgets

## 1. Always: `npm run check`

`tsc --noEmit` (strict, `noImplicitOverride`, `noUncheckedIndexedAccess`) + `eslint` (including layer boundaries and the ban on `Math.random`/`Date`/`performance` in the simulation) + `vitest run`. A task is not handed in with a red `check`.

## 2. Extraction (M0)

- `tools/extract/*.test.ts`:
  - 20 levels;
  - exact object counts (see `02` §7);
  - all required parameters are present;
  - every symbol in the whitelist has frames in all tiers;
  - no symbols from the blacklist;
  - number of sounds = 55;
  - every font has a PNG and glyphs.
- Level overlay: `build/extract/debug/levelNN-overlay.png` + an automated test "GroundBox centres lie on the green markup" (tolerance 2 px).
- Asset Viewer (`npm run viewer`): check the contact sheet by eye — no empty or shifted frames, animations play. A separate tab shows a level: 3 layers + an object overlay.

## 3. Engine and game: unit tests

- For every ported piece of pure logic — tests on values: AntMath PRNG (reference: the first 10 values at seed 12345), AntSignal, AntEntity transforms, AntActor animation (play/stop/loop/reverse, fractional `animationSpeed`), AntCore and its families, Frame round-trip, protocol, jitter buffer.
- For systems — smoke tests: build a minimal world (or load a level headless), run N ticks, check invariants. Example: "a ship without thrust falls and touches the ground within ≤ 100 ticks on Level01".

## 4. Golden replays — determinism and "same physics after optimisations" (T4.1)

- **Recording.** In the dev build F9 toggles recording. The worker writes `{ seed, level, casualMode, inputs: [[tick, keysDownFlashCodes...], ...] }` (RLE: only the ticks where the set of keys changed) to `tests/golden/replays/<level>-<name>.json`. Plus scripted replays (`tests/golden/scripts/*.ts`) that generate input programmatically: "hang on thrust", "fly right and land", "crash into a wall".
- **Run (Node, no window).** `src/sim/headless.ts`: load the JSON asset data (no images), `AntMath.seed(seed)`, start the level directly (dev entry `GameState.debugStartLevel(name)`), feed input by tick. Every 35 ticks — a sha256 over all bodies in `world.GetBodyList()` order (x, y, angle, linVel.x, linVel.y, angVel as Float64) plus key game numbers (fuel and hull of each shuttle, coins, passengers in the hold, goal score).
- **References** — `tests/golden/expected/<replay>.json` (an array of hashes). Updated only with the command `npm run golden:update` and only with a justification in the report ("port fixed: ..."). In T4.3 (optimisation) updating the references is **forbidden**.
- **First replay for each level** — a scripted "spawn → 10 s without input → 10 s thrust" (at minimum). Recorded ones are added as the game is played through.

## 5. Behaviour parity check against the original (in frames)

Ruffle slows down when it lags, so we measure in **frames/ticks**, not in seconds. The original is a Ruffle screen recording (`--frame-rate 35`, Retina 2x, QuickTime; the recording frame rate is variable: a frame is written when the picture changes, frame time = pts, tick = 1/35 s). The clips live in `tests/parity/ruffle-clips/` (not committed to the repository: they are the original's graphics): **A** — Level01 with no input, ~13 s; **B** — Casual, ↑ for ~4 s up to the ceiling, then released, fall onto the pad; **C** — Casual, ↑+←; **D** — Hardcore, ↑+←. On our side: `npm run parity:behavior` (Node, no window, Level01, seed 12345; shuttle from spawn) and `npm run parity:video` (the same input from the pad against the recording).

| # | Scenario | Metric | Tolerance | original (Ruffle) | ours |
|---|---|---|---|---|---|
| 1 | Level01, spawn P1, no input | ticks until first ground contact | ±1 tick | **not measured at spawn**: the shuttle is hidden by the fade-in and the spawn effect and is already visible on the pad (y 304.0 in all frames where it is distinguishable). Equivalent: free fall from the ceiling onto the pad (clip B, 160 px): **47.6 ticks**, ±0.5 tick; the fall curve matches ours, rms 0.6 px | 1 (the shuttle appears on the pad, y 303.00 → 305.38 over 9 ticks). Equivalent: **47.9 ticks** (160.2 px). Difference 0.3 tick: **within tolerance** |
| 2 | Level01, shuttle on the pad, full thrust for 35 ticks (from pressing ↑) | climb height in px | ±2 px | **62.3 px** (clip B), ±1.2 px | **62.2 px** (same protocol); from spawn (shuttle still falling): 55.5. Difference 0.1 px: **within tolerance** |
| 3 | Continuous thrust with a full tank | ticks until the tank is empty | ±1 tick | not measured (no clip) | 1200 (consumption 0.00083 per tick = `fuelRate` 0.025 × `AntG.elapsed` 0.0333; `parity:behavior` prints 1225.7 because, of the 50 measurement ticks, consumption applies in 49; before FIX-5 it was 1428.6) |
| 4 | Passenger walks to the shuttle | px per 35 ticks | ±1 px | not measured (no clip) | 11.88 (from the first tick of the first passenger's movement in a Level01 run flown by a pilot; the speed ramps up, so the number depends on which passenger walks first and from which phase) |
| 5 | `Coin_mc` | animation period in ticks | exact | **28.97 ticks** (5 coins, 82 glint flashes, coin spread 0.08; individual intervals 25.1–30.0 due to the 8.3 ms screen step). This is 29 ticks at a Ruffle speed of 99.9% of 35 fps | 29 — **exact** |
| 6 | Casual vs Hardcore | tilt angle after 35 ticks of "left" (thrust + left, shuttle from the pad) | ±1° | Casual (clip C) **−32.4°**; Hardcore (clip D) **−57.1°** | Casual **−32.1°**; Hardcore **−58.3°** (from spawn: −31.3° / −59.6°). Casual: difference 0.2°, **within tolerance**. Hardcore: 1.2°, **at the limit, see below** |
| 7 | Barrel explosion near the shuttle | hull damage | exact | not measured (no clip) | not measured; per the `ShuttleSystem` code each hit (`hasHit`) removes 0.21 of the hull |

### How it was measured (`tools/parity/video.ts`, `video-compare.ts`)

- **Scene** is cropped out by ffmpeg (offset 112,140; 1600×1200: exactly 2 recording px per logical px; calibrated against the Ruffle screenshot `level01.png`). **Shuttle** is located by colour (orange hull and legs, dark warm tones, black glass): a template of the untouched shuttle (from the end of clip A) is aligned to the smooth colour fields of the frame by position and angle (refinement step 0.1 px and 0.1°). Frames with the red hit flash (template score < 0.3) are discarded, and the gaps are filled by linear interpolation. **Coin**: moments when the glint appears (white-yellow pixels) → mean interval.
- **Time origin.** Key presses are not visible in the recording, only the motion is. So the same keys are played back on our side (60 ticks of rest, then the keys; metrics are counted from the key press), and the moment of tick zero in the recording is found by fitting a time shift (least squares) over the whole curve of the first ~45 ticks. The residual (rms) shows whether the curves agree as a whole: B climb 0.68 px; C 1.5 px and 1.1°; D 1.1 px and 0.57°; fall 0.6 px. Fitting by climb and by angle gives a tick-zero that differs: C by 2 ticks (the ← key was pressed later than ↑: a human), D by 0.8 tick. A speed check without a model (no origin needed): climb time from 5 to 40 px: B 19.2 vs 18.7 ticks, C 20.6 vs 19.8, D 20.5 vs 20.7.
- **Uncertainty.** Shuttle position ±0.25 px (0.5 recording px). Frames are shown on the 120 Hz screen refresh, so frame time is ±8 ms = ±0.3 tick: at a climb speed of 3.4 px/tick that is ±1 px, at a rotation speed of 1.1°/tick ±0.3° (plus ±0.5° from the angle estimate).
- **Hardcore (clip D) at the tolerance limit.** The angle curve matches ours up to tick 33 (≤ 0.6°); on ticks 34–37 the shuttle hits the left wall (red flash: frames discarded, the value at tick 35 interpolated), and after the hit our shuttle goes 1.5–2 px further into the wall than in the recording (x −48 vs −46). The 1.2° difference at tick 35 lies within the uncertainty of this interval (±1.5°), so ±1° cannot be strictly confirmed; at tick 30 (before the hit) it is −53.1° vs −52.9° (0.2°). To confirm strictly, re-record without a wall (below).

### Finding FIX-5: `AntG.elapsed`

The first parity check showed that the original's Hardcore turn is 1.17 times faster than ours (the angle curve of D led ours by 2.4 ticks, a discrepancy of 3–6°). Cause: in `PrepareState` the original sets `AntG.fixedElapsed = true` and `AntG.maxElapsed = 0.0333`, so every game tick equals **0.0333 s** (`Anthill.enterFrameHandler`), while the port used 1/35 = 0.02857 s. Fixed (`src/engine/core/Anthill.ts`, `src/sim/GameLoop.ts`): `AntG.elapsed` is taken from `fixedElapsed`/`maxElapsed`, as in the original. All quantities that depend on `AntG.elapsed` change together: turning (`steeringSpeed`), fuel consumption (a tank lasts 1200 ticks instead of 1428), delays and timers (rocket `respawnDelay` 150 ticks instead of 175, passenger delays, etc.). After the fix the angles matched the recording (Hardcore angle rms 0.57°). The `tests/golden` references were recomputed (23 files); the scenarios `level01-deliver`, `level11-barrels`, `level13-sensor` were re-recorded by a pilot.

### What to re-record to close the rest

- **#6 strictly (±1°)**: Hardcore and Casual, Level01, shuttle at the start, hold **↑ and → together** for ~1.5 s and release (the area to the right of the start is clear, there is no wall, no red flash). The angle at tick 35 is then determined by steering alone. Same recording parameters.
- **#3**: Level01, Casual, hold ↑ until the tank is empty (the shuttle hangs at the ceiling; ~34 s = 1200 ticks), record until the flame goes out and 3 s more. The time origin is the first movement, the end is the flame disappearing (in `video.ts` this requires adding a count of flame pixels below the shuttle).
- **#4**: Level01, land the shuttle on the pad next to a passenger and record 6 s of the passenger walking to the shuttle.
- **#7**: Level01, hit a barrel with the shuttle (or a barrel explosion nearby) and record the HUD (the hull indicator at top left) before and after.
- **#1 as originally posed** (spawn) cannot be measured by a recording: the fade-in and the spawn effect cover the shuttle's first ticks; the equivalent (the fall) has already been checked.

The "ours" column is filled in by the commands `npm run parity:behavior` (from spawn, Node, no window, Level01, seed 12345; `tools/parity/behavior.ts`) and `npm run parity:video` (from the pad, against the recording). The `parity:behavior` metrics are counted from the first tick in which the P1 shuttle is present in the game. The reference values of our version, pinned by hashes, are in tests/golden (T4.1).

## 6. Visual parity check against Ruffle (T4.2)

- References: screenshots from Ruffle (800×600 logical window; on Retina the capture is 1600×1200 → downscale to 800×600 with `sharp`, kernel `lanczos3`) → `tests/visual/reference/<scene>.png`. Scenes: main menu, level select, garage, credits, pause, level-complete screen, Level01–Level20 on the first frame after spawn.
- Our capture: `npm run shot -- --scene=<scene>` launches Electron hidden, tier 1x, `webContents.capturePage()` of the 800×600 area → `tests/visual/actual/`.
- Comparison: `pixelmatch` (threshold 0.1). The report `tests/visual/report.html` shows three images side by side (reference / ours / diff) and the diff%.
- Criterion: static screens ≤ 3% differing pixels. Levels ≤ 6%: random elements (passengers, effects) differ between Ruffle and ours, so levels are additionally reviewed by a human. Everything above the threshold is investigated: origin shift, wrong blend, wrong frame.

## 7. E2E (Playwright + Electron, T0.1/T1.7 onwards)

`tests/e2e/smoke.spec.ts`: launch → main menu visible (canvas not empty, `Frame` frames present) → start Level01 (dev flag `--start-level=Level01`) → 10 s of scripted input → pause (P) → exit. There must be no errors in the renderer/worker/main console.

## 8. Network (T3.x)

- **Automated (Node):**
  - `electron/net/wsServer.ts` is brought up in a test without Electron; a `ws` client does the handshake → `welcome`;
  - `buildHash` mismatch → `reject: version`;
  - a second client → `reject: full`;
  - a Frame passes through byte for byte;
  - input with a `seq` lower than the last one is dropped.
- Jitter buffer: synthetic arrival times (even, jitter ±15 ms, a gap of 5 frames, a burst of 10) → check the chosen delay and the absence of "jumps back".
- `tools/net/latency-proxy.ts`: a TCP proxy with a 30±15 ms delay for manual runs.
- **Manually, by checklist:**
  1. two instances on one Mac (`npm run dev -- --profile=2`), host and join via `127.0.0.1`;
  2. auto-discovery shows the host within ≤ 2 s;
  3. client closed mid-level → the host continues, P2 is removed, a notification appears;
  4. host closed → the client shows "Connection lost" and returns to the menu;
  5. the same through latency-proxy;
  6. Mac ↔ Windows over Wi-Fi (both directions: Mac hosts, Windows hosts).

## 9. Performance budgets (T4.3/T4.4)

Measurement: `--perf-log=perf.json` writes once per second the FPS, p50/p95 of tick time, Frame size, `process.getProcessMemoryInfo()` (all processes), and a VRAM estimate (the sum of bytes of loaded textures). Scenarios: Level11 (many barrel explosions) and Level13 (rockets, sensors), 60 s of scripted input each, two players.

| Metric | Windows laptop (tier 2x) | MacBook M5 Pro (tier 3x) |
|---|---|---|
| Render FPS | steady 60 | steady 120 |
| Simulation tick p95 | ≤ 4 ms | ≤ 4 ms (was 1 ms, relaxed 2026-10-04: see below) |
| Total app RAM | ≤ 700 MB | ≤ 1.2 GB |
| VRAM (estimate) | ≤ 350 MB | ≤ 900 MB |
| Level load | ≤ 1 s | ≤ 0.5 s |
| Network (host → client) | ≤ 500 KB/s | — |
| Client input latency (LAN) | ≤ 100 ms | — |

**How to measure (T4.3).**
- In the app: `electron . --start-level=Level11 --perf-log=perf.json` (the path is relative to the process working directory). Once per second (35 ticks) a line goes into the file: `fps`, `simFps`, `tickP50/P95/P99/Max/Mean` (ms), the shares `plugins.update`, `physics.step`, `core.systems`, `frameWriter`, `elementSimulation`, `antLight` (ms per tick, nested: `plugins.update` contains physics and systems), the Frame size and `ramMB` of all processes; the file also has a `summary` (min/mean/max over the seconds). The measurement is done by `src/sim/perfProbe.ts` (it only reads clocks and does not change the game: test `perf-probe.test.ts`).
- Without a window: `npx tsx tools/perf/profile.ts --replays=level11-barrels,level13-sensor --ticks=2100` (p50/p95 and subsystem shares, per system separately; `--frame-hash` prints the sha256 of the stream of all frames: it must not change after an optimisation; `--alloc` — allocations; `--throttle=4` rescales the numbers to "CPU ×4 slower"). CPU profile: `node --import tsx --cpu-prof tools/perf/profile.ts` and `node tools/perf/cpuprof-top.mjs <file>`.
- T4.4, memory and tiers: `npx electron-vite build && npx tsx tools/perf/measure.ts --level=Level11 --seconds=60 --tier=2x` — the same app with scripted input (thrust and turns following a fixed pattern); it prints process memory by type (on macOS also `footprint`: it sees the graphics memory that `workingSetSize` does not show), the VRAM estimate (`vramMB`: the sum of `w×h×4` of the loaded atlas pages; the same figure is in F3 and in `--perf-log`) and a final `summary`. `--then=Level13` switches the level midway (the previous level's atlas must be unloaded), `--lose-context` loses and restores the WebGL context. An atlas page goes to the GPU right after decoding and its `ImageBitmap` is closed: an open bitmap keeps a full RGBA copy of the page in the renderer process's RAM until garbage collection (on 3x that is ~565 MB for the starting groups). Tiers that are not in the build (on Windows there is no `gfx/3x`) are found by main from the files on disk, and auto-selection does not pick them.
- Back-to-back ticks (Node) run 3-4 times faster than in the app: the worker wakes up once every 28.6 ms, so the core has time to "cool down" (frequency, caches). The `Simulation tick p95` budget is measured from `--perf-log` in the app, not in Node.
- User decision 2026-10-04: the tick budget on Mac was relaxed from 1 to 4 ms (same as Windows). Reason: in the app p95 is 2.62 ms (Level11) and 2.02 ms (Level13) with a tick period of 28.6 ms (a margin of more than 10x), and in Node with a warm core 0.58 and 0.44 ms; the difference is explained by the core cooling down between ticks, not by the code. The 1 ms figure was chosen before the first measurement.

## 10. Builds (T4.5/T4.6)

- macOS: the dmg opens, the app launches on the M5, there is an icon, fullscreen and Retina 3x work. When local network access is requested, the text from `NSLocalNetworkUsageDescription` is visible. Progress is saved to `~/Library/Application Support/<appName>/save.json`.
- Windows 10: both the NSIS installer and the portable build launch (SmartScreen: "More info → Run anyway"), Defender Firewall asks for access when hosting. Progress is in `%APPDATA%/<appName>/save.json`. The perf overlay is within budget.
- Cross-check LAN between the built versions (not dev).
