# 01 — Architecture

## 1. Processes and data flows

```
┌──────────────────── Renderer process (BrowserWindow) ────────────────────┐        ┌──────── Main process ────────┐
│                                                                           │        │ save.ts     save/settings JSON │
│  InputCollector (keydown/keyup by event.code, pointer → 800×600)          │  IPC   │ wsServer.ts (host only)        │
│        │ InputSnapshot (postMessage)                                      │◄──────►│ discovery.ts (UDP beacon/scan) │
│        ▼                                                                  │        │ window, fullscreen, openExternal│
│  ┌──────────── Sim Worker (src/sim/worker.ts) ────────────┐               │        └──────────────┬─────────────────┘
│  │ GameLoop 35 Hz → engine (Anthill-TS) + game + physics  │               │   MessagePort          │ ws (TCP 47020)
│  │ FrameWriter → Frame (ArrayBuffer)                      │───────────────┼──────(host)────────────┤ UDP 47021
│  └───────────────────────┬─────────────────────────────────┘               │                        ▼
│                          │ Frame (transfer)                                │                  client on the LAN
│                          ▼                                                 │
│  FramePlayer (prev/curr, interpolation) ──► PixiRenderer (WebGL2)          │
│                          └──────────────► AudioEngine (Web Audio)          │
│                                                                           │
│  Client mode: WebSocket(ws://host:47020) ─► Frame ─► FramePlayer            │
│               InputCollector ─► bits ─► WebSocket                          │
└───────────────────────────────────────────────────────────────────────────┘
```

Modes:

| Mode | Who simulates | Where the Frame comes from | Input |
|---|---|---|---|
| Solo / two players on one PC | local worker | worker | both layouts from the local keyboard |
| Host (LAN) | local worker | worker (and a copy goes to the network) | P1 — local keyboard; P2 — bits from the client |
| Client (LAN) | nobody (no worker is started) | WebSocket | local keyboard → bits → host |

**The host's network path.** Main creates a `MessageChannelMain`, hands one port to the renderer, and the renderer passes it to the worker. After that the worker and main talk directly: the worker sends a copy of the `Frame` to main, main forwards it into `ws` and passes the client's input to the worker. The renderer takes no part in network traffic.

## 2. Repository structure

```
CLAUDE.md
docs/                         specification and task cards
.env.example                  ORIGINAL_SWF=/Applications/Flash Games/alien-transporter.swf
reference/                    (gitignored, generated) as3/ — decompilation; data/ — XML from binaryData
vendor/original/              (gitignored) a copy of the SWF
vendor/jpexs/                 (gitignored) JPEXS 26.3.0
tools/extract/                pipeline: *.ts (Node) + java/SymbolInfo.java
assets/                       (gitignored, generated) gfx/{1x,2x,3x}/, sfx/, data/, manifest.json, sounds.json
src/engine/                   Anthill-TS (no DOM/Pixi)
  core/                       AntBasic, AntEntity, AntActor, AntAnimation, AntCamera, AntTileMap, AntMask, AntG, AntState
  ants/                       AntCore, AntFamily, AntNode, AntNodeList, AntNodePool, AntObject, AntSystem
  input/                      AntKeyboard, AntMouse, InputSnapshot, keyCodes
  plugins/                    AntPluginManager, AntTaskManager, AntTween, AntTransition
  signals/                    AntSignal, AntDeluxeSignal, ...
  utils/                      AntMath (+ PRNG), AntPoint, AntRect, AntColor, AntFormat, AntList
  sound/                      AntSound, AntSoundManager (volume/pan logic → channel state)
  effects/                    AntEffectManager, AntEffectEmitter, AntEffectParticle, ...
  lights/                     AntLight, AntLightEnvironment (data)
  assets/                     AssetRegistry: manifest (frame metadata), levels, models, fonts, effects
src/physics/
  box2dweb/index.ts + box2d.d.ts   a wrapper around the npm package box2dweb@2.1.0-b (do not patch; the hash is checked by a test)
  anthill/                    port of ru/antkarlov/anthill/plugins/box2d/**
src/game/                     port of ru/alientransporter/** — package structure 1:1
src/frame/                    FrameWriter, FrameReader, types, uid
src/sim/                      GameLoop, worker.ts, headless.ts, SaveStorage, InputRouter
src/render/                   FramePlayer, PixiRenderer, AtlasLoader, Letterbox, LightRenderer, PerfOverlay
src/audio/                    AudioEngine
src/net/                      protocol.ts, clientSession.ts, hostBridge.ts (worker side), discoveryModel.ts
src/app/                      renderer entry: mode selection, wiring of worker/network/render/sound
electron/                     main.ts, preload.ts, save.ts, net/wsServer.ts, net/discovery.ts
tests/                        unit (next to the code or tests/unit), golden/, e2e/
```

Layer boundaries are checked by the ESLint `no-restricted-imports` rule in `eslint.config.js`:
- `src/{engine,physics,game,frame,sim,net/protocol.ts}` do not import `pixi.js`, `electron` or DOM globals (the `no-restricted-globals` rule is enabled for `window`/`document`);
- `src/{render,audio,app}` do not import `electron` (only through `window.at`, which the preload provides);
- `electron/` imports nothing from `src/render` and `src/audio`.

## 3. The game loop (exactly as in the original)

The original frame is `Anthill.enterFrameHandler`, see `reference/as3/ru/antkarlov/anthill/Anthill.as`:
```
AntG.elapsed = (fixedElapsed ? maxElapsed : min(real, maxElapsed)) * timeScale   // the game sets fixedElapsed = true, maxElapsed = 0.0333 in PrepareState
update():  AntG.updateInput(); AntG.sounds.update(); state.preUpdate(); state.update(); state.postUpdate();
render():  cameras draw the entity tree (Label and ElementSimulation have side logic in draw())
AntG.plugins.update():  plugins in listOfActive order (sorted by priority, see AntPluginManager.sortHandler)
           in G.init: physics.create() → start() → plugins.add(physics); then plugins.add(core); plugins.add(music);
           AntTween and AntTaskManager add themselves when active
```

Our tick (`src/sim/GameLoop.ts`) repeats this order:
1. `AntG.elapsed = (AntG.fixedElapsed ? AntG.maxElapsed : min(1/35, AntG.maxElapsed)) * AntG.timeScale` — there is no real frame time, for determinism. The game (PrepareState) turns `fixedElapsed` on with `maxElapsed = 0.0333`, so in the original and in ours every game tick = **0.0333 s**, not 1/35 (FIX-5: measuring a Ruffle recording showed Hardcore steering is 1.17 times faster than with 1/35; `GameLoop` sets the same `fixedElapsed`/`maxElapsed` for runs that do not start from `PrepareState`).
2. `AntG.updateInput(snapshot)` → `AntG.sounds.update()` → `state.preUpdate/update/postUpdate`.
3. **Render point:** `FrameWriter.write(scene)`. The side logic from the original `draw()` methods (Label, ElementSimulation, MusicManager.draw) is called here, in the same traversal order.
4. `AntG.plugins.update()` — plugins in `listOfActive` order after the AVM2 sort by priority (`sortAS3`). Candidates: `AntBox2DManager.update()` (`Step(1/40, 6, 15)` + `ClearForces()`), `AntCore.update()` (systems — also in the order after the AVM2 sort), `MusicManager`, tweens and tasks. The actual order is determined by the code; it must be logged in the T1.6 test and fixed as the reference.
5. Sending the `Frame`.

Important: because of the order of steps, the `Frame` shows the state before the physics of the current tick, like the original frame. Do not "fix" this.

**Worker loop:** `setInterval(pump, 4)`. `pump` adds `performance.now() − last` to an accumulator and, while the accumulator is ≥ 1/35 s, performs a tick. No more than 3 ticks per `pump`; the remainder is discarded. On pause (`G.gamePause`) ticks continue — pause is a game state, as in the original.

**Determinism:** with the same seed, input and build, the result is bit-for-bit identical. The golden tests rely on this (`docs/05-verification.md`). Therefore:
- no `Date.now()`/`performance.now()` inside the game logic;
- no `Math.random()`;
- iterate over a `Map`/`Set` only where the original had an ordered container (`Dictionary` in AS3 is unordered — check at the place of use how it is used);
- sorting: only `sortAS3`/`sortOnAS3` (an exact copy of the avmplus algorithm), never the built-in `Array.prototype.sort`. For example, the update order of systems (all have `Priority = 0`) and plugins depends on this (`04` §3).

## 4. The Anthill-TS engine

### Scene
- `AntEntity` — data: `x, y, angle` (degrees), `scaleX, scaleY, alpha, color` (0xRRGGBB, multiply), `blend: null|'add'|'overlay'|'screen'`, `visible, exists, active, children, parent`, `scrollFactor`, `origin`. The global transform (`globalX/globalY/globalAngle`, scale) is computed by the original's algorithm (`AntEntity.as`). Port it as is.
- `AntActor` — animation. `addAnimationFromCache(name)` takes metadata from `AssetRegistry` (the number of frames, and the origin and size of each frame at 1x). `play/stop/gotoAndStop/gotoAndPlay/playRandomFrame/currentFrame/animationSpeed/reverse/repeat` are ported 1:1. `width/height` come from the frame metadata: the game uses them (UI, collisions). There is no drawing.
- `AntTileMap` — a node referencing the texture of a level layer (`LevelNNBG_mc#0` etc.) and a `scrollFactor`. We do not port caching into tiles; loading progress is emulated with an immediate `eventComplete`.
- `AntCamera` — `scroll`, `shake(intensity, duration)` 1:1. `FrameWriter` applies the camera itself the same way as the original `draw` (`screen = global − camera.scroll × scrollFactor` + shake offset) and writes **screen** 800×600 coordinates into the `Frame`. The renderer knows nothing about the camera.
- `Label` (`ru/alientransporter/fonts/Label.as`) lays out glyphs by the bitmap font's metrics. In the `Frame` each glyph is a separate node (`uid = entityId<<8 | glyphIndex`). Color (multiply) and blend are taken from the Label.
- Each entity receives an `entityId` on creation (u24, a monotonic counter, overflow → restart from 1).

### The "ants" ECS
A 1:1 port of `ru/antkarlov/anthill/ants/*`: `AntCore` (systems, families, `getNodes(NodeClass)`, `addObject/removeObject`), `AntFamily`, `AntNode`, `AntNodeList`, `AntNodePool`, `AntObject` (components by class), `AntSystem`. Families are built from the fields of the Node class. In AS3 this was done via `describeType`; in TS a static declaration is needed: every Node class has `static components = { shuttle: ShuttleControl, ... }`.

### Resources (`src/engine/assets/AssetRegistry.ts`)
Loads `assets/manifest.json` (frame metadata, no images), `assets/data/levels/*.json`, `models.json`, `fonts/*.json`, `effects.json`, `missions.json`, `texts.json`, `sounds.json`. Works both in the worker and in Node (for tests). The data source is an abstraction, `AssetSource` (fetch in the worker, fs in Node).

## 5. Rendering (`src/render`)

- **PixiRenderer:** an `Application` with `preference: 'webgl'`, `antialias: false`, `resolution: devicePixelRatio`, `autoDensity: true`. The root container is scaled so that 800×600 fits in the window while keeping 4:3 (letterbox, black bars).
- **Sprite pool by `uid`.** Each frame: for each `Frame` node we take or create a `Sprite`, set the texture by `texId`, `anchor` = origin/size of the frame, `position`, `rotation`, `scale` = `nodeScale / assetScale`, `alpha`, `tint`, `blendMode`. Draw order = node order (`zIndex` by index or reordering `children`). Sprites that are not in the frame are hidden and returned to the pool.
- **Interpolation (`FramePlayer`):** stores `prev` and `curr`. `alpha = clamp((now − currArrivalTime) / (1000/35), 0, 1)`. For nodes with `teleport` or without a pair in `prev` — the `curr` values. The angle is interpolated along the shortest arc. Classic mode draws `curr` without interpolation. For the network client, `FramePlayer` receives frames from a jitter buffer (see `03`).
- **Atlases:** `AtlasLoader` loads groups from the manifest for the chosen tier (`3x` / `2x` / `1x`). The groups `ui`, `game-common`, `shuttles`, `passengers`, `effects` are loaded at startup, `level-NN` — by the `levelGroup` field of the frame header; the previous level is unloaded (`texture.destroy(true)`). Until a texture is loaded, the node is not drawn.
- **Blend:** `add` natively, `overlay` via `import 'pixi.js/advanced-blend-modes'`, `screen` natively.
- **Light (AntLight, "living lights") is gameplay, not just graphics.** Sensor rays are computed in the simulation (a port of `AntLight.draw`, steps `rayStep`/`angleStep`). Each ray stops at the first "opaque" pixel. Opaque objects are entities added to `AntLightEnvironment` (in the game this is `ShuttleView`, see `Factory.makeShuttle`). A ray touching the ship triggers `eventBeginTouch`/`eventEndTouch`, and that is what fires the rockets. In the port `isOpaque(x, y)` is checked against the 1x alpha masks of the frames (pipeline, `02` §4.6) with the entity's inverse transform. In the `Frame` the light goes out as a node with `ext LIGHT`: a polygon in screen coordinates and a radial gradient (`colors/alphas/ratios`). `LightRenderer` draws it through `Graphics` with a `FillGradient` (radial) and the node's blend; if `blur > 0`, a `BlurFilter` is added.
- **Screen transitions** (`FadeEffectShow_mc/FadeEffectHide_mc`, class `FadeEffectView`) are an ordinary AntActor animation: a black frame with a transparent rounded window. No masks are needed; it is drawn as a regular node. The tier is no higher than 2x (overrides).
- **PerfOverlay (F3):** FPS, tick time (sent by the worker), `Frame` size in bytes, node count, draw calls, RTT on the network.

## 6. Sound (`src/audio/AudioEngine.ts`)

- At startup it decodes all SFX (`decodeAudioData`) and the music (3 tracks).
- From each `Frame`:
  - `oneShots` → immediately `AudioBufferSourceNode` → `StereoPannerNode` → `GainNode` → master;
  - `loops` (the full list of active channels) → compared with the current ones: start the new ones (`loop = true`), stop the missing ones (20 ms fade), and smoothly (`setTargetAtTime`, ~30 ms) update gain and pan for the rest;
  - music: `musicTrack`/`musicVol` from the header. A track change is a 200 ms crossfade (if the original's MusicManager does it differently, repeat its behavior).
- Volume and pan are computed in the simulation (a port of `AntSound`/`AntSoundManager`); AudioEngine only executes them.

## 7. Saves and settings

- In the simulation `SaveStorage` is an interface `{ load(key): Promise<object|null>; save(key, obj): Promise<void> }`. In the worker it goes via `postMessage` → renderer → `window.at.save.*` → IPC → `electron/save.ts`. In Node tests — an in-memory implementation.
- Files: `app.getPath('userData')/save.json` (`GameData` progress) and `settings.json` (keys, fancy effects/quality, volume, tier, UI scaling (FIX-11: pixel-exact/smooth pixel-art UI at 2x/3x, `--ui-scaling=`), classic, window, last IP/port). Writes are atomic: `*.tmp` → `rename`.
- `--profile=N` in the arguments: `app.setPath('userData', <base>-profileN)`, needed to test two instances.

## 8. Input

- `InputCollector` (renderer) listens to `keydown`/`keyup` by **`event.code`** (the physical key). That is why WASD works in a Russian keyboard layout. `event.code` is translated into a Flash keyCode through the table `src/engine/input/keyCodes.ts`; key names ("UP", "W", "SPACEBAR", "ESC"…) are taken from the original's `AntKeyboard.addKey`.
- Mouse: pointer → logical 800×600 coordinates, taking letterbox into account.
- Once per tick the renderer sends the worker an `InputSnapshot { keysDown: number[] (Flash keyCodes), mouseX, mouseY, mouseDown, wheel }`. It is sent on every change and on `requestAnimationFrame`; the worker takes the latest.
- `InputRouter` (worker) in Host mode replaces the keys assigned to P2 (`Config.keyP2Gas/Left/Right`) with the state of the bits from the client, and ignores local presses of those keys. The game code does not change: P2 "presses" their keys remotely. The client's `pauseReq` bit becomes a one-tick press of `P`.
- Application hotkeys (not passed to the game): F11 / Alt+Enter / ⌃⌘F — fullscreen, F3 — perf overlay.

## 9. Electron main and preload

- `BrowserWindow`: `backgroundColor: '#000'`, `webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false }`. The `app://` scheme is registered via `protocol.registerSchemesAsPrivileged` (`standard`, `secure`, `supportFetchAPI`) so that `fetch` also works from the worker. The default size is 80% of the work area height at 4:3; the size and position are remembered in `settings.json`. Minimum 800×600.
- `preload.ts` exposes `window.at` (strictly typed, `src/app/at.d.ts`):
  - `save.load(key)`, `save.write(key, data)`;
  - `settings.get()`, `settings.set(patch)`;
  - `app.toggleFullscreen()`, `app.openExternal(url)` (a whitelist of the authors' domains from Credits), `app.quit()`, `app.getLocalIPv4()`;
  - `net.hostStart(port)`, `net.hostStop()`, `net.onHostEvent(cb)`. The MessagePort for the worker arrives in the preload as an `ipcRenderer.on('sim-port')` event. Because of contextIsolation the preload forwards it to the main world via `window.postMessage('sim-port', '*', [port])`, and `src/app` passes the port to the worker;
  - `discovery.startBeacon(info)`, `discovery.stopBeacon()`, `discovery.startScan()`, `discovery.stopScan()`, `discovery.onUpdate(cb)`.
- Assets are loaded through the custom protocol `app://assets/...` (`protocol.handle`), not through `file://`.
