import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import type { Frame } from '../../src/engine/assets/schemas';
import { FRAME_SCENE_RESET, NODE_TELEPORT } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import type { FrameData, NodeData } from '../../src/frame/types';
import {
  frameGeometry,
  groupAtlasKeys,
  levelGroupName,
  parseAtlasKey,
  selectTier,
} from '../../src/render/atlasMath';
import { FramePlayer, lerpAngle, TICK_MS } from '../../src/render/FramePlayer';
import { hotkeyOf, InputCollector } from '../../src/render/InputCollector';
import type { InputEventLike } from '../../src/render/InputCollector';
import { computeLetterbox, windowToLogical } from '../../src/render/Letterbox';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { FrameWriter } from '../../src/frame/FrameWriter';

//---------------------------------------
// Letterbox
//---------------------------------------

describe('Letterbox', () => {
  it('exact 4:3 window: scale 1, no margins', () => {
    expect(computeLetterbox(800, 600)).toEqual({ scale: 1, x: 0, y: 0, width: 800, height: 600 });
  });

  it('a wide window gets bars on the left and right', () => {
    const lb = computeLetterbox(1600, 600);
    expect(lb.scale).toBe(1);
    expect(lb.x).toBe(400);
    expect(lb.y).toBe(0);
    expect(lb.width).toBe(800);
  });

  it('a tall window gets bars on the top and bottom, the aspect stays 4:3', () => {
    const lb = computeLetterbox(800, 1200);
    expect(lb.scale).toBe(1);
    expect(lb.x).toBe(0);
    expect(lb.y).toBe(300);
    const lb2 = computeLetterbox(1234, 987);
    expect(lb2.width / lb2.height).toBeCloseTo(4 / 3, 10);
    expect(lb2.x * 2 + lb2.width).toBeCloseTo(1234, 8);
    expect(lb2.y * 2 + lb2.height).toBeCloseTo(987, 8);
  });

  it('fullscreen 1920x1080: 1440x1080 stage centred', () => {
    const lb = computeLetterbox(1920, 1080);
    expect(lb.scale).toBeCloseTo(1.8, 10);
    expect(lb.width).toBeCloseTo(1440, 8);
    expect(lb.x).toBeCloseTo(240, 8);
    expect(lb.y).toBe(0);
  });

  it('degenerate window sizes do not give NaN', () => {
    const lb = computeLetterbox(0, 0);
    expect(Number.isFinite(lb.scale)).toBe(true);
    expect(lb.scale).toBeGreaterThan(0);
  });

  it('windowToLogical inverts the letterbox', () => {
    const lb = computeLetterbox(1920, 1080);
    expect(windowToLogical(240, 0, lb)).toEqual({ x: 0, y: 0 });
    const p = windowToLogical(240 + 1440, 1080, lb);
    expect(p.x).toBeCloseTo(800, 8);
    expect(p.y).toBeCloseTo(600, 8);
    // over the left bar: negative logical x
    expect(windowToLogical(0, 540, lb).x).toBeLessThan(0);
    const mid = windowToLogical(960, 540, lb);
    expect(mid.x).toBeCloseTo(400, 8);
    expect(mid.y).toBeCloseTo(300, 8);
  });
});

//---------------------------------------
// Tier, anchor, atlas keys
//---------------------------------------

const allTiers = ['1x', '2x', '3x'] as const;

describe('selectTier', () => {
  it('auto: 3x from 1500 physical pixels, else 2x', () => {
    const base = { override: null, available: allTiers } as const;
    expect(selectTier({ ...base, innerHeight: 750, devicePixelRatio: 2 })).toBe('3x');
    expect(selectTier({ ...base, innerHeight: 749, devicePixelRatio: 2 })).toBe('2x');
    expect(selectTier({ ...base, innerHeight: 1080, devicePixelRatio: 1 })).toBe('2x');
    expect(selectTier({ ...base, innerHeight: 1500, devicePixelRatio: 1 })).toBe('3x');
  });

  it('3x is used only when the manifest has it', () => {
    expect(selectTier({ override: null, innerHeight: 2000, devicePixelRatio: 2, available: ['1x', '2x'] })).toBe('2x');
    expect(selectTier({ override: null, innerHeight: 2000, devicePixelRatio: 2, available: ['1x'] })).toBe('1x');
  });

  it('the --tier flag wins when the tier exists', () => {
    expect(selectTier({ override: '1x', innerHeight: 2000, devicePixelRatio: 2, available: allTiers })).toBe('1x');
    expect(selectTier({ override: '3x', innerHeight: 600, devicePixelRatio: 1, available: allTiers })).toBe('3x');
    expect(selectTier({ override: '3x', innerHeight: 600, devicePixelRatio: 1, available: ['1x', '2x'] })).toBe('2x');
  });
});

function makeFrame(over: Partial<Frame['tiers']['3x']> = {}): Frame {
  // Coin_mc#0 of the real manifest
  return {
    key: 'Coin_mc#0',
    group: 'game-common',
    size1x: [24.4, 23.65],
    origin1x: [11.9, 11.95],
    trim1x: [5, 5, 14, 14],
    tiers: {
      '1x': { atlas: 'game-common-0', rect: [3827, 2049, 14, 14], trim: [5, 5, 14, 14] },
      '2x': { atlas: 'game-common-0', rect: [3920, 2692, 26, 26], trim: [11, 11, 26, 26] },
      '3x': { atlas: 'game-common-0', rect: [1749, 3625, 40, 39], trim: [16, 16, 40, 39], ...over },
    },
  };
}

describe('frameGeometry (anchor and scale)', () => {
  it('1x: anchor = (origin1x - trim1x.xy) / trim1x.wh, scale 1', () => {
    const g = frameGeometry(makeFrame(), '1x');
    expect(g.anchorX).toBeCloseTo((11.9 - 5) / 14, 10);
    expect(g.anchorY).toBeCloseTo((11.95 - 5) / 14, 10);
    expect(g.baseScale).toBe(1);
    expect(g.rect).toEqual([3827, 2049, 14, 14]);
  });

  it('3x: the registration point of the raster, scale 1/3', () => {
    const g = frameGeometry(makeFrame(), '3x');
    expect(g.baseScale).toBeCloseTo(1 / 3, 12);
    expect(g.anchorX).toBeCloseTo((11.9 * 3 - 16) / 40, 10);
    expect(g.anchorY).toBeCloseTo((11.95 * 3 - 16) / 39, 10);
    // same point as the 1x formula within a sub-pixel of the 1x picture
    expect(Math.abs(g.anchorX - (11.9 - 5) / 14) * 40 * g.baseScale).toBeLessThan(0.1);
    expect(g.atlas).toBe('game-common-0');
  });

  it('a lower raster standing in for the tier (`scale`) is drawn at 1 / (zoom * scale)', () => {
    // the 2x raster used for 3x: scale = 2/3
    const f: Frame = {
      ...makeFrame(),
      origin1x: [400, 300],
      trim1x: [0, 0, 800, 600],
      tiers: {
        '1x': { atlas: 'g-0', rect: [0, 0, 800, 600], trim: [0, 0, 800, 600] },
        '2x': { atlas: 'g-0', rect: [0, 0, 800, 600], trim: [0, 0, 800, 600], scale: 0.5 },
        '3x': { atlas: 'g-0', rect: [0, 0, 800, 600], trim: [0, 0, 800, 600], scale: 1 / 3 },
      },
    };
    const g = frameGeometry(f, '3x');
    expect(g.baseScale).toBeCloseTo(1, 12);
    expect(g.anchorX).toBeCloseTo(0.5, 10);
    expect(g.anchorY).toBeCloseTo(0.5, 10);
  });
});

describe('atlas keys', () => {
  it('parseAtlasKey splits group and page', () => {
    expect(parseAtlasKey('level-01-1')).toEqual({ group: 'level-01', page: 1 });
    expect(parseAtlasKey('game-common-0')).toEqual({ group: 'game-common', page: 0 });
    expect(parseAtlasKey('nonsense')).toBeNull();
  });

  it('groupAtlasKeys collects the pages of one group only, sorted', () => {
    const atlases = {
      '1x': {},
      '2x': {},
      '3x': { 'ui-1': 'a', 'ui-0': 'b', 'level-01-0': 'c', 'level-01-1': 'd', 'level-010-0': 'e' },
    };
    expect(groupAtlasKeys({ atlases }, '3x', 'ui')).toEqual(['ui-0', 'ui-1']);
    expect(groupAtlasKeys({ atlases }, '3x', 'level-01')).toEqual(['level-01-0', 'level-01-1']);
    expect(groupAtlasKeys({ atlases }, '2x', 'ui')).toEqual([]);
  });

  it('levelGroupName', () => {
    expect(levelGroupName(1)).toBe('level-01');
    expect(levelGroupName(20)).toBe('level-20');
    expect(levelGroupName(0xffff)).toBeNull();
    expect(levelGroupName(0)).toBeNull();
    expect(levelGroupName(21)).toBeNull();
  });
});

//---------------------------------------
// FramePlayer
//---------------------------------------

function node(uid: number, x: number, y: number, rotation = 0, flags = 0): NodeData {
  return { uid, texId: 1, flags, x, y, rotation, scaleX: 1, scaleY: 1, alpha: 255, tint: 0xffffff };
}

function frame(nodes: NodeData[], tick = 0, flags = 0): FrameData {
  return {
    tick,
    flags,
    musicTrack: 0xffff,
    musicVol: 0,
    muteFlags: 0,
    levelGroup: 0xffff,
    tickCost: 0,
    nodes,
    oneShots: [],
    loops: [],
  };
}

describe('FramePlayer', () => {
  it('lerpAngle takes the shortest arc, also across +-pi', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    // 3.0 -> -3.0 is a step of 2*pi - 6 = 0.2832 through pi
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(3.0 + (2 * Math.PI - 6) / 2, 12);
    expect(lerpAngle(-3.0, 3.0, 0.5)).toBeCloseTo(-3.0 - (2 * Math.PI - 6) / 2, 12);
    expect(lerpAngle(3.0, -3.0, 0)).toBeCloseTo(3.0, 12);
    expect(lerpAngle(3.0, -3.0, 1)).toBeCloseTo(3.0 + (2 * Math.PI - 6), 12);
  });

  it('returns null before the first frame', () => {
    expect(new FramePlayer().sample(0)).toBeNull();
  });

  it('the first frame is drawn as it is', () => {
    const p = new FramePlayer();
    p.push(frame([node(1, 10, 20, 0.5)]), 100);
    const s = p.sample(100 + TICK_MS / 2)!;
    expect(s.x[0]).toBe(10);
    expect(s.y[0]).toBe(20);
    expect(s.rotation[0]).toBe(0.5);
  });

  it('interpolates position between prev and curr with alpha = elapsed / tick', () => {
    const p = new FramePlayer();
    p.push(frame([node(1, 0, 100)], 0), 0);
    p.push(frame([node(1, 10, 200)], 1), 1000);
    let s = p.sample(1000)!;
    expect(s.alpha).toBe(0);
    expect(s.x[0]).toBe(0);
    expect(s.y[0]).toBe(100);
    s = p.sample(1000 + TICK_MS / 2)!;
    expect(s.alpha).toBeCloseTo(0.5, 12);
    expect(s.x[0]).toBeCloseTo(5, 10);
    expect(s.y[0]).toBeCloseTo(150, 10);
    s = p.sample(1000 + TICK_MS)!;
    expect(s.x[0]).toBeCloseTo(10, 10);
    // alpha is clamped: a late frame does not extrapolate
    s = p.sample(1000 + TICK_MS * 5)!;
    expect(s.alpha).toBe(1);
    expect(s.x[0]).toBe(10);
    // ... and a clock before the arrival does not go back
    s = p.sample(500)!;
    expect(s.alpha).toBe(0);
    expect(s.x[0]).toBe(0);
  });

  it('interpolates the angle along the shortest arc through +-pi', () => {
    const p = new FramePlayer();
    p.push(frame([node(1, 0, 0, 3.0)], 0), 0);
    p.push(frame([node(1, 0, 0, -3.0)], 1), 0);
    const s = p.sample(TICK_MS / 2)!;
    // half of the 0.2832 step: 3.1416 = pi, NOT the middle of the long way (0)
    expect(s.rotation[0]).toBeCloseTo(Math.PI, 6);
    const near = p.sample(TICK_MS * 0.1)!;
    expect(near.rotation[0]).toBeGreaterThan(3.0);
  });

  it('a teleport node is not interpolated', () => {
    const p = new FramePlayer();
    p.push(frame([node(1, 0, 0)], 0), 0);
    p.push(frame([node(1, 500, 500, 0, NODE_TELEPORT)], 1), 0);
    const s = p.sample(TICK_MS / 2)!;
    expect(s.x[0]).toBe(500);
    expect(s.y[0]).toBe(500);
  });

  it('a node without a pair in prev takes the curr values; pairs are matched by uid, not by index', () => {
    const p = new FramePlayer();
    p.push(frame([node(1, 0, 0), node(2, 100, 0)], 0), 0);
    // node 1 is gone, node 3 is new, node 2 moved to index 0
    p.push(frame([node(2, 110, 0), node(3, 7, 7)], 1), 0);
    const s = p.sample(TICK_MS / 2)!;
    expect(s.x[0]).toBeCloseTo(105, 10);
    expect(s.x[1]).toBe(7);
    expect(s.y[1]).toBe(7);
  });

  it('a sceneReset frame teleports everything', () => {
    const p = new FramePlayer();
    p.push(frame([node(1, 0, 0)], 0), 0);
    p.push(frame([node(1, 300, 300)], 1, FRAME_SCENE_RESET), 0);
    const s = p.sample(TICK_MS / 2)!;
    expect(s.x[0]).toBe(300);
    expect(s.alpha).toBe(1);
  });

  it('Classic mode draws curr without interpolation', () => {
    const p = new FramePlayer({ classic: true });
    p.push(frame([node(1, 0, 0, 0)], 0), 0);
    p.push(frame([node(1, 10, 10, 1)], 1), 0);
    const s = p.sample(TICK_MS / 2)!;
    expect(s.x[0]).toBe(10);
    expect(s.y[0]).toBe(10);
    expect(s.rotation[0]).toBe(1);
    p.classic = false;
    expect(p.sample(TICK_MS / 2)!.x[0]).toBeCloseTo(5, 10);
  });

  it('handles frames with more nodes than before and an empty frame', () => {
    const p = new FramePlayer();
    p.push(frame([]), 0);
    p.push(frame(Array.from({ length: 300 }, (_, i) => node(i + 1, i, 0))), 0);
    const s = p.sample(TICK_MS)!;
    expect(s.frame.nodes).toHaveLength(300);
    expect(s.x[299]).toBe(299);
    p.push(frame([]), 0);
    expect(p.sample(0)!.frame.nodes).toHaveLength(0);
    expect(p.framesReceived).toBe(3);
  });
});

//---------------------------------------
// InputCollector
//---------------------------------------

type Listener = (e: InputEventLike) => void;

function fakeTarget(): {
  addEventListener(t: string, l: Listener): void;
  removeEventListener(t: string, l: Listener): void;
  fire(type: string, e?: InputEventLike): void;
  count(): number;
} {
  const map = new Map<string, Set<Listener>>();
  return {
    addEventListener: (t, l) => {
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(l);
    },
    removeEventListener: (t, l) => {
      map.get(t)?.delete(l);
    },
    fire: (t, e = {}) => {
      for (const l of [...(map.get(t) ?? [])]) l(e);
    },
    count: () => [...map.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe('InputCollector', () => {
  function make(): {
    target: ReturnType<typeof fakeTarget>;
    input: InputCollector;
    hot: string[];
    changes: { n: number };
  } {
    const target = fakeTarget();
    const hot: string[] = [];
    const changes = { n: 0 };
    const input = new InputCollector({
      target,
      letterbox: () => computeLetterbox(1600, 600),
      onHotkey: (h) => hot.push(h),
      onChange: () => changes.n++,
    });
    input.attach();
    return { target, input, hot, changes };
  }

  it('event.code -> Flash keyCode, independent of the layout', () => {
    const { target, input } = make();
    target.fire('keydown', { code: 'KeyW', key: 'ц' }); // Russian layout
    target.fire('keydown', { code: 'ArrowLeft' });
    target.fire('keydown', { code: 'Space' });
    expect(input.snapshot().keysDown.sort((a, b) => a - b)).toEqual([32, 37, 87]);
    target.fire('keyup', { code: 'KeyW' });
    expect(input.snapshot().keysDown.sort((a, b) => a - b)).toEqual([32, 37]);
  });

  it('a key that is held is one entry; unknown codes are ignored', () => {
    const { target, input, changes } = make();
    target.fire('keydown', { code: 'KeyA' });
    target.fire('keydown', { code: 'KeyA', repeat: true });
    target.fire('keydown', { code: 'MediaPlayPause' });
    expect(input.snapshot().keysDown).toEqual([65]);
    expect(changes.n).toBe(1);
  });

  it('preventDefault for arrows, space and Tab only', () => {
    const { target } = make();
    const calls: string[] = [];
    for (const code of ['ArrowUp', 'ArrowDown', 'Space', 'Tab', 'KeyA']) {
      target.fire('keydown', { code, preventDefault: () => calls.push(code) });
    }
    expect(calls).toEqual(['ArrowUp', 'ArrowDown', 'Space', 'Tab']);
  });

  it('hotkeys: F11, Alt+Enter, Ctrl+Cmd+F, F3; they do not reach the game', () => {
    const { target, input, hot } = make();
    target.fire('keydown', { code: 'F11' });
    target.fire('keydown', { code: 'Enter', altKey: true });
    target.fire('keydown', { code: 'KeyF', ctrlKey: true, metaKey: true });
    target.fire('keydown', { code: 'F3' });
    target.fire('keydown', { code: 'F3', repeat: true });
    expect(hot).toEqual(['fullscreen', 'fullscreen', 'fullscreen', 'perf']);
    expect(input.snapshot().keysDown).toEqual([]);
    // plain Enter and plain F are game keys
    expect(hotkeyOf({ code: 'Enter' })).toBeNull();
    expect(hotkeyOf({ code: 'KeyF' })).toBeNull();
  });

  it('blur releases all keys and the button', () => {
    const { target, input } = make();
    target.fire('keydown', { code: 'KeyA' });
    target.fire('keydown', { code: 'ArrowUp' });
    target.fire('pointerdown', { button: 0, clientX: 800, clientY: 300 });
    expect(input.snapshot().keysDown).toHaveLength(2);
    target.fire('blur');
    const s = input.snapshot();
    expect(s.keysDown).toEqual([]);
    expect(s.mouseDown).toBe(false);
  });

  it('pointer -> logical stage coordinates through the letterbox; wheel is summed and reset', () => {
    const { target, input } = make();
    // letterbox of 1600x600: scale 1, x offset 400
    target.fire('pointermove', { clientX: 800, clientY: 300 });
    let s = input.snapshot();
    expect(s.mouseX).toBe(400);
    expect(s.mouseY).toBe(300);
    target.fire('pointerdown', { button: 0, clientX: 400, clientY: 0 });
    expect(input.snapshot().mouseDown).toBe(true);
    target.fire('pointerup', { button: 0, clientX: 400, clientY: 0 });
    expect(input.snapshot().mouseDown).toBe(false);
    target.fire('wheel', { deltaY: -100 }); // scroll up: Flash delta > 0
    target.fire('wheel', { deltaY: 40 });
    s = input.snapshot();
    expect(s.wheelDelta).toBe(3 - 1);
    expect(input.snapshot().wheelDelta).toBe(0);
  });

  it('detach removes every listener', () => {
    const { target, input } = make();
    expect(target.count()).toBeGreaterThan(0);
    input.detach();
    expect(target.count()).toBe(0);
  });
});

//---------------------------------------
// TestScene (needs assets/)
//---------------------------------------

const assetsRoot = resolve(process.cwd(), 'assets');
const hasAssets = existsSync(resolve(assetsRoot, 'manifest.json'));

// The scene of the renderer check of T1.7 (src/sim/TestScene.ts, removed in T1.9e when GameState arrived), kept
// here: the level background, a coin that orbits and spins, a shuttle that sweeps and turns through +-pi, a coin
// that jumps (teleport).
function place(a: AntEntity, x: number, y: number, angleDeg: number): void {
  // (-180, 180]: the frame angle crosses +-pi, the interpolation must take the short way round
  let ang = ((((angleDeg + 180) % 360) + 360) % 360) - 180;
  if (ang === -180) ang = 180;
  a.x = x;
  a.y = y;
  a.angle = ang;
  a.globalX = x;
  a.globalY = y;
  a.globalAngle = ang;
}

class TestScene {
  private readonly _writer = new FrameWriter();
  private readonly _camera = new AntCamera(0, 0, 800, 600);
  private readonly _root = new AntEntity();
  private readonly _bg = new AntActor();
  private readonly _coin = new AntActor();
  private readonly _jumper = new AntActor();
  private readonly _shuttle = new AntActor();
  private _tick = 0;

  constructor() {
    AntG.timeScale = 1;
    AntG.elapsed = 1 / 35;
    this._bg.addAnimationFromCache('Level01BG_mc');
    this._coin.addAnimationFromCache('Coin_mc');
    this._coin.play();
    this._jumper.addAnimationFromCache('Coin_mc');
    this._jumper.play();
    this._shuttle.addAnimationFromCache('Shuttle01Body_mc');
    this._root.add(this._bg);
    this._root.add(this._coin);
    this._root.add(this._jumper);
    this._root.add(this._shuttle);
    place(this._bg, 0, 0, 0);
  }

  tick(tickCostHundredths = 0): ArrayBuffer {
    const t = this._tick;
    this._coin.update();
    this._jumper.update();
    this._shuttle.update();
    const a = (t / 35) * 1.2;
    place(this._coin, 400 + Math.cos(a) * 160, 300 + Math.sin(a) * 160, (t / 35) * 180);
    place(this._shuttle, 400 + Math.sin((t / 35) * 0.8) * 300, 460, (t / 35) * 120);
    place(this._jumper, Math.floor(t / 70) % 2 === 0 ? 100 : 700, 120, 0);
    const buf = this._writer.write({
      root: this._root,
      camera: this._camera,
      tick: t,
      levelGroup: 1,
      tickCost: tickCostHundredths,
      sceneReset: t === 0,
    });
    this._tick++;
    return buf;
  }
}

describe.skipIf(!hasAssets)('TestScene', () => {
  it('writes frames with the four actors; the jumper teleports, the others do not', async () => {
    const registry = new AssetRegistry(new FileAssetSource(assetsRoot, (p) => readFile(p)));
    await registry.load();
    const scene = new TestScene();
    const frames: FrameData[] = [];
    for (let i = 0; i < 160; i++) frames.push(readFrame(scene.tick()));

    expect(frames[0]!.nodes).toHaveLength(4);
    expect(frames[0]!.levelGroup).toBe(1);
    expect(frames[0]!.flags & FRAME_SCENE_RESET).not.toBe(0);
    expect(frames[1]!.flags & FRAME_SCENE_RESET).toBe(0);

    // uids: bg, coin, jumper, shuttle keep their uid and order
    expect(frames[10]!.nodes.map((n) => n.uid)).toEqual(frames[0]!.nodes.map((n) => n.uid));
    // frames 70 and 140: the jumper changes corner
    const tele = (f: FrameData, i: number): boolean => (f.nodes[i]!.flags & NODE_TELEPORT) !== 0;
    expect(tele(frames[70]!, 2)).toBe(true);
    expect(tele(frames[71]!, 2)).toBe(false);
    for (let k = 1; k < 160; k++) {
      expect(tele(frames[k]!, 1)).toBe(false); // coin orbit
      expect(tele(frames[k]!, 3)).toBe(false); // shuttle
    }
    // the shuttle angle wraps through +-pi
    const angles = frames.map((f) => f.nodes[3]!.rotation);
    expect(angles.some((a, i) => i > 0 && a < 0 && angles[i - 1]! > 0)).toBe(true);
  });
});
