// Port of ru/alientransporter/AvailKeys.as
//
// DEVIATION: the original is a `dynamic class` whose constructor creates properties `this["A"] = "A"`, ...;
// `for (k in Config.availKeys)` (KeyInputPopupView) and `Config.availKeys[k]` walk them. A TS class cannot
// have both dynamic properties and methods, so they live in the `keys` map (same names and values, same
// insertion order): `for (const k in availKeys.keys)` / `availKeys.keys[k]`.

export class AvailKeys {
  readonly keys: Record<string, string> = {};

  constructor() {
    // super();
    const keys = this.keys;
    keys['A'] = 'A';
    keys['B'] = 'B';
    keys['C'] = 'C';
    keys['D'] = 'D';
    keys['E'] = 'E';
    keys['F'] = 'F';
    keys['G'] = 'G';
    keys['H'] = 'H';
    keys['I'] = 'I';
    keys['J'] = 'J';
    keys['K'] = 'K';
    keys['L'] = 'L';
    keys['M'] = 'M';
    keys['N'] = 'N';
    keys['O'] = 'O';
    keys['P'] = 'P';
    keys['Q'] = 'Q';
    keys['R'] = 'R';
    keys['S'] = 'S';
    keys['T'] = 'T';
    keys['U'] = 'U';
    keys['V'] = 'V';
    keys['W'] = 'W';
    keys['X'] = 'X';
    keys['Y'] = 'Y';
    keys['Z'] = 'Z';
    keys['ZERO'] = '0';
    keys['ONE'] = '1';
    keys['TWO'] = '2';
    keys['THREE'] = '3';
    keys['FOUR'] = '4';
    keys['FIVE'] = '5';
    keys['SIX'] = '6';
    keys['SEVEN'] = '7';
    keys['EIGHT'] = '8';
    keys['NINE'] = '9';
    keys['UP'] = '^';
    keys['LEFT'] = '<';
    keys['RIGHT'] = '>';
    keys['DOWN'] = '~';
  }

  getString(aKey: string): string {
    if (Object.prototype.hasOwnProperty.call(this.keys, aKey)) {
      return this.keys[aKey]!;
    }
    return ' ';
  }
}
