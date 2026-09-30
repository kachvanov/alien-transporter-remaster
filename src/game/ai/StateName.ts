// Port of ru/alientransporter/ai/StateName.as
// (complete: constants only; T1.9d needs no changes)

export class StateName {
  static readonly IDLE = 'idle';
  static readonly MOVE = 'move';
  static readonly MOVE_TO_SHUTTLE = 'moveToShuttle';
  static readonly MOVE_TO_STATION = 'moveToStation';
  static readonly MOVE_TO_HOME = 'moveToHome';
  static readonly ACTION = 'action';
}
