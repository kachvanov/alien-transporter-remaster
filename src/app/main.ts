// Renderer entry (T1.7): FramePlayer + PixiRenderer + InputCollector around a frame source.
// The frame source is the sim worker (SimClient, T1.6).

import { FetchAssetSource } from '../engine/assets/AssetSource';
import { parseManifest, SoundsSchema } from '../engine/assets/schemas';
import { AudioEngine } from '../audio/AudioEngine';
import { availableTiers, selectTier } from '../render/atlasMath';
import { AtlasLoader } from '../render/AtlasLoader';
import { FramePlayer } from '../render/FramePlayer';
import { InputCollector } from '../render/InputCollector';
import { PerfOverlay } from '../render/PerfOverlay';
import { PixiRenderer } from '../render/PixiRenderer';
import { SettingsMenuModel } from '../render/RemasterSettingsModel';
import { RemasterSettingsOverlay } from '../render/RemasterSettingsOverlay';
import { OnlineController } from './OnlineController';
import { SettingsStore } from './settings';
import { SimClient } from './SimClient';

const ASSETS_URL = 'app://assets/';

async function bootstrap(): Promise<void> {
  const flags = window.at.app.flags;
  const root = document.documentElement;

  const manifest = parseManifest(await new FetchAssetSource(ASSETS_URL).readText('manifest.json'));
  // settings.json (T2.8): the command line flags win over it (dev), the overlay of F2 changes it.
  const settings = new SettingsStore(window.at.settings, (e) => console.warn('[settings]', e));
  await settings.load();
  const tier = selectTier({
    override: flags.tier ?? (settings.value.tier === 'auto' ? null : settings.value.tier),
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    available: availableTiers(manifest),
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

  // --- frame source: the sim worker ---
  let lastReport = 0;
  // The screens of the LAN game (T3.4) ask this controller for the network.
  const online = new OnlineController({ at: window.at, settings, buildHash: manifest.buildHash });
  const sim = new SimClient({
    seed: (Math.random() * 0x100000000) >>> 0,
    assetBase: ASSETS_URL,
    at: window.at,
    onFrame: (buffer) => {
      frameBytes = buffer.byteLength;
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
        root.dataset['simFps'] = sim.framesPerSecond.toFixed(1);
        console.info(`[sim] ${sim.framesPerSecond.toFixed(1)} frames/s, ${buffer.byteLength} bytes`);
      }
    },
    onQuality: (smooth) => atlas.setSmooth(smooth),
    onOnline: (req) => online.handle(req),
    onReady: () => {
      online.onWorkerReady();
      if (flags.startLevel !== null) sim.command('startLevel', [flags.startLevel]);
    },
  });
  online.bind(sim);
  sim.start();

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
      else perf.toggle();
    },
  });

  // While the panel is open no key and no mouse event reaches the game: these listeners run first (capture phase of the
  // window) and stop the event. The simulation stands still (command `freeze`).
  const openSettings = (): void => {
    if (overlay === null || overlay.isOpen) return;
    input.releaseAll();
    sim.sendInput(input.snapshot());
    menu.refresh();
    overlay.open();
    root.dataset['settingsOpen'] = 'true'; // (test hook)
    sim.command('freeze', [true]);
  };
  const closeSettings = (): void => {
    if (overlay === null || !overlay.isOpen) return;
    overlay.close();
    root.dataset['settingsOpen'] = 'false';
    input.releaseAll();
    sim.command('freeze', [false]);
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

  // --- display loop (display refresh rate) ---
  const loop = (now: number): void => {
    if (inputDirty) {
      inputDirty = false;
      sim.sendInput(input.snapshot());
    }
    overlay?.update(renderer.letterbox);
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
