// Not a port of a single file: replaces the 20 classes ru/alientransporter/levels/Level01.as .. Level20.as.
// Every one of them is an empty subclass of LevelCore that sets the four clip classes
// (`_levelBackClass = Level01Back_mc`, `_levelBackgroundClass = Level01BG_mc`, `_levelForegroundClass = Level01FG_mc`,
// `_levelBodyClass = Level01Physic_mc`); LevelCore(n) derives the names from the number.

import type { Ctor } from '../../engine/utils/types';
import { LevelCore } from '../map/LevelCore';

/** The class `Level<NN>` of the original. */
export function levelClass(aNumber: number): Ctor<LevelCore> {
  const num = aNumber | 0; // :int
  return class Level extends LevelCore {
    static override readonly className = 'Level' + (num < 10 ? '0' : '') + num;

    constructor() {
      super(num);
    }
  };
}
