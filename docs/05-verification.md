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

### Automatic local builds (T5.3)

- Builds are made on this Mac, never in the cloud (the build needs the original's assets, which must not leave the machine). One-time setup: `npm run hooks:install` (`git config core.hooksPath .githooks`).
- After a merge into `main` in the main checkout, `.githooks/post-merge` starts `npm run dist:all` in the background (log: `dist/build.log`) if `src/`, `electron/`, `resources/`, `package.json`, `package-lock.json`, `electron-builder.yml`, `index.html`, `electron.vite.config.ts`, `tools/extract/**` (not its `*.test.ts`) or `tools/build/{prepack.ts,make-icon.ts,adhocSign.cjs}` changed since the last successful build, **or the content of the generated `assets/` changed** (FIX-8, below). Docs/tests/other-tools-only merges and agent worktrees do not trigger it; `AT_NO_AUTOBUILD=1` skips one merge.
- **Pixel-exact vs smooth UI (T5.6, FIX-11).** The default look of the pixel-art UI at 2x/3x is pixel-exact (`tiers`, replicated k x k; the T5.6 tests assert it) and must stay so unless `DEFAULT_UI_SCALING` is changed on purpose. The smooth variant is checked by `tools/extract/upscale.test.ts` (sizes, determinism, flat areas, no ringing, no bleed between glyphs), `tools/extract/sprites.test.ts` (rect = k x 1x, pages, the atlas pixels are the deterministic upscale of the 1x frame), `tests/unit/ui-scaling.test.ts` (flag > settings > default, only the chosen variant's pages are loaded, equal startup VRAM) and by eye: `npm run dev -- --tier=3x --ui-scaling=smooth` (or `pixel`) against the same scene, zoomed. VRAM and the Frame protocol are the same in both modes (the choice is local rendering only).
- **Generated assets (FIX-8).** `assets/` (and `build/`, `reference/`, `vendor/`) are not in git, so a diff of the merge never shows that the look of the game changed through a re-run of `npm run extract` (the T5.6 case: only atlases changed, the dmg/exe silently kept the old graphics). Every build therefore records a fingerprint of `assets/` (sha256 over path, size and content hash of every file; `tools/build/dist-assets.ts`) in `dist/.state/build-state.json` (`lastSuccess.assets`, also in `BUILD-INFO.json`), taken when the build starts and stored only if the build succeeded completely (a failed or partial build keeps the old one). The hook's detached process (`dist-all.ts --trigger`; the hook itself still returns at once) and `npm run dist:status` compare the current fingerprint with it: different means "a build is needed", even for the same commit or a docs-only merge. The fingerprint depends on the content only, so an idempotent re-run of `npm run extract` (identical files, new mtimes) does not trigger a build; the per-file hashes are cached by size and mtime in `dist/.state/assets-hash-cache.json` (a check stats ~200 files, about 0.2 s). Migration: a state written before FIX-8 has no fingerprint; if no file in `assets/` is newer than that build, the first check (hook, `dist:all --trigger` or a manual run) records the current fingerprint without building, otherwise it builds once.
- The hook fires only after merges. After a manual `npm run extract` in the main checkout, `npm run dist:status` shows `assets/: CHANGED`; `npx tsx tools/build/dist-all.ts --trigger` builds if (and only if) something build-relevant changed, `npm run dist:all` builds in any case.
- `npm run dist:all` builds the committed state of HEAD (`git archive` into a temporary folder), one build at a time; a merge during a build queues exactly one follow-up build. Result: see the layout below. A macOS notification ("Build <hash> is ready: dmg + exe in dist/latest") reports success or failure.
- `npm run dist:status` shows whether a build is running, the commit and files of `dist/latest/`, the archive and whether `main` is behind the last build. `npm run dist:open` opens `dist/latest/` in Finder (with no finished build it only prints a message).

### Layout of `dist/` (T5.5)

```
dist/
  latest/     the newest build, stable names without spaces (safe to bookmark, drag to Applications, copy to another machine):
              Alien-Transporter-Remaster-mac-arm64.dmg, Alien-Transporter-Remaster-win-setup.exe,
              Alien-Transporter-Remaster-win-portable.exe, BUILD-INFO.json (commit, date, version, per-file sizes, per-stage result)
  archive/<date>-<hash>/   the builds with their original hash-named files + BUILD-INFO.json: the newest one and 1 previous
  build.log   rotated: the last ~1 MB is kept
  .state/     lock, queue, state (hidden)
```

- A build is produced into `archive/<date>-<hash>.partial/`, then renamed to `archive/<date>-<hash>/`; `latest/` is refilled with **hard links** to those files (a copy only if links fail), so nothing is stored twice. `latest/` is prepared in `.state/latest.next/` and swapped in, so it never shows a half-written set and never mixes commits.
- A platform that failed in the newest build is absent from `latest/` (the failure is in its `BUILD-INFO.json`; the earlier build of that platform stays in `archive/`, it is not carried over). A build that produced no file at all does not touch `latest/`; its result is in `.state/last-attempt.json` (`dist:status` shows it).
- Rotation: `latest` + 1 previous build; older archive folders and unfinished `.partial` folders are removed. Only folders named `<date>-<hash>` are ever removed.
- The first `dist:all` after the T5.3 flat layout moves the loose files of that layout (names produced by `dist:all`) into these places and removes older ones; any other file in `dist/` is left alone.

## 11. Long play: white screen, `crash.log`, soak (T5.2)

Symptom (user, 2026-10-05): during a long network game the window turns white and stops responding; more often on the Windows laptop (8 GB). **Root cause: not found.** In 60-minute soaks on the Mac nothing crashed, hung or lost the GPU. What was measured and fixed is below; the user's long game on the new build (both machines) decides whether the problem is closed.

### Diagnostics that are always on (`electron/crashLog.ts`, `electron/diagnostics.ts`, `src/app/diagnostics.ts`)

`<userData>/crash.log` (rotation at 1 MB into `crash.log.1`, async writes, no personal data: home folders are scrubbed). A line: `ISO-time role(host|client|local) vVERSION platform/arch EVENT key=value ...`. Events: `START` (machine, Electron, GPU feature status), `STATE` every 30 s (RAM per process type, `main_lag_max` = the longest stall of the main process's event loop, `renderer_age` = seconds since the renderer last reported, host socket buffer, and the renderer's statistics: tick, fps, jitter queue / drops / underruns, atlas pages, VRAM estimate, live audio graphs, JS heap, visibility), `RENDER_GONE` (reason, exitCode), `UNRESPONSIVE` / `RESPONSIVE` / `HANG_KILL`, `CHILD_GONE` (type GPU ...), `GPU_INFO_UPDATE`, `WEBGL_CONTEXT_LOST/RESTORED`, `PAGE_ERROR`, `PAGE_REJECTION`, `WORKER_ERROR`, `MAIN_UNCAUGHT`, `NET_STATE`, `VISIBILITY`, `WINDOW` (show/hide/minimize/...), `POWER` (suspend/resume/lock), `DISPLAY` changes, `RECOVER`, `EXIT`. Reading it: a `STATE` line with a growing `renderer_age` and no `RENDER_GONE` is a hang; `RENDER_GONE reason=oom` is memory; `CHILD_GONE type=GPU` is the GPU process.

### Safety net (does not replace the fix)

`render-process-gone`, `unresponsive` for 10 s (`HANG_KILL` crashes the renderer on purpose, then the same path), or a GPU process that is gone and a WebGL context that does not come back within 6 s: the window loads a fresh page (`#local:crashed` = the menu with the message "The game window crashed and was restarted" in the bitmap font; a client gets `#local:lost` = the Join screen with "Connection lost"). The save is not touched. A host whose window is replaced stops its server (the client gets `bye host_quit`, the port is free). At most 3 recoveries a minute (a loop guard). A GPU process that is killed is normally repaired without a reload: the context is lost and restored within ~1 s and the game goes on (measured).

### Fixes

- `JitterBuffer.push` is bounded (`maxPending` = 18 frames, drops the oldest; test `net-backpressure.test.ts`). Before: the queue was drained only by `update()`, which is called from `requestAnimationFrame`; a window whose rAF stops (Windows native occlusion; not measured on Windows) queued 126 000 frames per hour at ~20-45 KB each (decoded `FrameData`).
- `main.ts`: `disable-backgrounding-occluded-windows` (+ `CalculateNativeWinOcclusion` off on Windows) so that a covered window keeps running, as `backgroundThrottling: false` always intended. **Hardening, not measured on Windows.**
- `AudioEngine`: a graph of a non-looped sound in the loop list ended by itself, and `stopGraph` then set an `onended` that never fired: the graph stayed connected. Now it is disconnected at once. `liveGraphs` is in the statistics.

### Tools

`tools/perf/soak.ts` (host + client / through `tools/net/proxy.ts` / solo; scripted input, level changes, hide/cover experiments, `footprint` per process on macOS, slope after warm-up; windows are muted by default, `--audio` unmutes), `tools/perf/heap-diff.ts` (what grows in the simulation between two heap snapshots), `profile.ts --heap=N` (heap after GC every N ticks). Tests: `crash-log.test.ts`, `net-backpressure.test.ts`, `tests/e2e/crash-recovery.spec.ts` (renderer crash, GPU kill, host and client).

### Measured (Mac M5 Pro, tier 2x, 120 Hz, level change every 3 min, muted; the machine was under memory pressure, so the working set shrinks and grows: the footprint is the figure that counts)

| Run (60 min, before the audio fix) | footprint all processes, slope after 10 min | renderer | GPU | queue / drops / atlas pages |
|---|---|---|---|---|
| net, host | +59 MB/h (4.5 %) | +60 MB/h (12 %) | flat | - / - / 8 |
| net, client | +10 MB/h (0.8 %) | +6 MB/h | flat | 1-2 frames / 0 / 8 |
| proxy (30 +- 15 ms), host | +44 MB/h (3.4 %) | +34 MB/h (7 %) | flat | - / - / 8 |
| proxy, client | +7 MB/h (0.6 %) | +6 MB/h | flat | 2-3 frames / 0 / 8 |
| solo | +30 MB/h (2.4 %) | +27 MB/h (6 %) | flat | - / - / 8 |

No crash, hang, context loss or page error in any of them; `main_lag_max` at most 12 ms; the host socket buffer was always 0. The live audio graph counter grew linearly (~3 a minute, 190-260 after an hour) before the audio fix.

### Hypotheses (T5.2 step 3)

| | Hypothesis | Checked | Result |
|---|---|---|---|
| a | the client's frame queue grows when rendering is slower than the host | the queue stays at 1-3 frames in 60 min (direct and proxy); unit test with no `update()` for an hour | refuted for normal play; a theoretical unbounded growth when rAF stops: fixed (bound) |
| b | atlas pages / textures are not released on level changes | 20 level changes per hour: 8 pages and 316 MB VRAM flat | refuted |
| c | audio nodes are not disconnected | `liveGraphs`: grew ~3/min before the fix (190-260 after 60 min); after the fix 0-26 over 60 min, last value 0 (host, client, solo) | confirmed (finished loop-list channel graphs), fixed |
| d | growing arrays in the worker | Node, 110 min of game time, heap after GC: Level11 with an idle ship +30 MB/h (bodies/coins accumulate until the level restarts), Level13 +9, Level01 +1; 15 level loads in a row (1 min each): the heap after GC stays at 55-62 MB (no leak across level loads) | accumulation inside one long level only (game behaviour, not changed); a level change frees it |
| e | 8 GB laptop: memory / GPU lost | Mac: footprint ~1.2-1.3 GB per instance (GPU 700 MB of it); GPU process killed -> context back in ~1 s; `--lose-context` works | Windows 8 GB not measured |
| f | hidden / occluded window: rAF throttled | Mac: minimized for 150 s and fully covered: fps 120, queue 1-2 | refuted on macOS; Windows not measured (hardening added) |
| g | the main process blocks IPC | `main_lag_max` <= 12 ms over 5 runs; no synchronous writes on the game path | refuted |

### After the audio and queue fixes (60 min, net and solo, same Mac, later; the Mac was also used by the developer)

No crash, hang, context loss or page error; queue 1-2 frames, 0 drops, 8 atlas pages, VRAM 316 MB, live audio graphs 0-26 (before: up to 260). Footprint, mean of minutes 10-30 -> 40-60: net host 1230 -> 1299 MB (renderer 474 -> 504, GPU 680 -> 718), net client 1119 -> 1171 (renderer 374 -> 376, GPU 673 -> 720), solo 1340 -> 1410 (renderer 522 -> 551, GPU 745 -> 785). In the five runs before the fixes the same comparison gave +28 / +5 / +18 / +4 / +14 MB (net host / net client / proxy host / proxy client / solo) with the GPU process flat. The "after" runs show more growth, almost all of it in the GPU process (shared with whatever else the Mac was drawing), which none of the changes touches. **The criterion "all processes grow <= 5 % an hour" is met in the first set (0.6-4.5 %) and not reproduced in the second (7-12 %, GPU-driven): measurement noise of a shared machine, or a slow GPU-side growth that was not found.** The renderer of the host (it holds the simulation worker) grows by ~30-60 MB an hour in every run (6-12 %); the client's renderer by 0-6 MB. Open: a clean measurement on a machine used for nothing else, and on the Windows laptop.

### What the user has to do (T5.2 is closed only after it)

A long network game (>= 1 hour, both roles, Mac <-> Windows laptop) on the new build; if the window goes white again, `crash.log` (and `crash.log.1`) from **both** machines: see the README section "If the game window goes white or freezes". The lines to look at: `RENDER_GONE reason=` (oom = memory), `UNRESPONSIVE`, `CHILD_GONE type=GPU`, `WEBGL_CONTEXT_LOST`, the last `STATE` lines before it (`ram_*`, `renderer_age`, `main_lag_max`, `jitterPending`, `visibility`) and the `VISIBILITY` / `WINDOW` / `POWER` lines around it.
