# 00 — Project overview

## What we are doing

A remaster of the Flash game **Alien Transporter v1.3.0 (Feb 2, 2016)**. The author is Anton Karlov (Ant.Karlov), the sponsor is Armor Games. The player pilots a rocket shuttle through caves: ferries alien passengers between stations, refuels and collects coins. Falling rocks, rocket turrets and exploding barrels get in the way. There are 20 levels (4, 8, 12, 16 and 20 are bonus levels), stars, 19 quest missions, a garage with ships and colors, Casual/Hardcore modes and two-player play on one keyboard.

The source is `AlienTransporter.swf` (6.5 MB). The user keeps it at `/Applications/Flash Games/alien-transporter.swf`; the path is set in `.env` (`ORIGINAL_SWF`).

Target machines:
- MacBook Pro M5 Pro, 24 GB, 3024×1964 screen, 120 Hz (ProMotion);
- a Windows 10 x64 laptop, 8 GB RAM, most likely integrated graphics.

## Why the original lags

- Anthill draws everything on the CPU: `copyPixels` and `BitmapData.draw` into an 800×600 buffer, and vector clips are rasterized at runtime.
- Right now the game runs through the Ruffle emulator.
- The physics uses a fixed step of `1/40` **per frame**. When the FPS drops, the game falls into slow motion.

## Requirements

1. Graphics, levels and physics are as in the original.
2. Modes:
   - single player;
   - two players on one PC (as in the original: P2 joins with their own thrust key);
   - LAN play: one hosts, the other enters an IP or picks a host from the list of discovered ones, as in Minecraft.
3. Builds for macOS arm64 and Windows 10 x64.
4. Good performance on both machines.

User decisions (fixed):
- Language: English only, as in the original.
- Graphics: the same vector art, re-rasterized in HD (1x/2x/3x).
- Add:
  - automatic discovery of LAN games;
  - key remapping (already present in the original's Garage, we port it);
  - smooth 60/120 Hz (interpolation);
  - physics optimization **with unchanged behavior**.
- Remove dead sponsor links and the Armor Games intro, keep the Credits screen.

## Facts about the original (verified by decompilation)

| What | Value |
|---|---|
| Stage | 800×600, `Config.FRAME_RATE = 35` |
| Physics | Box2DFlash **2.1alpha**; `AntBox2DManager`: `step = 1/40` per frame, `velocityIterations = 6`, `positionIterations = 15`, `scale = 30` px/m, gravity `(0, 9.81)`, allowSleep by default |
| Time | `AntG.elapsed`: in the game (PrepareState) `fixedElapsed = true`, so every tick = `maxElapsed = 0.0333` s (neither real time nor 1/35). AntActor animations: `currentFrame += animationSpeed * AntG.timeScale` per update |
| Architecture | The Anthill framework: an AntEntity/AntActor scene; the "ants" ECS (AntCore/AntSystem/AntNode, Ash style); Box2D plugins, effects, living lights |
| Code size | ~22.7K lines of game code (`ru.alientransporter.*`) and ~20K of Anthill (including debug, which is not needed). Box2D, ~14K lines, is replaced with box2dweb |
| Levels | 20 single-screen ones. Clips: `LevelNNBack_mc` (scrollFactor 0.25), `LevelNNBG_mc` (0.5), `LevelNNFG_mc` (1.0) are cached in an AntTileMap of 8×6 tiles × `CELL_SIZE = 100` (an 800×600 area). `LevelNNPhysic_mc` is the editor markup with `*_com` instances |
| Camera | Static. `scroll` = (0, 0), there is `shake(...)` |
| Graphics | Vector: 915 shapes, 596 sprites, ~6000 frames. `add`/`overlay` blending, multiply tint, BlurFilter on AntLight |
| Sound | 62 MP3s: 55 SFX and 3 music tracks, some at 11 kHz |
| Data | XML: missions (19), EN texts, particle effects (256 KB), 10 bitmap fonts |
| Keys | P1: UP/LEFT/RIGHT. P2: W/A/D. Pause: P or ESC. Action: SPACEBAR/ENTER. Remapping is in the Garage |
| Saves | `AntCookie` (SharedObject) → a JSON file in the remaster |

## Key decisions

1. **Port, not rewrite.** AS3 → TypeScript almost 1:1. This is the main lever for accuracy.
2. **Physics is box2dweb 2.1a.** It is a JS conversion of the same Box2DFlash 2.1a, so the behavior is identical.
3. **Levels, body models, sounds and data are extracted from the SWF automatically** (`npm run extract`).
4. **Graphics are re-rasterized from the original vectors** via JPEXS at 1x, 2x and 3x. The Mac uses 3x, Windows uses 2x.
5. **Logic runs at 35 ticks/s, physics is `Step(1/40, 6, 15)` per tick**, as in the original at a stable 35 FPS. Rendering runs at the display rate and interpolates between ticks. The "Classic 35 fps" mode turns interpolation off.
6. **The simulation runs in a Web Worker and emits a binary `Frame` every tick.** The renderer can draw only a `Frame`. In a network game the host forwards the same `Frame`s to the client, so the client looks exactly like the host.
7. **Network: a host-authoritative thin client** over WebSocket (TCP) + UDP auto-discovery.
8. **Physics optimization with the same physics:** we do not touch the solver. We gain through the worker, the absence of allocations and GPU rendering. Every change is verified with golden-replay hashes.

## Stack

TypeScript (strict) · Electron (pin the version; the current stable is 44.x; Windows 10 is supported from v23+) · electron-vite · PixiJS v8 (WebGL2) · box2dweb 2.1a (npm `box2dweb@2.1.0-b`, no patches) · Web Audio · `ws` + `dgram` · zod · Vitest · Playwright (`_electron`) · electron-builder · JPEXS FFDec 26.3.0 + Java 17 · sharp · maxrects-packer · ffmpeg.

## Milestones

- **M0** — foundation and extraction of assets/data.
- **M1** — vertical slice: Level01 is playable (solo + two players).
- **M2** — full port: 20 levels, menu, garage, missions, saves.
- **M3** — LAN play.
- **M4** — parity check with the original, optimization, Mac and Windows builds, README.

Tasks and dependencies are in `docs/ROADMAP.md`.

## Legal

The assets and code of the original belong to the author. The remaster is for personal use only. We publish nothing.
