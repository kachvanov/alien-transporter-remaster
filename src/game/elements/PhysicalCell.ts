// Port of ru/alientransporter/elements/PhysicalCell.as

import type { b2Fixture } from '../../physics/box2dweb';

export class PhysicalCell {
  fixtures: b2Fixture[] | null;
  numFixtures: number; // :int

  constructor() {
    // super();
    this.fixtures = [];
    this.numFixtures = 0;
  }

  destroy(): void {
    (this.fixtures as b2Fixture[]).length = 0;
    this.clearFixtures();
    this.fixtures = null;
  }

  addFixture(aFixture: b2Fixture): void {
    (this.fixtures as b2Fixture[])[this.numFixtures++] = aFixture;
  }

  clearFixtures(): void {
    // PERF (T4.3): `fixtures.length = 0` of the original frees the storage of the array, and every tick the cells (thousands of them,
    // most empty) are cleared and then filled again. The readers only look at `fixtures[0 .. numFixtures)` (Particle.resolveCollisions),
    // so the cell keeps its array and only the count is reset: the same game, no reallocation. The stale tail is overwritten by the
    // next `addFixture` and released by `destroy()`.
    this.numFixtures = 0;
  }
}
