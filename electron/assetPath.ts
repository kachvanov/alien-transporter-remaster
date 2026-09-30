// `app://assets/<path>` -> a file under the assets root. Pure: unit-tested.

import { resolve, sep } from 'node:path';

/**
 * Maps a request URL of the `app` scheme to an absolute file path inside `root`, or null when the URL is not
 * a valid asset URL (wrong host, path traversal, empty path).
 */
export function resolveAssetFile(root: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'app:' || url.hostname !== 'assets') return null;

  let rel: string;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  rel = rel.replace(/^\/+/, '');
  if (rel.length === 0 || rel.includes('\0') || rel.includes('\\')) return null;
  if (rel.split('/').some((part) => part === '..')) return null;

  const base = resolve(root);
  const full = resolve(base, rel);
  return full.startsWith(base + sep) ? full : null;
}
