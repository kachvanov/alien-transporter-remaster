// Port of ru/antkarlov/anthill/plugins/AntTransition.as

/** AS3 `Function` taking the ratio 0..1 and returning the eased value. */
export type TransitionFunc = (aRatio: number) => number;

export class AntTransition {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly LINEAR = 'linear';
  static readonly EASE_IN = 'easeIn';
  static readonly EASE_OUT = 'easeOut';
  static readonly EASE_IN_OUT = 'easeInOut';
  static readonly EASE_OUT_IN = 'easeOutIn';

  static readonly EASE_IN_BACK = 'easeInBack';
  static readonly EASE_OUT_BACK = 'easeOutBack';
  static readonly EASE_IN_OUT_BACK = 'easeInOutBack';
  static readonly EASE_OUT_IN_BACK = 'easeOutInBack';

  static readonly EASE_IN_ELASTIC = 'easeInElastic';
  static readonly EASE_OUT_ELASTIC = 'easeOutElastic';
  static readonly EASE_IN_OUT_ELASTIC = 'easeInOutElastic';
  static readonly EASE_OUT_IN_ELASTIC = 'easeOutInElastic';

  static readonly EASE_IN_BOUNCE = 'easeInBounce';
  static readonly EASE_OUT_BOUNCE = 'easeOutBounce';
  static readonly EASE_IN_OUT_BOUNCE = 'easeInOutBounce';
  static readonly EASE_OUT_IN_BOUNCE = 'easeOutInBounce';

  // DEVIATION: AS3 keeps the transitions in an AntStorage (Dictionary); AntStorage is ported in T1.2,
  // a Map has the same get/set semantics for string keys (a missing key gives null here, undefined in AS3;
  // both are `== null` in the only consumer, AntTween.transition).
  private static _transitions: Map<string, TransitionFunc> | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    throw new Error();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  static getTransition(aName: string): TransitionFunc | null {
    if (AntTransition._transitions == null) {
      AntTransition.registerDefaults();
    }

    return (AntTransition._transitions as Map<string, TransitionFunc>).get(aName) ?? null;
  }

  static register(aName: string, aFunc: TransitionFunc): void {
    if (AntTransition._transitions == null) {
      AntTransition.registerDefaults();
    }

    (AntTransition._transitions as Map<string, TransitionFunc>).set(aName, aFunc);
  }

  private static registerDefaults(): void {
    AntTransition._transitions = new Map<string, TransitionFunc>();

    AntTransition.register(AntTransition.LINEAR, AntTransition.linear);
    AntTransition.register(AntTransition.EASE_IN, AntTransition.easeIn);
    AntTransition.register(AntTransition.EASE_OUT, AntTransition.easeOut);
    AntTransition.register(AntTransition.EASE_IN_OUT, AntTransition.easeInOut);
    AntTransition.register(AntTransition.EASE_OUT_IN, AntTransition.easeOutIn);

    AntTransition.register(AntTransition.EASE_IN_BACK, AntTransition.easeInBack);
    AntTransition.register(AntTransition.EASE_OUT_BACK, AntTransition.easeOutBack);
    AntTransition.register(AntTransition.EASE_IN_OUT_BACK, AntTransition.easeInOutBack);
    AntTransition.register(AntTransition.EASE_OUT_IN_BACK, AntTransition.easeOutInBack);

    AntTransition.register(AntTransition.EASE_IN_ELASTIC, AntTransition.easeInElastic);
    AntTransition.register(AntTransition.EASE_OUT_ELASTIC, AntTransition.easeOutElastic);
    AntTransition.register(AntTransition.EASE_IN_OUT_ELASTIC, AntTransition.easeInOutElastic);
    AntTransition.register(AntTransition.EASE_OUT_IN_ELASTIC, AntTransition.easeOutInElastic);

    AntTransition.register(AntTransition.EASE_IN_BOUNCE, AntTransition.easeInBounce);
    AntTransition.register(AntTransition.EASE_OUT_BOUNCE, AntTransition.easeOutBounce);
    AntTransition.register(AntTransition.EASE_IN_OUT_BOUNCE, AntTransition.easeInOutBounce);
    AntTransition.register(AntTransition.EASE_OUT_IN_BOUNCE, AntTransition.easeOutInBounce);
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  // The transition functions never touch `this`: they call each other through the class name so that
  // they can be registered and invoked as free functions (AS3 static functions are the same).

  protected static linear(aRatio: number): number {
    return aRatio;
  }

  protected static easeIn(aRatio: number): number {
    return aRatio * aRatio * aRatio;
  }

  protected static easeOut(aRatio: number): number {
    const invRatio = aRatio - 1.0;
    return invRatio * invRatio * invRatio + 1;
  }

  protected static easeInOut(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeIn, AntTransition.easeOut, aRatio);
  }

  protected static easeOutIn(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeOut, AntTransition.easeIn, aRatio);
  }

  protected static easeInBack(aRatio: number): number {
    const s = 1.70158;
    return Math.pow(aRatio, 2) * ((s + 1.0) * aRatio - s);
  }

  protected static easeOutBack(aRatio: number): number {
    const invRatio = aRatio - 1.0;
    const s = 1.70158;
    return Math.pow(invRatio, 2) * ((s + 1.0) * invRatio + s) + 1.0;
  }

  protected static easeInOutBack(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeInBack, AntTransition.easeOutBack, aRatio);
  }

  protected static easeOutInBack(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeOutBack, AntTransition.easeInBack, aRatio);
  }

  protected static easeInElastic(aRatio: number): number {
    if (aRatio == 0 || aRatio == 1) {
      return aRatio;
    } else {
      const p = 0.3;
      const s = p / 4.0;
      const invRatio = aRatio - 1;
      return -1.0 * Math.pow(2.0, 10.0 * invRatio) * Math.sin(((invRatio - s) * (2.0 * Math.PI)) / p);
    }
  }

  protected static easeOutElastic(aRatio: number): number {
    if (aRatio == 0 || aRatio == 1) {
      return aRatio;
    } else {
      const p = 0.3;
      const s = p / 4.0;
      return Math.pow(2.0, -10.0 * aRatio) * Math.sin(((aRatio - s) * (2.0 * Math.PI)) / p) + 1;
    }
  }

  protected static easeInOutElastic(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeInElastic, AntTransition.easeOutElastic, aRatio);
  }

  protected static easeOutInElastic(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeOutElastic, AntTransition.easeInElastic, aRatio);
  }

  protected static easeInBounce(aRatio: number): number {
    return 1.0 - AntTransition.easeOutBounce(1.0 - aRatio);
  }

  protected static easeOutBounce(aRatio: number): number {
    const s = 7.5625;
    const p = 2.75;
    let l: number;
    if (aRatio < 1.0 / p) {
      l = s * Math.pow(aRatio, 2);
    } else {
      if (aRatio < 2.0 / p) {
        aRatio -= 1.5 / p;
        l = s * Math.pow(aRatio, 2) + 0.75;
      } else {
        if (aRatio < 2.5 / p) {
          aRatio -= 2.25 / p;
          l = s * Math.pow(aRatio, 2) + 0.9375;
        } else {
          aRatio -= 2.625 / p;
          l = s * Math.pow(aRatio, 2) + 0.984375;
        }
      }
    }

    return l;
  }

  protected static easeInOutBounce(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeInBounce, AntTransition.easeOutBounce, aRatio);
  }

  protected static easeOutInBounce(aRatio: number): number {
    return AntTransition.easeCombined(AntTransition.easeOutBounce, AntTransition.easeInBounce, aRatio);
  }

  protected static easeCombined(aStartFunc: TransitionFunc, aEndFunc: TransitionFunc, aRatio: number): number {
    if (aRatio < 0.5) {
      return 0.5 * aStartFunc(aRatio * 2.0);
    } else {
      return 0.5 * aEndFunc((aRatio - 0.5) * 2.0) + 0.5;
    }
  }
}
