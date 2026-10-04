// Test helper: loads the generated assets (assets/manifest.json, data/models.json, data/levels/*.json) into an
// AssetRegistry (made current), as the game does at start (the fonts too: Fonts.init() of GameState.create reads them; the effects too: PrepareState registers them). `hasAssets` is false when `npm run extract` has not run.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetRegistry } from '../../../src/engine/assets/AssetRegistry';
import { FileAssetSource } from '../../../src/engine/assets/AssetSource';
import { AntEffectManager } from '../../../src/engine/effects/AntEffectManager';
import { FONT_DATA_NAMES } from '../../../src/game/Fonts';

export const assetsRoot = resolve(process.cwd(), 'assets');

export const hasAssets =
  existsSync(resolve(assetsRoot, 'manifest.json')) &&
  existsSync(resolve(assetsRoot, 'data', 'models.json')) &&
  existsSync(resolve(assetsRoot, 'data', 'levels', 'level20.json'));

export async function loadAssets(): Promise<AssetRegistry> {
  const registry = new AssetRegistry(new FileAssetSource(assetsRoot, (p) => readFile(p)));
  await registry.load();
  await registry.loadModels();
  await registry.loadTexts(); // Text.init() of G.init reads texts.json
  await registry.loadEffects(); // PrepareState registers them (loadEmbeddedXML); the tests skip PrepareState
  AntEffectManager.getInstance().loadEmbeddedXML();
  for (let n = 1; n <= 20; n++) {
    await registry.loadLevel(n);
  }
  for (const font of FONT_DATA_NAMES) {
    await registry.loadFont(font);
  }
  await registry.loadAlphaMasks(); // AntLightEnvironment.isOpaque reads the masks of the shuttle
  try {
    await registry.loadSounds(); // the catalog of AntG.sounds (a game without sounds.json plays nothing)
  } catch {
    // assets/sounds.json is made by the `sounds` step of the extraction
  }
  return registry;
}
