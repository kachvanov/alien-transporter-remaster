// Test helper: loads the generated assets (assets/manifest.json, data/models.json, data/levels/*.json) into an
// AssetRegistry (made current), as the game does at start. `hasAssets` is false when `npm run extract` has not run.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetRegistry } from '../../../src/engine/assets/AssetRegistry';
import { FileAssetSource } from '../../../src/engine/assets/AssetSource';

export const assetsRoot = resolve(process.cwd(), 'assets');

export const hasAssets =
  existsSync(resolve(assetsRoot, 'manifest.json')) &&
  existsSync(resolve(assetsRoot, 'data', 'models.json')) &&
  existsSync(resolve(assetsRoot, 'data', 'levels', 'level20.json'));

export async function loadAssets(): Promise<AssetRegistry> {
  const registry = new AssetRegistry(new FileAssetSource(assetsRoot, (p) => readFile(p)));
  await registry.load();
  await registry.loadModels();
  for (let n = 1; n <= 20; n++) {
    await registry.loadLevel(n);
  }
  return registry;
}
