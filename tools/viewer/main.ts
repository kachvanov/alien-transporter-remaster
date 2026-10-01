// Dev Asset Viewer (T0.8). Browser-only dev tool: Symbols / Contact sheet / Level tabs over assets/manifest.json.
// Not part of the game build; imports from src/ only the zod schemas and the AssetSource transport.
//
// URL parameters (used by tools/viewer/shots.ts, handy for bookmarks):
//   ?tab=symbols&symbol=Coin_mc&tier=2x&scale=4&frame=0&play=0
//   ?tab=sheet&group=game-common
//   ?tab=level&level=1&zoom=fit&hide=Back,BG,FG,overlay
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { FetchAssetSource } from '../../src/engine/assets/AssetSource';
import {
  LevelSchema,
  TIER_NAMES,
  TIER_ZOOM,
  parseManifest,
  type Frame,
  type LevelData,
  type Manifest,
  type TierName,
} from '../../src/engine/assets/schemas';
import {
  CATEGORIES,
  CATEGORY_COLOR,
  POINT_RADIUS,
  categoryOf,
  hitTest,
  shapeOf,
  unionBox,
  type Category,
} from './geometry';

/** The original runs at 35 fps. */
const FPS = 35;
const FRAME_MS = 1000 / FPS;
const LEVEL_W = 800;
const LEVEL_H = 600;

type Tab = 'symbols' | 'sheet' | 'level';

// ------------------------------------------------------------------------------------------ helpers

function $<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} not found`);
  return e as T;
}

const params = new URLSearchParams(location.search);

let pending = 0;
function busy(delta: number): void {
  pending += delta;
  if (pending > 0) document.body.dataset.busy = '1';
  else delete document.body.dataset.busy;
}
async function track<T>(p: Promise<T>): Promise<T> {
  busy(1);
  try {
    return await p;
  } finally {
    busy(-1);
  }
}

const source = new FetchAssetSource('/assets/');

// ------------------------------------------------------------------------------------------ state

let manifest!: Manifest;
let tier: TierName = '2x';
let tab: Tab = 'symbols';

// ------------------------------------------------------------------------------------------ atlas / textures

interface Atlas {
  img: HTMLImageElement;
  tex: Texture;
}
const atlasCache = new Map<string, Promise<Atlas>>();

function loadAtlas(t: TierName, key: string): Promise<Atlas> {
  const id = `${t}/${key}`;
  let p = atlasCache.get(id);
  if (!p) {
    const path = manifest.atlases[t][key];
    if (!path) throw new Error(`no atlas ${id}`);
    p = (async () => {
      const img = new Image();
      img.src = `/assets/${path}`;
      await img.decode();
      const tex = Texture.from(img);
      tex.source.scaleMode = $<HTMLInputElement>('pixelated').checked ? 'nearest' : 'linear';
      return { img, tex };
    })();
    atlasCache.set(id, p);
  }
  return p;
}

async function applyScaleMode(): Promise<void> {
  const mode = $<HTMLInputElement>('pixelated').checked ? 'nearest' : 'linear';
  for (const p of atlasCache.values()) (await p).tex.source.scaleMode = mode;
}

const subTexCache = new Map<string, Texture | null>();

/** Sub-texture of a frame in the given tier; `null` for an empty (zero-size) frame. Atlas must be loaded. */
function frameTexture(f: Frame, t: TierName, atlas: Atlas): Texture | null {
  const id = `${f.key}@${t}`;
  const hit = subTexCache.get(id);
  if (hit !== undefined) return hit;
  const [x, y, w, h] = f.tiers[t].rect;
  const tex = w > 0 && h > 0 ? new Texture({ source: atlas.tex.source, frame: new Rectangle(x, y, w, h) }) : null;
  subTexCache.set(id, tex);
  return tex;
}

/** Logical pixels per raster pixel of this frame at this tier (the renderer scales a sprite by `1 / rasterZoom`). */
function rasterZoom(f: Frame, t: TierName): number {
  return TIER_ZOOM[t] * (f.tiers[t].scale ?? 1);
}

async function loadFrames(frames: readonly Frame[], t: TierName): Promise<(Texture | null)[]> {
  const keys = new Set(frames.map((f) => f.tiers[t].atlas));
  const atlases = new Map<string, Atlas>();
  await track(Promise.all([...keys].map(async (k) => atlases.set(k, await loadAtlas(t, k)))));
  return frames.map((f) => {
    const a = atlases.get(f.tiers[t].atlas);
    return a ? frameTexture(f, t, a) : null;
  });
}

function symbolFrames(name: string): Frame[] {
  const ref = manifest.symbols[name];
  if (!ref) return [];
  const out: Frame[] = [];
  for (let i = 0; i < ref.frames; i++) {
    const f = manifest.frames[ref.firstTexId + i];
    if (f) out.push(f);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ Pixi app

const stageEl = $<HTMLDivElement>('stage');
const app = new Application();

const symWorld = new Container();
const symSprite = new Sprite();
const symGfx = new Graphics();
symWorld.addChild(symSprite, symGfx);

const levelWorld = new Container();
const levelLayers = new Container();
const levelOverlay = new Graphics();
const levelHover = new Graphics();
levelWorld.addChild(levelLayers, levelOverlay, levelHover);

// ------------------------------------------------------------------------------------------ Symbols tab

const sym = {
  name: '',
  frames: [] as Frame[],
  textures: [] as (Texture | null)[],
  frame: 0,
  playing: true,
  acc: 0,
  scale: 2,
  loadId: 0,
};

const symbolNames = (): string[] => Object.keys(manifest.symbols).sort((a, b) => a.localeCompare(b));
const groupOfSymbol = (name: string): string => symbolFrames(name)[0]?.group ?? '';

function buildSymbolList(): void {
  const q = $<HTMLInputElement>('search').value.trim().toLowerCase();
  const g = $<HTMLSelectElement>('symGroup').value;
  const ul = $<HTMLUListElement>('symbolList');
  ul.textContent = '';
  const frag = document.createDocumentFragment();
  for (const name of symbolNames()) {
    if (q && !name.toLowerCase().includes(q)) continue;
    if (g && groupOfSymbol(name) !== g) continue;
    const li = document.createElement('li');
    li.dataset.name = name;
    li.textContent = name;
    const small = document.createElement('small');
    small.textContent = `${manifest.symbols[name]?.frames ?? 0}f`;
    li.append(small);
    if (name === sym.name) li.classList.add('sel');
    frag.append(li);
  }
  ul.append(frag);
}

async function selectSymbol(name: string, frame = 0): Promise<void> {
  const frames = symbolFrames(name);
  if (frames.length === 0) return;
  const id = ++sym.loadId;
  const textures = await loadFrames(frames, tier);
  if (id !== sym.loadId) return;
  sym.name = name;
  sym.frames = frames;
  sym.textures = textures;
  sym.frame = Math.min(Math.max(frame, 0), frames.length - 1);
  sym.acc = 0;
  const slider = $<HTMLInputElement>('frameSlider');
  slider.max = String(frames.length - 1);
  for (const li of $('symbolList').children) li.classList.toggle('sel', (li as HTMLElement).dataset.name === name);
  layoutSymbol();
  renderSymbolFrame();
}

/** The registration point stays pinned on the screen: all frames of the symbol are placed around it. */
function layoutSymbol(): void {
  if (sym.frames.length === 0) return;
  const [minX, minY, maxX, maxY] = unionBox(sym.frames);
  const s = sym.scale;
  symWorld.position.set(
    Math.round(app.screen.width / 2 - ((minX + maxX) / 2) * s),
    Math.round(app.screen.height / 2 - ((minY + maxY) / 2) * s),
  );
}

function renderSymbolFrame(): void {
  const f = sym.frames[sym.frame];
  if (!f) return;
  const s = sym.scale;
  const tf = f.tiers[tier];
  const rz = rasterZoom(f, tier);
  const tex = sym.textures[sym.frame] ?? null;
  symSprite.visible = tex !== null;
  if (tex) {
    symSprite.texture = tex;
    symSprite.position.set((tf.trim[0] / rz - f.origin1x[0]) * s, (tf.trim[1] / rz - f.origin1x[1]) * s);
    symSprite.scale.set(s / rz);
  }
  const g = symGfx;
  g.clear();
  if ($<HTMLInputElement>('showBox').checked) {
    g.rect(-f.origin1x[0] * s, -f.origin1x[1] * s, f.size1x[0] * s, f.size1x[1] * s).stroke({
      width: 1,
      color: 0x4aa3ff,
      alpha: 0.9,
      pixelLine: true,
    });
  }
  if ($<HTMLInputElement>('showTrim').checked) {
    const [tx, ty, tw, th] = f.trim1x;
    g.rect((tx - f.origin1x[0]) * s, (ty - f.origin1x[1]) * s, tw * s, th * s).stroke({
      width: 1,
      color: 0x66ff88,
      alpha: 0.9,
      pixelLine: true,
    });
  }
  if ($<HTMLInputElement>('showCross').checked) {
    const L = 12;
    g.moveTo(-L, 0).lineTo(L, 0).moveTo(0, -L).lineTo(0, L).stroke({ width: 1, color: 0xff3030, pixelLine: true });
    g.circle(0, 0, 2.5).stroke({ width: 1, color: 0xff3030, pixelLine: true });
  }
  $<HTMLInputElement>('frameSlider').value = String(sym.frame);
  $('frameLabel').textContent = `${sym.frame + 1}/${sym.frames.length}`;
  const r = tf.rect;
  $('symInfo').textContent = [
    `${sym.name}  (${f.group})`,
    `frame  ${sym.frame + 1}/${sym.frames.length}   key ${f.key}`,
    `size1x   ${f.size1x[0]} x ${f.size1x[1]}`,
    `origin1x ${f.origin1x[0]}, ${f.origin1x[1]}`,
    `trim1x   ${f.trim1x.join(', ')}`,
    `tier ${tier}: ${tf.atlas} rect ${r.join(', ')}${tf.scale ? `  scale ${tf.scale}` : ''}`,
    tex ? '' : 'EMPTY FRAME (no pixels)',
  ]
    .filter(Boolean)
    .join('\n');
}

function setPlaying(p: boolean): void {
  sym.playing = p;
  sym.acc = 0;
  $('play').textContent = p ? 'Pause' : 'Play';
}

function stepFrame(d: number): void {
  const n = sym.frames.length;
  if (n === 0) return;
  setPlaying(false);
  sym.frame = (((sym.frame + d) % n) + n) % n;
  renderSymbolFrame();
}

function onTick(deltaMS: number): void {
  if (tab !== 'symbols' || !sym.playing || sym.frames.length < 2) return;
  sym.acc += deltaMS;
  let moved = false;
  while (sym.acc >= FRAME_MS) {
    sym.acc -= FRAME_MS;
    sym.frame = (sym.frame + 1) % sym.frames.length;
    moved = true;
  }
  if (moved) renderSymbolFrame();
}

// ------------------------------------------------------------------------------------------ Contact sheet

const CELL = 108;

async function buildSheet(): Promise<void> {
  const group = $<HTMLSelectElement>('sheetGroup').value;
  const sheet = $<HTMLDivElement>('sheet');
  sheet.textContent = '';
  const names = symbolNames().filter((n) => groupOfSymbol(n) === group);
  const firsts = names.map((n) => symbolFrames(n)[0]).filter((f): f is Frame => f !== undefined);
  const t = tier;
  const atlasKeys = new Set(firsts.map((f) => f.tiers[t].atlas));
  const atlases = new Map<string, Atlas>();
  await track(Promise.all([...atlasKeys].map(async (k) => atlases.set(k, await loadAtlas(t, k)))));
  if (group !== $<HTMLSelectElement>('sheetGroup').value || t !== tier) return; // superseded
  let empty = 0;
  const dpr = window.devicePixelRatio || 1;
  const frag = document.createDocumentFragment();
  firsts.forEach((f, i) => {
    const name = names[i] ?? f.key;
    const tf = f.tiers[t];
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.title = `${name}\nsize1x ${f.size1x.join(' x ')}  origin1x ${f.origin1x.join(', ')}\nframes ${manifest.symbols[name]?.frames}`;
    cell.addEventListener('click', () => void openSymbol(name));
    const cv = document.createElement('canvas');
    cv.width = CELL * dpr;
    cv.height = CELL * dpr;
    cv.style.width = `${CELL}px`;
    cv.style.height = `${CELL}px`;
    const c = cv.getContext('2d');
    if (c) {
      c.scale(dpr, dpr);
      const fit = Math.min(3, (CELL - 8) / Math.max(f.size1x[0], f.size1x[1], 1));
      const ox = (CELL - f.size1x[0] * fit) / 2;
      const oy = (CELL - f.size1x[1] * fit) / 2;
      c.imageSmoothingEnabled = !$<HTMLInputElement>('pixelated').checked;
      const atlas = atlases.get(tf.atlas);
      const [rx, ry, rw, rh] = tf.rect;
      if (atlas && rw > 0 && rh > 0) {
        const rz = rasterZoom(f, t);
        c.drawImage(atlas.img, rx, ry, rw, rh, ox + (tf.trim[0] / rz) * fit, oy + (tf.trim[1] / rz) * fit, (rw / rz) * fit, (rh / rz) * fit);
      } else {
        empty++;
        cell.classList.add('empty');
      }
      c.strokeStyle = 'rgba(74,163,255,0.7)';
      c.lineWidth = 1;
      c.strokeRect(Math.round(ox) + 0.5, Math.round(oy) + 0.5, Math.round(f.size1x[0] * fit), Math.round(f.size1x[1] * fit));
      const cx = Math.round(ox + f.origin1x[0] * fit) + 0.5;
      const cy = Math.round(oy + f.origin1x[1] * fit) + 0.5;
      c.strokeStyle = '#ff3030';
      c.beginPath();
      c.moveTo(cx - 5, cy);
      c.lineTo(cx + 5, cy);
      c.moveTo(cx, cy - 5);
      c.lineTo(cx, cy + 5);
      c.stroke();
    }
    const label = document.createElement('div');
    label.textContent = name;
    cell.append(cv, label);
    frag.append(cell);
  });
  sheet.append(frag);
  $('sheetInfo').textContent = `group ${group}\nsymbols ${firsts.length}\nempty first frames ${empty}\ntier ${t}`;
}

async function openSymbol(name: string): Promise<void> {
  $<HTMLSelectElement>('symGroup').value = '';
  $<HTMLInputElement>('search').value = '';
  buildSymbolList();
  setTab('symbols');
  await selectSymbol(name);
  $('symbolList').querySelector('li.sel')?.scrollIntoView({ block: 'center' });
}

// ------------------------------------------------------------------------------------------ Level tab

const LAYER_SUFFIX = ['Back', 'BG', 'FG'] as const;
const lvl = {
  n: 1,
  data: null as LevelData | null,
  layers: new Map<string, Sprite>(),
  classOn: new Map<string, boolean>(),
  zoom: 1,
  loadId: 0,
  panned: false,
};

const levelCache = new Map<number, LevelData>();
const levelKey = (n: number): string => String(n).padStart(2, '0');

async function loadLevelData(n: number): Promise<LevelData> {
  const hit = levelCache.get(n);
  if (hit) return hit;
  const data = LevelSchema.parse(JSON.parse(await source.readText(`data/levels/level${levelKey(n)}.json`)));
  levelCache.set(n, data);
  return data;
}

const classEnabled = (cls: string): boolean => lvl.classOn.get(cls) !== false;

async function selectLevel(n: number): Promise<void> {
  const id = ++lvl.loadId;
  const data = await track(loadLevelData(n));
  const frames = LAYER_SUFFIX.map((s) => manifest.frames.find((f) => f.key === `Level${levelKey(n)}${s}_mc#0`));
  const real = frames.filter((f): f is Frame => f !== undefined);
  const textures = await loadFrames(real, tier);
  if (id !== lvl.loadId) return;
  lvl.n = n;
  lvl.data = data;
  levelLayers.removeChildren();
  lvl.layers.clear();
  real.forEach((f, i) => {
    const tex = textures[i];
    if (!tex) return;
    const sp = new Sprite(tex);
    const rz = rasterZoom(f, tier);
    sp.scale.set(1 / rz);
    sp.position.set(f.tiers[tier].trim[0] / rz - f.origin1x[0], f.tiers[tier].trim[1] / rz - f.origin1x[1]);
    levelLayers.addChild(sp);
    lvl.layers.set(f.key.replace(/^Level\d\d/, '').replace(/_mc#0$/, ''), sp);
  });
  applyLayerVisibility();
  buildClassList(data);
  layoutLevel();
  drawOverlay();
  $('levelInfo').textContent = `${data.name}  (${data.clip})\nobjects ${data.objects.length}\nlayers ${[...lvl.layers.keys()].join(', ')}`;
}

function applyLayerVisibility(): void {
  for (const s of LAYER_SUFFIX) {
    const sp = lvl.layers.get(s);
    if (sp) sp.visible = $<HTMLInputElement>(`lay${s}`).checked;
  }
  levelOverlay.visible = $<HTMLInputElement>('layOverlay').checked;
}

function buildClassList(data: LevelData): void {
  const counts = new Map<string, number>();
  for (const o of data.objects) counts.set(o.cls, (counts.get(o.cls) ?? 0) + 1);
  const rank = (c: string): number => CATEGORIES.indexOf(categoryOf(c));
  const classes = [...counts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const box = $<HTMLDivElement>('classList');
  box.textContent = '';
  for (const cls of classes) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = classEnabled(cls);
    cb.addEventListener('change', () => {
      lvl.classOn.set(cls, cb.checked);
      drawOverlay();
    });
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = `#${CATEGORY_COLOR[categoryOf(cls)].toString(16).padStart(6, '0')}`;
    const name = document.createElement('span');
    name.textContent = cls;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = String(counts.get(cls));
    label.append(cb, sw, name, n);
    box.append(label);
  }
}

function setAllClasses(on: boolean): void {
  if (!lvl.data) return;
  for (const o of lvl.data.objects) lvl.classOn.set(o.cls, on);
  buildClassList(lvl.data);
  drawOverlay();
}

function layoutLevel(): void {
  const sel = $<HTMLSelectElement>('levelZoom').value;
  const fit = Math.min(app.screen.width / LEVEL_W, app.screen.height / LEVEL_H);
  lvl.zoom = sel === 'fit' ? Math.max(0.1, fit) : Number(sel);
  levelWorld.scale.set(lvl.zoom);
  levelWorld.position.set(
    Math.round((app.screen.width - LEVEL_W * lvl.zoom) / 2),
    Math.round((app.screen.height - LEVEL_H * lvl.zoom) / 2),
  );
  drawOverlay();
}

function drawShape(g: Graphics, o: LevelData['objects'][number], fillAlpha: number, color: number, lw: number): void {
  const s = shapeOf(o);
  if (s.kind === 'rect') {
    const a = (s.rotation * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const pts: number[] = [];
    for (const [px, py] of [
      [-s.w / 2, -s.h / 2],
      [s.w / 2, -s.h / 2],
      [s.w / 2, s.h / 2],
      [-s.w / 2, s.h / 2],
    ] as const) {
      pts.push(s.x + px * c - py * sn, s.y + px * sn + py * c);
    }
    g.poly(pts, true);
  } else {
    g.circle(s.x, s.y, s.r);
  }
  if (fillAlpha > 0) g.fill({ color, alpha: fillAlpha });
  g.stroke({ width: lw, color, alpha: s.kind === 'point' ? 1 : 0.9 });
}

function drawOverlay(): void {
  levelOverlay.clear();
  levelHover.clear();
  const data = lvl.data;
  if (!data) return;
  const lw = 1 / lvl.zoom;
  for (const o of data.objects) {
    if (!classEnabled(o.cls)) continue;
    const cat: Category = categoryOf(o.cls);
    const color = CATEGORY_COLOR[cat];
    if (cat === 'point' || cat === 'logic') {
      levelOverlay.circle(o.x, o.y, POINT_RADIUS).fill({ color, alpha: 0.85 }).stroke({ width: lw, color: 0xffffff });
    } else {
      drawShape(levelOverlay, o, cat === 'ground' ? 0.35 : 0.3, color, lw);
    }
  }
}

function levelPointer(ev: PointerEvent): { x: number; y: number } {
  const r = app.canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left - levelWorld.x) / lvl.zoom, y: (ev.clientY - r.top - levelWorld.y) / lvl.zoom };
}

function onLevelMove(ev: PointerEvent): void {
  const tip = $<HTMLPreElement>('tip');
  const data = lvl.data;
  if (tab !== 'level' || !data || !levelOverlay.visible) {
    tip.style.display = 'none';
    return;
  }
  if (ev.buttons & 1) {
    levelWorld.x += ev.movementX;
    levelWorld.y += ev.movementY;
    lvl.panned = true;
  }
  const p = levelPointer(ev);
  const hits = hitTest(data.objects, p.x, p.y, classEnabled);
  levelHover.clear();
  const o = hits[0];
  if (!o) {
    tip.style.display = 'none';
    return;
  }
  drawShape(levelHover, o, 0, 0xffffff, 2 / lvl.zoom);
  const props = Object.entries(o.props)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n');
  tip.textContent = [
    `${o.cls}${hits.length > 1 ? `   (+${hits.length - 1} under cursor)` : ''}`,
    `alias: ${'alias' in o.props ? JSON.stringify(o.props.alias) : '-'}   name: ${o.instanceName ?? '-'}   depth ${o.depth}`,
    `x ${o.x.toFixed(2)}  y ${o.y.toFixed(2)}  rot ${o.rotation.toFixed(2)}`,
    `w ${o.width.toFixed(2)}  h ${o.height.toFixed(2)}  scale ${o.scaleX.toFixed(3)}, ${o.scaleY.toFixed(3)}`,
    props ? `props:\n${props}` : 'props: {}',
  ].join('\n');
  tip.style.display = 'block';
  tip.style.left = `${Math.min(ev.clientX + 16, window.innerWidth - 400)}px`;
  tip.style.top = `${Math.min(ev.clientY + 16, window.innerHeight - tip.offsetHeight - 8)}px`;
}

// ------------------------------------------------------------------------------------------ tabs / wiring

function setTab(t: Tab): void {
  tab = t;
  for (const b of document.querySelectorAll<HTMLButtonElement>('button.tab')) {
    b.classList.toggle('active', b.dataset.tab === t);
  }
  for (const id of ['symbols', 'sheet', 'level']) $(`panel-${id}`).classList.toggle('hidden', id !== t);
  $('stage').classList.toggle('hidden', t === 'sheet');
  $('sheet').classList.toggle('hidden', t !== 'sheet');
  $('tip').style.display = 'none';
  if (t !== 'sheet') {
    app.resize();
    app.stage.removeChildren();
    app.stage.addChild(t === 'symbols' ? symWorld : levelWorld);
    if (t === 'symbols') {
      layoutSymbol();
      renderSymbolFrame();
    } else {
      layoutLevel();
      if (!lvl.data) void selectLevel(lvl.n);
    }
  } else {
    void buildSheet();
  }
}

async function reloadForTier(): Promise<void> {
  if (sym.name) await selectSymbol(sym.name, sym.frame);
  if (lvl.data) await selectLevel(lvl.n);
  if (tab === 'sheet') await buildSheet();
}

function fillSelect(sel: HTMLSelectElement, values: string[], withAll: boolean): void {
  sel.textContent = '';
  if (withAll) sel.append(new Option('all groups', ''));
  for (const v of values) sel.append(new Option(v, v));
}

async function main(): Promise<void> {
  busy(1);
  manifest = parseManifest(await source.readText('manifest.json'));
  await app.init({
    resizeTo: stageEl,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  });
  stageEl.append(app.canvas);
  app.ticker.add((t) => onTick(t.deltaMS));

  const q = (k: string): string | null => params.get(k);
  const qt = q('tier');
  if (qt && (TIER_NAMES as readonly string[]).includes(qt)) tier = qt as TierName;
  $<HTMLSelectElement>('tier').value = tier;
  const sc = Number(q('scale') ?? '2');
  sym.scale = sc > 0 ? sc : 2;
  $<HTMLSelectElement>('scale').value = String(sym.scale);

  const groups = [...new Set(manifest.frames.map((f) => f.group))];
  fillSelect($('symGroup') as HTMLSelectElement, groups, true);
  fillSelect($('sheetGroup') as HTMLSelectElement, groups, false);
  const levelSel = $<HTMLSelectElement>('levelSel');
  for (let n = 1; n <= 20; n++) levelSel.append(new Option(`Level ${levelKey(n)}`, String(n)));
  const ql = Number(q('level') ?? '1');
  lvl.n = ql >= 1 && ql <= 20 ? ql : 1;
  levelSel.value = String(lvl.n);
  $<HTMLSelectElement>('levelZoom').value = q('zoom') ?? 'fit';
  for (const h of (q('hide') ?? '').split(',')) {
    const cb = document.getElementById(h === 'overlay' ? 'layOverlay' : `lay${h}`);
    if (cb instanceof HTMLInputElement) cb.checked = false;
  }
  const qg = q('group');
  if (qg && groups.includes(qg)) $<HTMLSelectElement>('sheetGroup').value = qg;
  buildSymbolList();

  // --- events
  for (const b of document.querySelectorAll<HTMLButtonElement>('button.tab')) {
    b.addEventListener('click', () => setTab(b.dataset.tab as Tab));
  }
  $('tier').addEventListener('change', () => {
    tier = $<HTMLSelectElement>('tier').value as TierName;
    void reloadForTier();
  });
  $('pixelated').addEventListener('change', () => {
    void applyScaleMode();
    if (tab === 'sheet') void buildSheet();
  });
  $('search').addEventListener('input', buildSymbolList);
  $('symGroup').addEventListener('change', buildSymbolList);
  $('symbolList').addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (li?.dataset.name) void selectSymbol(li.dataset.name);
  });
  $('play').addEventListener('click', () => setPlaying(!sym.playing));
  $('prev').addEventListener('click', () => stepFrame(-1));
  $('next').addEventListener('click', () => stepFrame(1));
  $('frameSlider').addEventListener('input', () => {
    setPlaying(false);
    sym.frame = Number($<HTMLInputElement>('frameSlider').value);
    renderSymbolFrame();
  });
  $('scale').addEventListener('change', () => {
    sym.scale = Number($<HTMLSelectElement>('scale').value);
    layoutSymbol();
    renderSymbolFrame();
  });
  for (const id of ['showBox', 'showTrim', 'showCross']) $(id).addEventListener('change', renderSymbolFrame);
  window.addEventListener('keydown', (e) => {
    if (tab !== 'symbols' || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying(!sym.playing);
    } else if (e.key === 'ArrowLeft') stepFrame(-1);
    else if (e.key === 'ArrowRight') stepFrame(1);
  });
  $('sheetGroup').addEventListener('change', () => void buildSheet());
  levelSel.addEventListener('change', () => void selectLevel(Number(levelSel.value)));
  $('levelZoom').addEventListener('change', layoutLevel);
  for (const id of ['layBack', 'layBG', 'layFG', 'layOverlay']) $(id).addEventListener('change', applyLayerVisibility);
  $('clsAll').addEventListener('click', () => setAllClasses(true));
  $('clsNone').addEventListener('click', () => setAllClasses(false));
  app.canvas.addEventListener('pointermove', onLevelMove);
  app.canvas.addEventListener('pointerleave', () => {
    $('tip').style.display = 'none';
    levelHover.clear();
  });
  new ResizeObserver(() => {
    if (tab === 'sheet') return;
    app.resize();
    if (tab === 'symbols') layoutSymbol();
    else if ($<HTMLSelectElement>('levelZoom').value === 'fit') layoutLevel();
  }).observe(stageEl);

  // --- initial state
  const startSymbol = q('symbol') ?? 'Coin_mc';
  setPlaying(q('play') !== '0');
  await selectSymbol(startSymbol, Number(q('frame') ?? '0'));
  const qTab = q('tab');
  setTab(qTab === 'sheet' || qTab === 'level' ? qTab : 'symbols');
  $('status').textContent = `${Object.keys(manifest.symbols).length} symbols, ${manifest.frames.length} frames`;
  busy(-1);
}

main().catch((e: unknown) => {
  $('status').textContent = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  document.body.dataset.error = '1';
  busy(-pending);
  throw e;
});
