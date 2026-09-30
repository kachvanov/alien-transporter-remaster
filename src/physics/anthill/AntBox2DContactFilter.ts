// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DContactFilter.as

import { b2ContactFilter } from '../box2dweb';
import type { b2Fixture } from '../box2dweb';

export class AntBox2DContactFilter extends b2ContactFilter {
  constructor() {
    super();
  }

  override ShouldCollide(aFixtureA: b2Fixture, aFixtureB: b2Fixture): boolean {
    return super.ShouldCollide(aFixtureA, aFixtureB);
  }
}
