// Port of ru/antkarlov/anthill/plugins/IPlugin.as

import type { AntCamera } from '../core/AntCamera';

export interface IPlugin {
  update(): void;
  draw(aCamera: AntCamera): void;
  tag: string | null;
  priority: number; // int
}

/** AS3 `value is IPlugin` (structural check, interfaces do not exist at runtime). */
export function isIPlugin(value: unknown): value is IPlugin {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['update'] === 'function' && typeof v['draw'] === 'function' && 'tag' in v && 'priority' in v;
}
