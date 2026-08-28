/**
 * Desktop app integration outside the HTTP API: the `motrixnext://` deep-link
 * protocol and the wake-then-poll launch flow.
 */

export const MOTRIX_NEXT_PROTOCOL = 'motrixnext';

export type ProtocolAction = 'new' | 'tasks';

/**
 * Build a `motrixnext://` protocol URL.
 *
 *   buildProtocolUrl()                      → "motrixnext://"
 *   buildProtocolUrl('tasks')               → "motrixnext://tasks"
 *   buildProtocolUrl('new', { url: ... })   → "motrixnext://new?url=..."
 */
export function buildProtocolUrl(
  action?: ProtocolAction,
  params?: Record<string, string | undefined>,
): string {
  const base = `${MOTRIX_NEXT_PROTOCOL}://`;
  if (!action) return base;

  const query = Object.entries(params ?? {})
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return query ? `${base}${action}?${query}` : `${base}${action}`;
}

// ─── Wake ───────────────────────────────────────────────

export interface WakeOptions {
  /**
   * Open the motrixnext:// protocol URL in a tab and return a cleanup
   * function that closes it. The tab must stay open until cleanup so the
   * user can confirm the browser's protocol dialog.
   */
  openProtocol: () => Promise<() => void>;
  /** Return true when the desktop app and its engine are ready. */
  checkReady: () => Promise<boolean>;
  /** Maximum time to wait for readiness (ms). */
  maxWaitMs: number;
  /** Interval between readiness checks (ms). */
  pollIntervalMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function checkReadySafely(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

/**
 * Wake the desktop app via the custom protocol and poll until the app and
 * engine are ready or `maxWaitMs` expires.
 *
 * @returns true if the desktop app and engine became ready.
 */
export async function wakeAndWaitForApi(options: WakeOptions): Promise<boolean> {
  const pollIntervalMs = options.pollIntervalMs ?? 500;

  // The app may already be running — skip the protocol tab entirely.
  if (await checkReadySafely(options.checkReady)) return true;

  const closeTab = await options.openProtocol();
  try {
    const deadline = Date.now() + options.maxWaitMs;
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      if (await checkReadySafely(options.checkReady)) return true;
    }
    return false;
  } finally {
    closeTab();
  }
}
