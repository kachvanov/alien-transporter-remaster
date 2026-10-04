// Not a port. Logic of the overlay of the network client (card T3.3): "Disconnect? Yes / No" on Esc and the message that ends
// a session ("Connection lost", ...). The renderer draws it (ClientOverlay.ts); the game of the host does not know about it.
// Pure: unit-tested.

export type ClientOverlayMode = 'hidden' | 'confirm' | 'message';

/** What a key or a click decided. */
export type ClientOverlayResult = 'none' | 'yes' | 'no' | 'ok';

export const CONFIRM_TEXT = 'Disconnect?';

export class ClientOverlayModel {
  private _mode: ClientOverlayMode = 'hidden';
  private _text = '';
  private _selected = 1;
  private _version = 0;

  get mode(): ClientOverlayMode {
    return this._mode;
  }

  get isOpen(): boolean {
    return this._mode !== 'hidden';
  }

  get text(): string {
    return this._text;
  }

  /** The highlighted button of the confirmation: 0 Yes, 1 No. */
  get selected(): number {
    return this._selected;
  }

  /** Grows on every change of what is drawn. */
  get version(): number {
    return this._version;
  }

  /** "Disconnect?" with No preselected. */
  showConfirm(): void {
    if (this._mode === 'message') {
      return; // (the session is over; the message stays)
    }
    this._mode = 'confirm';
    this._text = CONFIRM_TEXT;
    this._selected = 1;
    this._version++;
  }

  /** A message with a single OK (the end of the session). It replaces the confirmation. */
  showMessage(aText: string): void {
    this._mode = 'message';
    this._text = aText;
    this._selected = 0;
    this._version++;
  }

  hide(): void {
    this._mode = 'hidden';
    this._version++;
  }

  select(aIndex: number): void {
    if (this._mode === 'confirm' && (aIndex === 0 || aIndex === 1) && aIndex !== this._selected) {
      this._selected = aIndex;
      this._version++;
    }
  }

  /** A button was clicked: 0 Yes / OK, 1 No. */
  choose(aIndex: number): ClientOverlayResult {
    if (this._mode === 'message') {
      return 'ok';
    }
    if (this._mode === 'confirm') {
      return aIndex === 0 ? 'yes' : 'no';
    }
    return 'none';
  }

  /** `KeyboardEvent.code` of a key pressed while the overlay is open. */
  handleKey(aCode: string): ClientOverlayResult {
    if (this._mode === 'message') {
      return aCode === 'Enter' || aCode === 'NumpadEnter' || aCode === 'Space' || aCode === 'Escape' ? 'ok' : 'none';
    }
    if (this._mode !== 'confirm') {
      return 'none';
    }
    switch (aCode) {
      case 'Escape':
      case 'KeyN':
        return 'no';
      case 'KeyY':
        return 'yes';
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        return this._selected === 0 ? 'yes' : 'no';
      case 'ArrowLeft':
      case 'KeyA':
        this.select(0);
        return 'none';
      case 'ArrowRight':
      case 'KeyD':
        this.select(1);
        return 'none';
      case 'Tab':
        this.select(1 - this._selected);
        return 'none';
      default:
        return 'none';
    }
  }
}
