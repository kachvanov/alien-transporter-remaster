// Port of ru/alientransporter/components/ShuttleUISync.as

import type { ShuttleNode } from '../nodes/ShuttleNode';

export class ShuttleUISync {
  static readonly className = 'ShuttleUISync';

  shuttleNode: ShuttleNode;

  constructor(aShuttleNode: ShuttleNode) {
    // super();
    this.shuttleNode = aShuttleNode;
  }
}
