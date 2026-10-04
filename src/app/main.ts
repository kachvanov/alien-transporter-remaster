// Renderer entry (T1.7): FramePlayer + PixiRenderer + InputCollector around a frame source.
// The frame source is the sim worker (SimClient, T1.6) or, with `--join=ip[:port]` (T3.3), the network: the frames of the
// host come through ClientSession -> JitterBuffer, the local worker is not started.

import { FetchAssetSource } from '../engine/assets/AssetSource';
import { parseManifest, SoundsSchema } from '../engine/assets/schemas';
import { AudioEngine } from '../audio/AudioEngine';
import { ClientInputMapper, GAME_SAVE_KEY, keyNamesFromSave, shipFromSave } from '../net/clientInput';
import { ClientSession, closeText, type SessionCloseReason } from '../net/clientSession';
import { JitterBuffer } from '../net/JitterBuffer';
import { availableTiers, selectTier } from '../render/atlasMath';
import { AtlasLoader } from '../render/AtlasLoader';
import { ClientOverlay } from '../render/ClientOverlay';
import { ClientOverlayModel } from '../render/ClientOverlayModel';
import type { ClientOverlayResult } from '../render/ClientOverlayModel';
import { FramePlayer } from '../render/FramePlayer';
import { InputCollector } from '../render/InputCollector';
import { PerfOverlay } from '../render/PerfOverlay';
import { PixiRenderer } from '../render/PixiRenderer';
import { SettingsMenuModel } from '../render/RemasterSettingsModel';
import { RemasterSettingsOverlay } from '../render/RemasterSettingsOverlay';
import { failureFromHash, joinFailureOf, joinHash, localHash, resolveJoinTarget } from './joinTarget';
import { OnlineController } from './OnlineController';
import { SettingsStore } from './settings';
import { SimClient } from './SimClient';

const ASSETS_URL = 'app://assets/';

async function bootstrap(): Promise<void> {
  const flags = window.at.app.flags;
  const root = document.documentElement;
  // Network client: `--join=ip[:port]` or `#join=ip:port` (set by the Join screen). `#local` is set when the session is over: the local game.
  const joinTarget = resolveJoinTarget(flags.join, window.location.hash);
  root.dataset['mode'] = joinTarget !== null ? 'client' : 'local';

  const manifest = parseManifest(await new FetchAssetSource(ASSETS_URL).readText('manifest.json'));
  // settings.json (T2.8): the command line flags win over it (dev), the overlay of F2 changes it.
  const settings = new SettingsStore(window.at.settings, (e) => console.warn('[settings]', e));
  await settings.load();
  const tiersAvailable = availableTiers(manifest, window.at.app.tiersOnDisk);
  const tier = selectTier({
    override: flags.tier ?? (settings.value.tier === 'auto' ? null : settings.value.tier),
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    // (T4.4: only the tiers whose files are in the build; main looked at the disk)
    available: tiersAvailable,
  });
  root.dataset['tier'] = tier;
  const classic = flags.classic || settings.value.classic35;
  root.dataset['classic'] = String(classic);

  const atlas = new AtlasLoader(manifest, tier, ASSETS_URL);
  void atlas.loadStartup();
  const renderer = await PixiRenderer.create(document.body, atlas);
  const player = new FramePlayer({ classic });
  const perf = new PerfOverlay(document.body);

  // --- sound (T1.8): decoded in the background; the frames play through it ---
  const audio = new AudioEngine();
  audio.attachUserGesture(window);
  {
    const assets = new FetchAssetSource(ASSETS_URL);
    void assets
      .readText('sounds.json')
      .then((text) =>
        audio.init(SoundsSchema.parse(JSON.parse(text)), assets, (name, e) =>
          console.warn('[audio] cannot load ' + name + ':', e),
        ),
      )
      .catch((e: unknown) => console.warn('[audio] init failed:', e));
  }
  let frameBytes = 0;
  let tickCostMs = 0;

  // --- `--perf-log=perf.json` (T4.3): a line per second (FPS of the renderer, the tick of the worker, the size of the Frame) ---
  const perfLog = flags.perfLog !== undefined;
  const perfWindow = { start: performance.now(), t0: performance.now(), renderFrames: 0, simFrames: 0, bytesSum: 0, bytesMax: 0 };

  // --- frame source: the sim worker (not in the client mode: the frames come from the host) ---
  let lastReport = 0;
  // The screens of the LAN game (T3.4) ask this controller for the network.
  const online: OnlineController = new OnlineController({
    at: window.at,
    settings,
    buildHash: manifest.buildHash,
    initialFailure: failureFromHash(window.location.hash),
    // The Join screen (T3.4): the renderer restarts as a network client (the worker dies with it; `goToMenu` below is the way back).
    startClient: (host, port) => {
      window.location.hash = joinHash(host, port);
      window.location.reload();
    },
    // The host (T3.2): the WebSocket server is in the main process, the bridge port goes to the worker (`sim-port` below).
    server: {
      start: (port) => window.at.net.hostStart({ port, buildHash: manifest.buildHash }),
      stop: () => void window.at.net.hostStop().catch((e: unknown) => console.warn('[net] hostStop failed:', e)),
    },
  });
  window.at.net.onHostEvent((e) => {
    if (e.k === 'joined') online.peerConnected(e.name);
    else if (e.k === 'left') online.peerDisconnected();
    else console.warn('[net] host: ' + e.message);
  });
  let sim: SimClient | null = null;
  if (joinTarget === null) sim = new SimClient({
    seed: (Math.random() * 0x100000000) >>> 0,
    assetBase: ASSETS_URL,
    at: window.at,
    onPerf: perfLog
      ? (sample) => {
          const now = performance.now();
          const seconds = Math.max(0.001, (now - perfWindow.start) / 1000);
          const frames = Math.max(1, perfWindow.simFrames);
          const entry = {
            t: (now - perfWindow.t0) / 1000,
            fps: perfWindow.renderFrames / seconds,
            simFps: perfWindow.simFrames / seconds,
            ...sample,
            frameBytesMean: perfWindow.bytesSum / frames,
            frameBytesMax: perfWindow.bytesMax,
            vramMB: atlas.vramBytes / 1048576,
          };
          perfWindow.start = now;
          perfWindow.renderFrames = 0;
          perfWindow.simFrames = 0;
          perfWindow.bytesSum = 0;
          perfWindow.bytesMax = 0;
          // (test hooks of tools/perf/measure.ts: the atlas memory and the pages whose CPU copy is not closed yet)
          root.dataset['vramMB'] = (atlas.vramBytes / 1048576).toFixed(1);
          root.dataset['atlasPages'] = String(atlas.pageCount);
          root.dataset['bitmapPages'] = String(atlas.pagesWithBitmap);
          window.at.dev.perfLog(entry).catch((e: unknown) => console.warn('[perf-log] not written:', e));
        }
      : undefined,
    onFrame: (buffer) => {
      frameBytes = buffer.byteLength;
      if (perfLog) {
        perfWindow.simFrames++;
        perfWindow.bytesSum += frameBytes;
        perfWindow.bytesMax = Math.max(perfWindow.bytesMax, frameBytes);
      }
      player.push(buffer, performance.now());
      const cur = player.current;
      if (cur !== null) {
        audio.apply(cur);
        tickCostMs = cur.tickCost / 100;
        // Test hook for the Playwright smoke test: the tick number of the last frame.
        root.dataset['ticks'] = String(cur.tick + 1);
        root.dataset['levelGroup'] = String(cur.levelGroup);
      }
      const now = performance.now();
      if (now - lastReport >= 5000) {
        lastReport = now;
        const fps = sim?.framesPerSecond ?? 0;
        root.dataset['simFps'] = fps.toFixed(1);
        console.info(`[sim] ${fps.toFixed(1)} frames/s, ${buffer.byteLength} bytes`);
      }
    },
    onQuality: (smooth) => atlas.setSmooth(smooth),
    onOnline: (req) => online.handle(req),
    onReplay: (replay) => {
      window.at.dev
        .saveReplay(replay)
        .then((path) => console.info(`[replay] saved ${replay.ticks} ticks of ${replay.level}: ${path}`))
        .catch((e: unknown) => console.error('[replay] not saved:', e));
    },
    onReady: () => {
      online.onWorkerReady();
      if (flags.startLevel !== null) sim?.command('startLevel', [flags.startLevel]);
    },
  });
  if (sim !== null) online.bind(sim);
  sim?.start();
  // dev, only with `--perf-log`: lets tools/perf/measure.ts change the level (the unload of the previous level atlas)
  if (perfLog && sim !== null) {
    const s = sim;
    (window as unknown as { __atDev: { startLevel(level: string): void } }).__atDev = {
      startLevel: (level) => s.command('startLevel', [level]),
    };
  }
  // The port of the network bridge (electron/preload.ts): main -> the page -> the sim worker.
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data !== 'sim-port') return;
    const port = e.ports[0];
    if (port === undefined) return;
    if (sim !== null) sim.sendSimPort(port);
    else port.close(); // (the network client has no worker to host from)
  });
  // `--host-start` (dev): host at once, as if HostScreen had been opened (the worker answers the screens' events anyway).
  if (flags.hostStart === true && sim !== null) {
    online.handle({ k: 'hostOpen' });
    sim.command('hostSession', [true]); // (the worker is a host: the P2 keys come from the client)
  }

  // --- remaster settings (T2.8): the overlay of F2 ---
  let fullscreen = false;
  let overlay: RemasterSettingsOverlay | null = null;
  const refreshFullscreen = (): void => {
    void window.at.app.isFullscreen().then((v) => {
      if (v !== fullscreen) {
        fullscreen = v;
        menu.refresh();
      }
    });
  };
  const toggleFullscreen = (): void => {
    void window.at.app.toggleFullscreen().then(refreshFullscreen);
  };
  const menu = new SettingsMenuModel({
    settings: () => settings.value,
    update: (patch) => {
      settings.update(patch);
      if (patch.classic35 !== undefined) {
        player.classic = patch.classic35;
        root.dataset['classic'] = String(patch.classic35);
      }
    },
    activeTier: () => tier,
    availableTiers: () => tiersAvailable,
    isFullscreen: () => fullscreen,
    toggleFullscreen,
  });
  refreshFullscreen();
  window.addEventListener('resize', refreshFullscreen); // (the state of a fullscreen switch is known when the window has changed)

  // --- input ---
  let inputDirty = false;
  const input = new InputCollector({
    target: window as unknown as ConstructorParameters<typeof InputCollector>[0]['target'],
    letterbox: () => renderer.letterbox,
    onChange: () => {
      inputDirty = true;
    },
    onHotkey: (h) => {
      if (h === 'fullscreen') toggleFullscreen();
      else if (h === 'settings') openSettings();
      else if (h === 'record') toggleRecording();
      else perf.toggle();
    },
  });

  // F9 (dev build, T4.1): the first press starts the recording of a replay (the level starts anew, see GameLoop.recordStart), the
  // second saves it to tests/golden/replays/.
  let recording = false;
  const toggleRecording = (): void => {
    if (!import.meta.env.DEV || sim === null) return;
    recording = !recording;
    sim.command(recording ? 'recordStart' : 'recordStop');
    root.dataset['recording'] = String(recording);
    console.info(recording ? '[replay] recording...' : '[replay] stopped');
  };

  // While the panel is open no key and no mouse event reaches the game: these listeners run first (capture phase of the
  // window) and stop the event. The simulation stands still (command `freeze`).
  const openSettings = (): void => {
    if (overlay === null || overlay.isOpen) return;
    input.releaseAll();
    sim?.sendInput(input.snapshot());
    menu.refresh();
    overlay.open();
    root.dataset['settingsOpen'] = 'true'; // (test hook)
    sim?.command('freeze', [true]);
  };
  const closeSettings = (): void => {
    if (overlay === null || !overlay.isOpen) return;
    overlay.close();
    root.dataset['settingsOpen'] = 'false';
    input.releaseAll();
    sim?.command('freeze', [false]);
  };
  void RemasterSettingsOverlay.create({
    stage: renderer.app.stage,
    atlas,
    manifest,
    assets: new FetchAssetSource(ASSETS_URL),
    model: menu,
    onClose: closeSettings,
  })
    .then((o) => {
      overlay = o;
    })
    .catch((e: unknown) => console.warn('[settings] overlay unavailable:', e));
  const REPEAT_IGNORED = new Set(['Enter', 'NumpadEnter', 'Space', 'Tab', 'Escape', 'F2']);
  const gate = (e: Event): boolean => {
    if (overlay === null || !overlay.isOpen) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (gate(e) && !(e.repeat && REPEAT_IGNORED.has(e.code))) overlay?.key(e.code, e.key, e.shiftKey);
    },
    true,
  );
  window.addEventListener('keyup', (e) => void gate(e), true);
  window.addEventListener('pointermove', (e) => void (gate(e) && overlay?.pointerMove(e.clientX, e.clientY)), true);
  window.addEventListener('pointerdown', (e) => void (gate(e) && overlay?.pointerDown(e.clientX, e.clientY)), true);
  window.addEventListener('pointerup', (e) => void (gate(e) && overlay?.pointerUp(e.clientX, e.clientY)), true);
  window.addEventListener('wheel', (e) => void gate(e), true);
  input.attach();

  // --- network client (T3.3): ClientSession -> JitterBuffer -> FramePlayer / AudioEngine ---
  let clientKeys: ((keysDown: readonly number[], now: number) => void) | null = null;
  let clientTick: ((now: number) => void) | null = null;
  let clientOverlay: ClientOverlay | null = null;
  if (joinTarget !== null) {
    const savedGame = await window.at.save.load(GAME_SAVE_KEY).catch(() => null);
    // The name that the host shows ("PLAYER 2 CONNECTED: ..."): the name of this machine (T3.7).
    const machineName = (await window.at.app.getHostName().catch(() => '')).trim();
    const mapper = new ClientInputMapper(keyNamesFromSave(savedGame));
    // DEVIATION (T3.7): the floor of the delay is 1 tick, not the 1.5 of docs/03 §6. On a quiet LAN the delay settled at the
    // floor (1.50, 43 ms) and the input delay of the client was ~105 ms; with 1 tick it is ~92 ms (the card asks for <= 100)
    // and 0 underruns in 20 s. A noisy network still raises D by itself (D = 1 + 2 sigma / tick: 1.8-1.9 behind the proxy).
    const jitter = new JitterBuffer({ minDelay: 1 });
    const overlayModel = new ClientOverlayModel();
    // The way back is the local game (the renderer reloads): the main menu, or JoinScreen with the reason when the session failed.
    let closeReason: SessionCloseReason | null = null;
    const goToMenu = (): void => {
      window.location.hash = localHash(joinFailureOf(closeReason));
      window.location.reload();
    };
    const session = new ClientSession({
      onStateChange: (state, reason) => {
        root.dataset['netState'] = state;
        if (reason !== null) root.dataset['netReason'] = reason;
        if (state === 'closed') {
          closeReason = reason;
          input.releaseAll();
          mapper.releaseAll();
          if (reason === 'left') goToMenu();
          else overlayModel.showMessage(closeText(reason ?? 'connection_lost'));
        }
      },
      onFrame: (frame, bytes) => {
        frameBytes = bytes;
        jitter.push(frame, performance.now());
      },
      onNotice: (text) => console.info('[net] host: ' + text),
    });
    const onResult = (result: ClientOverlayResult): void => {
      if (result === 'yes') session.disconnect();
      else if (result === 'no') overlayModel.hide();
      else if (result === 'ok') goToMenu();
    };
    void ClientOverlay.create({
      stage: renderer.app.stage,
      atlas,
      manifest,
      assets: new FetchAssetSource(ASSETS_URL),
      model: overlayModel,
      onResult,
    })
      .then((o) => {
        clientOverlay = o;
      })
      .catch((e: unknown) => console.warn('[net] client overlay unavailable:', e));

    clientKeys = (keysDown, now) => mapper.setKeysDown(keysDown, now);
    clientTick = (now) => {
      // the frames whose tick the playback clock has reached become current: the picture and the sound of each
      for (const r of jitter.update(now)) {
        player.push(r.frame, r.releaseTime, r.spanTicks);
        audio.apply(r.frame);
        tickCostMs = r.frame.tickCost / 100;
        root.dataset['ticks'] = String(r.frame.tick + 1);
        root.dataset['levelGroup'] = String(r.frame.levelGroup);
      }
      root.dataset['jitterDelay'] = jitter.delayTicks.toFixed(2);
      root.dataset['jitterUnderruns'] = String(jitter.underruns); // (T3.7: the smoothness of the client)
      root.dataset['jitterDropped'] = String(jitter.droppedFrames);
      // while an overlay is open the player does not steer the ship
      session.setInput(overlayModel.isOpen ? 0 : mapper.bits(now));
    };

    // Esc: "Disconnect?"; while an overlay is open it takes every key and click (capture phase: before the game input).
    window.addEventListener(
      'keydown',
      (e) => {
        if (overlay?.isOpen === true) return; // (the settings panel has its own gate)
        if (!overlayModel.isOpen) {
          if (e.code !== 'Escape' || session.state === 'closed') return;
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!e.repeat) {
            input.releaseAll();
            mapper.releaseAll();
            overlayModel.showConfirm();
          }
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) onResult(overlayModel.handleKey(e.code));
      },
      true,
    );
    const gateOverlay = (e: Event): boolean => {
      if (!overlayModel.isOpen) return false;
      e.preventDefault();
      e.stopImmediatePropagation();
      return true;
    };
    window.addEventListener('keyup', (e) => void gateOverlay(e), true);
    window.addEventListener('pointermove', (e) => void (gateOverlay(e) && clientOverlay?.pointerMove(e.clientX, e.clientY)), true);
    window.addEventListener('pointerdown', (e) => void (gateOverlay(e) && clientOverlay?.pointerDown(e.clientX, e.clientY)), true);
    window.addEventListener('pointerup', (e) => void (gateOverlay(e) && clientOverlay?.pointerUp(e.clientX, e.clientY)), true);
    window.addEventListener('wheel', (e) => void gateOverlay(e), true);

    session.connect(joinTarget.host, joinTarget.port, {
      buildHash: manifest.buildHash,
      name: machineName !== '' ? machineName : 'Player 2 (' + window.at.platform + ')',
      ship: shipFromSave(savedGame),
    });
  }

  // --- display loop (display refresh rate) ---
  const loop = (now: number): void => {
    perfWindow.renderFrames++;
    if (inputDirty) {
      inputDirty = false;
      const snapshot = input.snapshot();
      sim?.sendInput(snapshot);
      clientKeys?.(snapshot.keysDown, now);
    }
    clientTick?.(now);
    overlay?.update(renderer.letterbox);
    clientOverlay?.update(renderer.letterbox);
    const sample = player.sample(now);
    if (sample !== null) {
      renderer.render(sample);
      root.dataset['sprites'] = String(renderer.stats.sprites);
      perf.update(now, {
        nodes: sample.frame.nodes.length,
        frameBytes,
        tickCostMs,
        sprites: renderer.stats.sprites,
        skipped: renderer.stats.skipped,
        tier,
        vramMB: atlas.vramBytes / 1048576,
        atlasPages: atlas.pageCount,
        alpha: sample.alpha,
      });
    } else {
      renderer.app.renderer.render(renderer.app.stage);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void bootstrap().catch((e: unknown) => {
  console.error('bootstrap failed:', e);
});
