// Port of ru/alientransporter/nodes/SensorNode.as

import { AntNode } from '../../engine/ants/AntNode';
import { Info } from '../components/Info';
import { Sensor } from '../components/Sensor';
import { SensorView } from '../views/SensorView'; // STUB(T2.1)

/** Component fields in the order of the `public var` declarations of the original (AntFamily reads them). */
export class SensorNode extends AntNode {
  static readonly className = 'SensorNode';
  static override readonly components = {
    info: Info,
    view: SensorView,
    sensor: Sensor,
  } as const;

  info!: Info;
  view!: SensorView;
  sensor!: Sensor;

  constructor() {
    super();
  }
}
