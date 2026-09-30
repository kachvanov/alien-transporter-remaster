// Renderer entry (T1.7): FramePlayer + PixiRenderer + InputCollector around a frame source.
// TEMPORARY frame source: the test scene of src/sim/testWorker.ts. T1.6 (SimClient) and T1.9e replace it.

import { FetchAssetSource } from '../engine/assets/AssetSource';
import { parseManifest } from '../engine/assets/schemas';
import { availableTiers, selectTier } from '../render/atlasMath';
import { AtlasLoader } from '../render/AtlasLoader';
import { FramePlayer } from '../render/FramePlayer';
import { InputCollector } from '../render/InputCollector';
import { PerfOverlay } from '../render/PerfOverlay';
import { PixiRenderer } from '../render/PixiRenderer';

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

  // --- frame source (temporary: test scene) ---
  const worker = new Worker(new URL('../sim/testWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<{ type: string; n?: number; buffer?: ArrayBuffer; message?: string }>) => {
    const m = ev.data;
    if (m.type === 'frame' && m.buffer !== undefined) {
      frameBytes = m.buffer.byteLength;
      player.push(m.buffer, performance.now());
      const cur = player.current;
      if (cur !== null) tickCostMs = cur.tickCost / 100;
    } else if (m.type === 'tick' && m.n !== undefined) {
      // Test hook for the Playwright smoke test.
      root.dataset['ticks'] = String(m.n);
    } else if (m.type === 'error') {
      console.error('sim worker:', m.message);
    }
  };

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
      worker.postMessage({ type: 'input', snapshot: input.snapshot() });
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
