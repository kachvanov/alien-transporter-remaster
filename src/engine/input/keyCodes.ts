// KeyboardEvent.code -> Flash keyCode (docs/01-architecture.md §8).
// Not a port of a single AS3 file: the set of Flash key codes is the one registered by
// AntKeyboard.addKey (ru/antkarlov/anthill/AntKeyboard.as); the values are the Flash Player keyCodes
// that KeyboardEvent.keyCode reports for the physical key.

const table: Record<string, number> = {};

// Letters: 65..90 ("A".."Z").
for (let i = 0; i < 26; i++) {
  table['Key' + String.fromCharCode(65 + i)] = 65 + i;
}

// Top-row digits: 48..57 (ZERO..NINE).
for (let i = 0; i <= 9; i++) {
  table['Digit' + i] = 48 + i;
}

// Numpad digits: 96..105 (NUMPAD_0..NUMPAD_9).
for (let i = 0; i <= 9; i++) {
  table['Numpad' + i] = 96 + i;
}

// Function keys: 112..123 (F1..F12).
for (let i = 1; i <= 12; i++) {
  table['F' + i] = 111 + i;
}

Object.assign(table, {
  NumpadMultiply: 106, // NUMPAD_MULTIPLY
  NumpadAdd: 107, // NUMPAD_ADD
  // Flash Player reports keyCode 13 (ENTER) for the numpad Enter key (Keyboard.NUMPAD_ENTER = 108 is
  // never produced by a real key event), so it acts as Enter in menus, like in the original.
  NumpadEnter: 13,
  NumpadSubtract: 109, // NUMPAD_SUBTRACT
  NumpadDecimal: 110, // NUMPAD_DECIMAL
  NumpadDivide: 111, // NUMPAD_DIVIDE

  Semicolon: 186, // COLON
  Equal: 187, // EQUALS
  Minus: 189, // UNDERSCORE
  Slash: 191, // QUESTION_MARK
  Backquote: 192, // TILDE
  BracketLeft: 219, // OPEN_BRACKET
  Backslash: 220, // BACKWARD_SLASH
  BracketRight: 221, // CLOSED_BRACKET
  Quote: 222, // QUOTES
  Comma: 188, // LESS_THAN
  Period: 190, // GREATER_THAN

  Backspace: 8, // BACKSPACE
  Tab: 9, // TAB
  NumpadClear: 12, // CLEAR
  Enter: 13, // ENTER
  ShiftLeft: 16, // SHIFT
  ShiftRight: 16,
  ControlLeft: 17, // CONTROL
  ControlRight: 17,
  AltLeft: 18, // ALT
  AltRight: 18,
  CapsLock: 20, // CAPS_LOCK
  Escape: 27, // ESC
  Space: 32, // SPACEBAR
  PageUp: 33, // PAGE_UP
  PageDown: 34, // PAGE_DOWN
  End: 35, // END
  Home: 36, // HOME
  ArrowLeft: 37, // LEFT
  ArrowUp: 38, // UP
  ArrowRight: 39, // RIGHT
  ArrowDown: 40, // DOWN
  Insert: 45, // INSERT
  Delete: 46, // DELETE
  Help: 47, // HELP
  NumLock: 144, // NUM_LOCK
});

/** `KeyboardEvent.code` -> Flash keyCode. */
export const CODE_TO_FLASH_KEYCODE: Readonly<Record<string, number>> = table;

/** Flash keyCode for a `KeyboardEvent.code`, or `undefined` when the original has no such key. */
export function codeToFlashKeyCode(code: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(CODE_TO_FLASH_KEYCODE, code) ? CODE_TO_FLASH_KEYCODE[code] : undefined;
}
