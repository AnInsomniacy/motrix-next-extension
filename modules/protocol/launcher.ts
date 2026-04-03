import { MOTRIX_NEXT_PROTOCOL } from '@/shared/constants';

// ─── Types ──────────────────────────────────────────────

export enum ProtocolAction {
  /** Create a new download task. */
  NewTask = 'new',
  /** Navigate to the tasks view. */
  Tasks = 'tasks',
}

export interface NewTaskParams {
  url: string;
  referer?: string;
}

// ─── URL Builder (Pure Function) ────────────────────────

/**
 * Build a `motrixnext://` protocol URL.
 *
 * Examples:
 *   buildProtocolUrl()                               → "motrixnext://"
 *   buildProtocolUrl(ProtocolAction.Tasks)            → "motrixnext://tasks"
 *   buildProtocolUrl(ProtocolAction.NewTask, { url }) → "motrixnext://new?url=..."
 */
export function buildProtocolUrl(action?: ProtocolAction, params?: Record<string, string>): string {
  const base = `${MOTRIX_NEXT_PROTOCOL}://`;

  if (!action) return base;

  let url = `${base}${action}`;

  if (params) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    if (parts.length > 0) {
      url += `?${parts.join('&')}`;
    }
  }

  return url;
}
