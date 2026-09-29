import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });

  it('truncates like AS3 int', () => {
    const x = 3.9;
    expect(x | 0).toBe(3);
    expect(-x | 0).toBe(-3);
  });
});
