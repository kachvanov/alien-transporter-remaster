import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measure, period } from './behavior';

const ready = existsSync(resolve(process.cwd(), 'assets', 'data', 'levels', 'level01.json')) && existsSync(resolve(process.cwd(), 'assets', 'manifest.json'));

describe('behaviour metrics', () => {
  it('period finds the smallest period', () => {
    expect(period([1, 2, 3, 1, 2, 3, 1, 2, 3])).toBe(3);
    expect(period([1, 2, 3, 4, 5, 6])).toBe(-1);
  });

  it.skipIf(!ready)('measures all the metrics of docs/05 §5 on Level01', async () => {
    const m = await measure();
    expect(m.ticksToGround).toBeGreaterThanOrEqual(0);
    expect(m.ticksToGround).toBeLessThan(100);
    expect(m.rise35).toBeGreaterThan(20);
    // fuelRate 0.025 per second of AntG.elapsed: a full tank lasts 1400..1500 ticks
    expect(m.ticksToEmptyTank).toBeGreaterThan(1300);
    expect(m.ticksToEmptyTank).toBeLessThan(1500);
    expect(m.passengerPxPer35).toBeGreaterThan(5);
    expect(m.coinPeriodTicks).toBeGreaterThan(5);
    // Hardcore steers faster (steeringSpeed 80 against 10), so its angle after 35 ticks is bigger
    expect(Math.abs(m.angleHardcore)).toBeGreaterThan(Math.abs(m.angleCasual));
  }, 60_000);
});
