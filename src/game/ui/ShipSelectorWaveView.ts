// Port of ru/alientransporter/ui/ShipSelectorWaveView.as

import { AntActor } from '../../engine/core/AntActor';

export class ShipSelectorWaveView extends AntActor {
  static readonly className = 'ShipSelectorWaveView';

  constructor() {
    super();
    this.addAnimationFromCache('Wave02_mc');
    this.blend = 'add';
    (this.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onKill);
  }

  private onKill = (aActor: AntActor): void => {
    aActor.kill();
  };
}
