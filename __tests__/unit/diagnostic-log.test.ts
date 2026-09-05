import { describe, expect, it, vi } from 'vitest';
import { createDiagnosticJournal } from '@/lib/diagnostics';
import type { DiagnosticEvent } from '@/lib/schema';

const TEST_MAX_EVENTS = 100;

function storedEvent(id: string, ts: number): DiagnosticEvent {
  return {
    id,
    ts,
    level: 'info',
    code: 'download_delegated',
    message: 'Stored event',
  };
}

describe('createDiagnosticJournal', () => {
  it('hydrates before pending events and persists the merged journal', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const journal = createDiagnosticJournal({
      load: vi.fn().mockResolvedValue([storedEvent('stored', 900)]),
      save,
      maxEvents: TEST_MAX_EVENTS,
      now: () => 1000,
    });

    journal.append({ level: 'warn', code: 'download_skipped', message: 'Pending event' });
    await journal.initialize();

    expect(journal.getAll().map((event) => event.id)).toEqual([
      'stored',
      expect.stringMatching(/^diag_/),
    ]);
    expect(save).toHaveBeenLastCalledWith(journal.getAll());
  });

  it('serializes writes and persists the newest snapshot last', async () => {
    const firstWrite = Promise.withResolvers<void>();
    const snapshots: DiagnosticEvent[][] = [];
    const save = vi.fn().mockImplementation(async (events: DiagnosticEvent[]) => {
      snapshots.push(events);
      if (snapshots.length === 1) await firstWrite.promise;
    });
    const journal = createDiagnosticJournal({
      load: vi.fn().mockResolvedValue([]),
      save,
      maxEvents: TEST_MAX_EVENTS,
      now: () => 1000,
    });
    await journal.initialize();

    journal.append({ level: 'info', code: 'download_delegated', message: 'First' });
    journal.append({ level: 'warn', code: 'download_skipped', message: 'Second' });
    firstWrite.resolve();
    await journal.flush();

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toHaveLength(1);
    expect(snapshots[1]).toHaveLength(2);
  });

  it('persists clear after an older write already started', async () => {
    const firstWrite = Promise.withResolvers<void>();
    const snapshots: DiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({
      load: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockImplementation(async (events: DiagnosticEvent[]) => {
        snapshots.push(events);
        if (snapshots.length === 1) await firstWrite.promise;
      }),
      maxEvents: TEST_MAX_EVENTS,
      now: () => 1000,
    });
    await journal.initialize();
    journal.append({ level: 'info', code: 'download_delegated', message: 'Event' });

    const clearing = journal.clear();
    firstWrite.resolve();
    await clearing;

    expect(snapshots.at(-1)).toEqual([]);
  });

  it('keeps old events until the bounded set evicts them', async () => {
    const journal = createDiagnosticJournal({
      load: vi.fn().mockResolvedValue([storedEvent('oldest', 0)]),
      save: vi.fn().mockResolvedValue(undefined),
      maxEvents: TEST_MAX_EVENTS,
      now: () => 10 * 365 * 24 * 60 * 60 * 1000,
    });
    await journal.initialize();

    expect(journal.getAll().map((event) => event.id)).toEqual(['oldest']);

    for (let index = 0; index < TEST_MAX_EVENTS + 5; index += 1) {
      journal.append({
        level: 'info',
        code: 'download_delegated',
        message: `Event ${index}`,
      });
    }
    await journal.flush();

    expect(journal.getAll()).toHaveLength(TEST_MAX_EVENTS);
    expect(journal.getAll().some((event) => event.id === 'oldest')).toBe(false);
    expect(journal.getAll()[0]?.message).toBe('Event 5');
  });

  it('sanitizes URLs, protocol payloads, control characters, and oversized context', async () => {
    const journal = createDiagnosticJournal({
      load: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      maxEvents: TEST_MAX_EVENTS,
      now: () => 1000,
    });
    await journal.initialize();

    journal.append({
      level: 'error',
      code: 'desktop_activation_failed',
      message: 'Failed\nwith\tcontrol characters',
      context: {
        url: 'https://user:pass@example.com/file.zip?token=secret#fragment',
        pageUrl: 'magnet:?xt=urn:btih:secret',
        error: 'x'.repeat(700),
        ...Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`key${index}`, index])),
      },
    });

    expect(journal.getAll()[0]).toMatchObject({
      message: 'Failed with control characters',
      context: {
        url: 'https://example.com/file.zip',
        pageUrl: 'magnet:[redacted]',
      },
    });
    expect(String(journal.getAll()[0]?.context?.error).length).toBeLessThanOrEqual(512);
    expect(Object.keys(journal.getAll()[0]?.context ?? {})).toHaveLength(12);
  });

  it('continues with pending events when stored diagnostics cannot be read', async () => {
    const onPersistError = vi.fn();
    const journal = createDiagnosticJournal({
      load: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      save: vi.fn().mockResolvedValue(undefined),
      maxEvents: TEST_MAX_EVENTS,
      onPersistError,
      now: () => 1000,
    });
    journal.append({ level: 'warn', code: 'download_skipped', message: 'Pending' });

    await journal.initialize();

    expect(journal.getAll()).toHaveLength(1);
    expect(onPersistError).toHaveBeenCalledTimes(1);
  });

  it('reports persistence failures to explicit callers', async () => {
    const error = new Error('quota exceeded');
    const onPersistError = vi.fn();
    const journal = createDiagnosticJournal({
      load: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockRejectedValue(error),
      maxEvents: TEST_MAX_EVENTS,
      onPersistError,
      now: () => 1000,
    });
    await journal.initialize();
    journal.append({ level: 'info', code: 'download_delegated', message: 'Event' });

    await expect(journal.flush()).rejects.toThrow('quota exceeded');
    expect(onPersistError).toHaveBeenCalledWith(error);
  });

  it('trims the oldest events when the configured limit shrinks', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const journal = createDiagnosticJournal({
      load: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 12 }, (_, index) => storedEvent(`${index}`, index)),
        ),
      save,
      maxEvents: 12,
      now: () => 1000,
    });
    await journal.initialize();

    journal.setMaxEvents(10);
    await journal.flush();

    expect(journal.getAll().map((event) => event.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `${index + 2}`),
    );
    expect(save).toHaveBeenLastCalledWith(journal.getAll());
  });

  it('applies a changed limit before stored events are hydrated', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const journal = createDiagnosticJournal({
      load: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 12 }, (_, index) => storedEvent(`${index}`, index)),
        ),
      save,
      maxEvents: 12,
      now: () => 1000,
    });

    journal.setMaxEvents(10);
    await journal.initialize();

    expect(journal.getAll()).toHaveLength(10);
    expect(journal.getAll()[0]?.id).toBe('2');
    expect(save).toHaveBeenLastCalledWith(journal.getAll());
  });
});
