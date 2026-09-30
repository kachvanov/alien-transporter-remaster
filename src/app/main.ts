// Renderer entry (T1.7): FramePlayer + PixiRenderer + InputCollector around a frame source.
// The frame source is the sim worker (SimClient, T1.6).

import { FetchAssetSource } from '../engine/assets/AssetSource';
import { parseManifest } from '../engine/assets/schemas';
import { availableTiers, selectTier } from '../render/atlasMath';
import { AtlasLoader } from '../render/AtlasLoader';
import { FramePlayer } from '../render/FramePlayer';
import { InputCollector } from '../render/InputCollector';
import { PerfOverlay } from '../render/PerfOverlay';
import { PixiRenderer } from '../render/PixiRenderer';
import { SimClient } from './SimClient';

const ASSETS_URL = 'app://assets/';

async function bootstrap(): Promise<void> {
  const flags = window.at.app.flags;
  const root = document.documentElement;

  const manifest = parseManifest(await new FetchAssetSource(ASSETS_URL).readText('manifest.json'));
  const tier = selectTier({
    override: flags.tier,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    available: availableTiers(manifest),
  });
  root.dataset['tier'] = tier;
  root.dataset['classic'] = String(flags.classic);

  const atlas = new AtlasLoader(manifest, tier, ASSETS_URL);
  void atlas.loadStartup();
  const renderer = await PixiRenderer.create(document.body, atlas);
  const player = new FramePlayer({ classic: flags.classic });
  const perf = new PerfOverlay(document.body);
  let frameBytes = 0;
  let tickCostMs = 0;

  // --- frame source: the sim worker ---
  let lastReport = 0;
  const sim = new SimClient({
    seed: (Math.random() * 0x100000000) >>> 0,
    assetBase: ASSETS_URL,
    at: window.at,
    onFrame: (buffer) => {
      frameBytes = buffer.byteLength;
      player.push(buffer, performance.now());
      const cur = player.current;
      if (cur !== null) {
        tickCostMs = cur.tickCost / 100;
        // Test hook for the Playwright smoke test: the tick number of the last frame.
        root.dataset['ticks'] = String(cur.tick + 1);
      }
      const now = performance.now();
      if (now - lastReport >= 5000) {
        lastReport = now;
        root.dataset['simFps'] = sim.framesPerSecond.toFixed(1);
        console.info(`[sim] ${sim.framesPerSecond.toFixed(1)} frames/s, ${buffer.byteLength} bytes`);
      }
    },
    onReady: () => {
      if (flags.startLevel !== null) sim.command('startLevel', [flags.startLevel]);
    },
  });
  sim.start();

  // --- input ---
  let inputDirty = false;
  const input = new InputCollector({
    target: window as unknown as ConstructorParameters<typeof InputCollector>[0]['target'],
    letterbox: () => renderer.letterbox,
    onChange: () => {
      inputDirty = true;
    },
    onHotkey: (h) => {
      if (h === 'fullscreen') void window.at.app.toggleFullscreen();
      else perf.toggle();
    },
  });
  input.attach();

  // --- display loop (display refresh rate) ---
  const loop = (now: number): void => {
    if (inputDirty) {
      inputDirty = false;
      sim.sendInput(input.snapshot());
    }
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
