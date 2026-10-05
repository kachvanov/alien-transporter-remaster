// FIX-11: the UI scaling choice, in a module of its own with no imports: the sandboxed preload (electron/flags.ts) reads it too
// and cannot load zod, which schemas.ts needs.

/**
 * How the pixel-art UI (buttons, captions, icons, the delivery marker, the bitmap fonts) is scaled at 2x/3x: `pixel`
 * replicates the pixels of the original k x k (crisp, blocky, the default since T5.6), `smooth` uses the variant that the
 * extraction resampled from the 1x pixels (Frame.smooth, docs/02 §4.3). Local rendering only (not part of any protocol).
 */
export const UI_SCALINGS = ['pixel', 'smooth'] as const;
export type UiScaling = (typeof UI_SCALINGS)[number];

export function isUiScaling(aValue: unknown): aValue is UiScaling {
  return typeof aValue === 'string' && (UI_SCALINGS as readonly string[]).includes(aValue);
}
