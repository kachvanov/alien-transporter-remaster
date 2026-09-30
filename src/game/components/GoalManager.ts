// Port of ru/alientransporter/components/GoalManager.as

export class GoalManager {
  static readonly className = 'GoalManager';

  static readonly STAT_DELIVER_ANY = 'DeliverAny';
  static readonly STAT_DELIVER_GREEN = 'DeliverGreen';
  static readonly STAT_DELIVER_BLUE = 'DeliverBlue';
  static readonly STAT_DELIVER_YELLOW = 'DeliverYellow';
  static readonly STAT_DELIVER_RED = 'DeliverRed';
  static readonly STAT_EARN_COINS = 'EarnCoins';
  static readonly STAT_EXPEND_FUEL = 'ExpendFuel';

  goalKind: string;
  goalDef: number;
  goalValue: number;
  targetAliases: string[] | null;
  triggerAliases: string[] | null;
  value: number;
  isActivated: boolean;

  constructor() {
    // super();
    this.goalKind = GoalManager.STAT_DELIVER_ANY;
    this.goalDef = 0;
    this.goalValue = 0;
    this.targetAliases = null;
    this.triggerAliases = null;
    this.value = 0;
    this.isActivated = false;
  }

  track(aKind: string, aValue: number): boolean {
    if (this.goalKind == aKind) {
      this.value += aValue;
      return true;
    }

    return false;
  }

  isCompleted(): boolean {
    return this.value >= this.goalValue;
  }
}
