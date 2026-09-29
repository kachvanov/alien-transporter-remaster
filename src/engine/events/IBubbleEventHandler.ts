// Port of ru/antkarlov/anthill/events/IBubbleEventHandler.as

import type { IEvent } from './IEvent';

export interface IBubbleEventHandler {
  onEventBubbled(aEvent: IEvent | null): boolean;
}

/** AS3 `value is IBubbleEventHandler` (structural check, interfaces do not exist at runtime). */
export function isIBubbleEventHandler(value: unknown): value is IBubbleEventHandler {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as Record<string, unknown>)['onEventBubbled'] === 'function'
  );
}
