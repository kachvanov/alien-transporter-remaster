// Port of ru/alientransporter/components/Physic.as

import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';

export class Physic {
  static readonly className = 'Physic';

  body: AntBox2DBody;
  gravityCoef: number;

  constructor(aBody: AntBox2DBody, aGravityCoef = 0) {
    // super();
    this.body = aBody;
    this.gravityCoef = aGravityCoef;
  }

  destroy(): void {
    this.body.destroy();
    this.body = null as unknown as AntBox2DBody; // AS3: body = null
  }
}
