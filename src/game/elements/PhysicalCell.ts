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
    this.clearFixtures();
    this.fixtures = null;
  }

  addFixture(aFixture: b2Fixture): void {
    (this.fixtures as b2Fixture[])[this.numFixtures++] = aFixture;
  }

  clearFixtures(): void {
    (this.fixtures as b2Fixture[]).length = 0;
    this.numFixtures = 0;
  }
}
