import { browser } from 'wxt/browser';
import {
  MEDIA_SESSION_KEY,
  MEDIA_MAX_CANDIDATES,
  MEDIA_MAX_PER_TAB,
  MEDIA_RETENTION_MS,
  MediaSessionSchema,
  type MediaCandidate,
  type MediaSession,
} from '../schema';
import { mediaIdentity } from './detection';

/** One writer owns the session catalogue. A worker restart restores its committed snapshot. */
export function createMediaCatalog() {
  let session: MediaSession | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  function run<T>(action: (state: MediaSession) => T | Promise<T>, write = false): Promise<T> {
    const work = queue.then(async () => {
      if (!session) {
        const saved = await browser.storage.session.get(MEDIA_SESSION_KEY);
        const parsed = MediaSessionSchema.safeParse(saved[MEDIA_SESSION_KEY]);
        session = parsed.success ? parsed.data : { candidates: [], operations: [], contexts: [] };
      }
      // Mutate a copy: failed persistence must not become visible as committed state.
      const next = structuredClone(session);
      const result = await action(next);
      if (write) {
        prune(next);
        const validated = MediaSessionSchema.parse(next);
        if (JSON.stringify(validated) !== JSON.stringify(session)) {
          await browser.storage.session.set({ [MEDIA_SESSION_KEY]: validated });
        }
        session = validated;
      }
      return result;
    });
    queue = work.catch(() => undefined);
    return work;
  }

  function prune(state: MediaSession) {
    const cutoff = Date.now() - MEDIA_RETENTION_MS;
    state.candidates = state.candidates
      .filter((item) => item.lastSeen >= cutoff)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, MEDIA_MAX_CANDIDATES);
    const counts = new Map<number, number>();
    state.candidates = state.candidates.filter((item) => {
      const count = (counts.get(item.tabId) ?? 0) + 1;
      counts.set(item.tabId, count);
      return count <= MEDIA_MAX_PER_TAB;
    });
    const ids = new Set(state.candidates.map((item) => item.id));
    state.operations = state.operations.filter((operation) => ids.has(operation.candidateId));
    state.contexts = state.contexts
      .filter((context) => context.capturedAt >= cutoff)
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .slice(0, 128);
    const bytes = () => new TextEncoder().encode(JSON.stringify(state)).byteLength;
    // Leave headroom inside the browser's 10 MB session quota for other extension data.
    while (bytes() > 6 * 1024 * 1024 && state.contexts.length) state.contexts.pop();
    while (bytes() > 6 * 1024 * 1024 && state.candidates.length) {
      const removable = state.candidates.findLastIndex(
        (item) =>
          !state.operations.some(
            (operation) =>
              operation.candidateId === item.id &&
              ['probing', 'ready', 'submitting', 'cancelling'].includes(operation.state),
          ),
      );
      if (removable < 0) break;
      const [removed] = state.candidates.splice(removable, 1);
      state.operations = state.operations.filter(
        (operation) => operation.candidateId !== removed?.id,
      );
    }
  }

  async function observe(candidate: MediaCandidate): Promise<void> {
    await run((state) => {
      const key = mediaIdentity(candidate);
      if (candidate.kind === 'embedded') {
        state.candidates = state.candidates.filter(
          (item) =>
            item.kind !== 'embedded' ||
            item.tabId !== candidate.tabId ||
            item.frameId !== candidate.frameId ||
            item.url === candidate.url,
        );
      }
      const existing = state.candidates.find((item) => mediaIdentity(item) === key);
      if (!existing) state.candidates.push(candidate);
      else {
        existing.lastSeen = candidate.lastSeen;
        existing.title = candidate.title || existing.title;
        existing.pageUrl = candidate.pageUrl;
        if (candidate.evidence === 'network' || existing.evidence !== 'network') {
          const { id, firstSeen } = existing;
          const context = candidate.context ?? existing.context;
          Object.assign(existing, candidate, { id, firstSeen, context });
        }
      }
    }, true);
  }

  async function remove(tabId: number, candidateId?: string): Promise<void> {
    await run((state) => {
      state.candidates = state.candidates.filter(
        (item) => item.tabId !== tabId || (candidateId !== undefined && item.id !== candidateId),
      );
      if (!candidateId) state.contexts = state.contexts.filter((item) => item.tabId !== tabId);
    }, true);
  }

  return { run, observe, remove };
}
export type MediaCatalog = ReturnType<typeof createMediaCatalog>;
