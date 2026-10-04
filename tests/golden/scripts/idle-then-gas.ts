// Not a port. The first replay of every level (docs/05-verification.md §4): the shuttle spawns, 10 s (350 ticks) without input,
// then 10 s of gas (the Up arrow). The level is loaded, the shuttle falls, lifts off: the physics, the effects and the systems
// of the level all run.

export const KEY_UP = 38;
export const KEY_LEFT = 37;
export const KEY_RIGHT = 39;

export const IDLE_TICKS = 10 * 35;
export const GAS_TICKS = 10 * 35;

/** The keys that are down at the tick. */
export function idleThenGas(aTick: number): number[] {
  return aTick < IDLE_TICKS ? [] : [KEY_UP];
}

export function levelName(aNumber: number): string {
  return 'Level' + (aNumber < 10 ? '0' : '') + aNumber;
}
