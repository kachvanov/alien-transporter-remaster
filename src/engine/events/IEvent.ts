// Port of ru/antkarlov/anthill/events/IEvent.as

import type { AntDeluxeSignal } from '../signals/AntDeluxeSignal';

export interface IEvent {
  name: string;
  target: unknown;
  currentTarget: unknown;
  signal: AntDeluxeSignal | null;
  bubbles: boolean;
  clone(): IEvent;
}

/**
 * AS3 `value as IEvent` / `value is IEvent`: interfaces do not exist at runtime in TS, so the
 * check is structural (all members of the interface are present).
 */
export function isIEvent(value: unknown): value is IEvent {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['clone'] === 'function' && 'name' in v && 'target' in v && 'currentTarget' in v && 'signal' in v && 'bubbles' in v;
}
