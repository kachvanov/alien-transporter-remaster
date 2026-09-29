// Sprite whitelist / blacklist (docs/02-extraction-pipeline.md §4.2).
// The whitelist is collected from the decompiled AS3 code and game data, then checked
// against symbols.json. Output: build/extract/whitelist.json.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SymbolInfo } from './types';

/** Symbols never exported into the game (02 §4.2). LevelNNPhysic_mc are added programmatically. */
export const BLACKLIST_NAMES: readonly string[] = [
  'AGIntro_mc',
  'Preloader',
  'PreloaderBG_mc',
  'PreloaderBar_mc',
  'BtnArmor_mc',
  'BtnArmorGames_mc',
  'BtnArmorLogoSmall_mc',
  'BtnMoreGames_mc',
  'BtnFaceBook_mc',
  'BtnTwitter_mc',
  'BtnPatreon_mc',
];

export const LEVEL_COUNT = 20;

export function levelNumbers(): string[] {
  return Array.from({ length: LEVEL_COUNT }, (_, i) => String(i + 1).padStart(2, '0'));
}

export function isBlacklisted(name: string): boolean {
  return BLACKLIST_NAMES.includes(name) || /^Level\d\dPhysic_mc$/.test(name);
}

/** Where a whitelisted name was found. */
export type WhitelistSource = 'assets' | 'cache' | 'effects' | 'literal' | 'level' | 'xml';

export interface WhitelistEntry {
  name: string;
  id: number;
  sources: WhitelistSource[];
}

export interface WhitelistReport {
  /** Whitelisted symbols that exist in the SWF (sorted by name). */
  symbols: WhitelistEntry[];
  /** Whitelisted names that are not in the SWF and are referenced by real code: an error. */
  missing: { name: string; sources: WhitelistSource[] }[];
  /**
   * Names missing from the SWF that are only mentioned in the editor-only CacheList of
   * effects.xml (AntEffectManager._clips is used solely by loadResources in EDITOR_MODE)
   * or as a bare string literal: reported as warnings.
   */
  missingWeak: { name: string; sources: WhitelistSource[] }[];
  /** SWF sprites with a class name that are neither whitelisted nor blacklisted (warning). */
  unaccounted: string[];
  /** The subset of `unaccounted` that is physics markup (`*_com`, `*Model_mc`, `*Ragdoll_mc`). */
  unaccountedPhysics: string[];
  /** Blacklisted names that were also collected by the whitelist rules (dropped). */
  blacklisted: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

type Collector = Map<string, Set<WhitelistSource>>;

function add(c: Collector, name: string, source: WhitelistSource): void {
  let set = c.get(name);
  if (!set) {
    set = new Set();
    c.set(name, set);
  }
  set.add(source);
}

/** Pure collection of candidate names from the reference tree (no symbols.json needed). */
export function collectCandidates(root: string): Collector {
  const c: Collector = new Map();
  const refAs3 = join(root, 'reference', 'as3');
  const refData = join(root, 'reference', 'data');

  // 1. Assets.as: `new <Class>[A_mc, B_mc, ...]`.
  const assets = readFileSync(join(refAs3, 'ru', 'alientransporter', 'Assets.as'), 'utf8');
  const list = /new <Class>\[([^\]]*)\]/.exec(assets);
  if (!list?.[1]) throw new Error('Assets.as: getGraphics() class list not found');
  for (const n of list[1].split(',')) if (n.trim()) add(c, n.trim(), 'assets');

  const files = walk(join(refAs3, 'ru')).filter((f) => f.endsWith('.as'));
  const uiDirs = /[\\/]ru[\\/]alientransporter[\\/](screens|ui|views|states)[\\/]/;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    // 2. addAnimationFromCache("X", ...) literals.
    for (const m of text.matchAll(/addAnimationFromCache\("([^"]+)"/g))
      add(c, m[1] as string, 'cache');
    // 4. "..._mc" literals in screens/ui/views/states.
    if (uiDirs.test(f)) {
      for (const m of text.matchAll(/"([A-Za-z0-9_]+_mc)"/g)) add(c, m[1] as string, 'literal');
    }
  }

  // 3. effects.xml CacheList.
  const effects = readFileSync(join(refData, 'effects.xml'), 'utf8');
  const cache = /<CacheList>([\s\S]*?)<\/CacheList>/.exec(effects);
  if (!cache?.[1]) throw new Error('effects.xml: CacheList not found');
  for (const m of cache[1].matchAll(/<Clip name="([^"]+)"/g)) add(c, m[1] as string, 'effects');

  // 5. Level layers.
  for (const nn of levelNumbers()) {
    for (const layer of ['Back', 'BG', 'FG']) add(c, `Level${nn}${layer}_mc`, 'level');
  }

  // 6. Attribute values "..._mc" in reference/data/*.xml.
  if (existsSync(refData)) {
    for (const f of readdirSync(refData).filter((n) => n.endsWith('.xml'))) {
      const text = readFileSync(join(refData, f), 'utf8');
      // effects.xml only feeds the editor (backgroundClip, CacheList): keep it as a weak source.
      const source: WhitelistSource = f === 'effects.xml' ? 'effects' : 'xml';
      for (const m of text.matchAll(/="([A-Za-z0-9_]+_mc)"/g)) add(c, m[1] as string, source);
    }
  }
  return c;
}

// Level/model markup: components, physics models, ragdolls and the editor point markers.
const PHYSICS_RE = /(_com|Model_mc|Ragdoll(\d\d)?_mc)$|^(KeyPoint|SpawnPoint|CoinPoint)_mc$/;

export function buildWhitelist(root: string, symbols: SymbolInfo[]): WhitelistReport {
  const cand = collectCandidates(root);
  const sprites = new Map<string, SymbolInfo>();
  for (const s of symbols) if (s.kind === 'sprite' && s.className) sprites.set(s.className, s);

  const entries: WhitelistEntry[] = [];
  const missing: WhitelistReport['missing'] = [];
  const missingWeak: WhitelistReport['missingWeak'] = [];
  const blacklisted: string[] = [];
  for (const [name, srcSet] of [...cand].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sources = [...srcSet].sort();
    if (isBlacklisted(name)) {
      blacklisted.push(name);
      continue;
    }
    const sym = sprites.get(name);
    if (!sym) {
      const weak = sources.every((s) => s === 'effects' || s === 'literal');
      (weak ? missingWeak : missing).push({ name, sources });
      continue;
    }
    entries.push({ name, id: sym.id, sources });
  }

  const known = new Set(entries.map((e) => e.name));
  const unaccounted = [...sprites.keys()].filter((n) => !known.has(n) && !isBlacklisted(n)).sort();
  return {
    symbols: entries,
    missing,
    missingWeak,
    unaccounted: unaccounted.filter((n) => !PHYSICS_RE.test(n)),
    unaccountedPhysics: unaccounted.filter((n) => PHYSICS_RE.test(n)),
    blacklisted,
  };
}
