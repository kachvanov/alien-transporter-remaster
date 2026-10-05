// Behavioural metrics of our version in ticks (docs/05-verification.md §5, T4.2).
//
// Usage: npm run parity:behavior
//
// Runs the real GameState headless (src/sim/headless.ts) on Level01 and prints the metrics of the table of §5 for OUR
// side. The metrics are counted from the first tick the shuttle of Player1 is in the game (its spawn), not from the
// first tick of the level, so that the spawn delay does not matter. The "original" column of the table needs
// Ruffle (frame by frame recording) -- see docs/05 §5.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { readFrame } from '../../src/frame/FrameReader';
import { G } from '../../src/game/G';
import { PassengerNode } from '../../src/game/nodes/PassengerNode';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { GameState } from '../../src/game/states/GameState';
import { runHeadless } from '../../src/sim/headless';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { Level01Bot } from '../../tests/golden/scripts/level01-bot';

const KEY_UP = 38;
const KEY_LEFT = 37;

function snap(keys: number[]): InputSnapshot {
  return { keysDown: keys, mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
}

function makeState(casual: boolean): new () => GameState {
  return class extends GameState {
    override create(): void {
      super.create();
      G.gameData.casualMode = casual;
      this.debugStartLevel('Level01');
    }
  };
}

function shuttle(): ShuttleNode | null {
  const nodes = G.core.getNodes(ShuttleNode);
  return nodes.numNodes > 0 ? (nodes.get(0) as ShuttleNode) : null;
}

export interface Metrics {
  /** #1: ticks from the spawn to the first contact with the ground, no input. */
  ticksToGround: number;
  /** #2: rise in px after 35 ticks of full gas from the spawn (y0 - y35). */
  rise35: number;
  /** #3: ticks of continuous gas until the tank is empty (1 / fuel burnt per tick). */
  ticksToEmptyTank: number;
  /** #4: px walked by a passenger in 35 ticks (from the tick it starts to move; the first passenger of the play-through). */
  passengerPxPer35: number;
  /** #5: period of the animation of Coin_mc in ticks. */
  coinPeriodTicks: number;
  /** #6: angle (degrees) 35 ticks after the spawn, UP + LEFT held: casual, hardcore. */
  angleCasual: number;
  angleHardcore: number;
}

async function scenario(casual: boolean, keys: (n: number) => number[], ticks: number): Promise<{ y: number[]; angle: number[]; fuel: number[]; ground: number[]; spawnTick: number }> {
  const y: number[] = [];
  const angle: number[] = [];
  const fuel: number[] = [];
  const ground: number[] = [];
  let spawnTick = -1;
  await runHeadless({
    seed: 12345,
    ticks,
    initialState: makeState(casual),
    keepFrames: false,
    input: (t) => {
      const s = shuttle();
      if (s === null) return snap([]);
      if (spawnTick < 0) spawnTick = t;
      const n = t - spawnTick;
      y.push(s.physic.body.y);
      angle.push(s.physic.body.angle);
      fuel.push(s.stats.fuel);
      ground.push(s.model.groundContacts);
      return snap(keys(n));
    },
  });
  return { y, angle, fuel, ground, spawnTick };
}

/** Smallest p > 0 with seq[i] == seq[i+p] for all i; -1 when none. */
export function period(seq: readonly number[]): number {
  for (let p = 1; p <= seq.length / 2; p++) {
    let ok = true;
    for (let i = 0; i + p < seq.length; i++) {
      if (seq[i] !== seq[i + p]) {
        ok = false;
        break;
      }
    }
    if (ok) return p;
  }
  return -1;
}

export async function measure(): Promise<Metrics> {
  // 1. nothing pressed
  const idle = await scenario(true, () => [], 200);
  const ticksToGround = idle.ground.findIndex((g) => g > 0);

  // 2 + 3. full gas
  const gas = await scenario(true, () => [KEY_UP], 400);
  const rise35 = (gas.y[0] as number) - (gas.y[35] as number);
  const burnt = (gas.fuel[0] as number) - (gas.fuel[50] as number);
  const ticksToEmptyTank = 50 / burnt;

  // 6. UP + LEFT
  const c = await scenario(true, () => [KEY_UP, KEY_LEFT], 60);
  const h = await scenario(false, () => [KEY_UP, KEY_LEFT], 60);

  // 4 + 5. a play-through of Level01 by the pilot: the passengers walk, the coins turn
  const bot = new Level01Bot();
  // per passenger: the tick and the x at which it started to move; the displacement after 35 ticks is the metric
  const walkStart = new Map<number, { t: number; x: number }>();
  const lastX = new Map<number, number>();
  const walked: number[] = [];
  const coinFrames = new Map<number, number[]>();
  const result = await runHeadless({
    seed: 12345,
    ticks: 1500,
    initialState: makeState(true),
    input: (t) => {
      const keys = bot.step(t);
      const nodes = G.core.getNodes(PassengerNode);
      for (let i = 0; i < nodes.numNodes; i++) {
        const p = nodes.get(i) as PassengerNode;
        const id = p.display.view.entityId;
        const x = p.display.view.x;
        const prev = lastX.get(id);
        // (a step over 5 px is a jump -- a respawn or a ragdoll -- not a walk)
        if (prev !== undefined && Math.abs(x - prev) > 5) walkStart.delete(id);
        else if (prev !== undefined && Math.abs(x - prev) > 0.01 && !walkStart.has(id)) walkStart.set(id, { t, x: prev });
        const w = walkStart.get(id);
        if (w !== undefined && t - w.t === 35) {
          walked.push(Math.abs(x - w.x));
          walkStart.delete(id);
        }

        lastX.set(id, x);
      }
      return keys;
    },
  });
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'assets', 'manifest.json'), 'utf8')) as { frames: { key: string }[] };
  for (let t = 0; t < 400; t++) {
    const f = readFrame(result.frames[t] as ArrayBuffer);
    for (const n of f.nodes) {
      const key = manifest.frames[n.texId]?.key ?? '';
      if (key.startsWith('Coin_mc#')) {
        const arr = coinFrames.get(n.uid) ?? [];
        arr[t] = Number(key.slice('Coin_mc#'.length));
        coinFrames.set(n.uid, arr);
      }
    }
  }
  // a coin that is there all the 400 ticks (no pickup): its frame sequence is periodic
  let coinPeriodTicks = -1;
  for (const arr of coinFrames.values()) {
    const seq = Array.from({ length: arr.length }, (_, i) => arr[i] ?? -1).slice(0, 400);
    if (seq.every((v) => v >= 0) && seq.length >= 300) {
      coinPeriodTicks = period(seq);
      break;
    }
  }

  return {
    ticksToGround,
    rise35,
    ticksToEmptyTank,
    passengerPxPer35: walked[0] ?? Number.NaN,
    coinPeriodTicks,
    angleCasual: c.angle[35] as number,
    angleHardcore: h.angle[35] as number,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!existsSync(resolve(process.cwd(), 'assets', 'manifest.json'))) {
    console.error('assets/ is missing: run `npm run extract`');
    process.exitCode = 1;
  } else {
    measure()
      .then((m) => console.log(JSON.stringify(m, null, 2)))
      .catch((e: unknown) => {
        console.error(e);
        process.exitCode = 1;
      });
  }
}
