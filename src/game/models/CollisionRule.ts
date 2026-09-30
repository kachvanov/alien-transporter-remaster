// Port of ru/alientransporter/models/CollisionRule.as

export class CollisionRule {
  static readonly className = 'CollisionRule';

  static readonly GROUND = 'ground';
  static readonly OBJECT = 'object';
  static readonly SHUTTLE = 'shuttle';
  static readonly PASSENGER = 'passenger';
  static readonly PASSENGER_B = 'passengerB';
  static readonly FRAGMENT = 'fragment';
  static readonly COIN = 'coin';
  static readonly MISSILE = 'missile';

  constructor() {
    // super();
  }

  /** The flags that the flag `aName` collides with (a fresh array on every call); null for an unknown name. */
  static getRule(aName: string): string[] | null {
    switch (aName) {
      case CollisionRule.GROUND:
        return [
          CollisionRule.OBJECT,
          CollisionRule.SHUTTLE,
          CollisionRule.PASSENGER,
          CollisionRule.PASSENGER_B,
          CollisionRule.FRAGMENT,
          CollisionRule.COIN,
          CollisionRule.MISSILE,
        ];
      case CollisionRule.OBJECT:
        return [
          CollisionRule.GROUND,
          CollisionRule.OBJECT,
          CollisionRule.SHUTTLE,
          CollisionRule.PASSENGER,
          CollisionRule.FRAGMENT,
          CollisionRule.COIN,
          CollisionRule.MISSILE,
        ];
      case CollisionRule.SHUTTLE:
        return [CollisionRule.GROUND, CollisionRule.OBJECT, CollisionRule.MISSILE];
      case CollisionRule.PASSENGER:
        return [CollisionRule.GROUND, CollisionRule.OBJECT, CollisionRule.MISSILE];
      case CollisionRule.PASSENGER_B:
        return [CollisionRule.GROUND];
      case CollisionRule.FRAGMENT:
        return [CollisionRule.GROUND, CollisionRule.OBJECT];
      case CollisionRule.COIN:
        return [CollisionRule.GROUND, CollisionRule.OBJECT];
      case CollisionRule.MISSILE:
        return [
          CollisionRule.GROUND,
          CollisionRule.OBJECT,
          CollisionRule.SHUTTLE,
          CollisionRule.PASSENGER,
          CollisionRule.MISSILE,
        ];
      default:
        return null;
    }
  }
}
