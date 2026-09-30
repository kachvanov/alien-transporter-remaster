// STUB(T1.9e): stand-in for ru/alientransporter/fonts/Label.as.
// T1.9e ports the real class (Font/Label) and replaces this file. Declared: what components/FlyingLabel.ts
// calls (fontName, text; position/scale/origin/size come from AntEntity).

import { AntEntity } from '../../engine/core/AntEntity';

export class Label extends AntEntity {
  static readonly className = 'Label';

  text = '';
  fontName: string | null = null;
}
