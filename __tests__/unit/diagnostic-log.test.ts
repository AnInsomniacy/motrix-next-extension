import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticLog } from '@/modules/storage/diagnostic-log';
import type { DiagnosticEvent } from '@/shared/types';

// ─── Tests ──────────────────────────────────────────────

describe('DiagnosticLog', () => {
  let log: DiagnosticLog;

  beforeEach(() => {
    log = new DiagnosticLog(5); // small max for testing
  });

  describe('append', () => {
    it('adds an event with auto-generated id and timestamp', () => {
      log.append({ level: 'info', code: 'rpc_connected', message: 'Connected to aria2' });

      const events = log.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBeDefined();
      expect(events[0]?.id).not.toBe('');
      expect(events[0]?.ts).toBeGreaterThan(0);
      expect(events[0]?.level).toBe('info');
      expect(events[0]?.code).toBe('rpc_connected');
      expect(events[0]?.message).toBe('Connected to aria2');
    });

    it('preserves optional context', () => {
      log.append({
        level: 'error',
        code: 'download_failed',
        message: 'Failed',
        context: { url: 'https://example.com', retryCount: 2 },
      });

      const events = log.getAll();
      expect(events[0]?.context).toEqual({ url: 'https://example.com', retryCount: 2 });
    });

    it('generates unique ids for each event', () => {
      log.append({ level: 'info', code: 'rpc_connected', message: 'A' });
      log.append({ level: 'info', code: 'rpc_connected', message: 'B' });

      const events = log.getAll();
      expect(events[0]?.id).not.toBe(events[1]?.id);
    });
  });

  describe('ring buffer behavior', () => {
    it('limits events to max capacity', () => {
      for (let i = 0; i < 10; i++) {
        log.append({ level: 'info', code: 'rpc_connected', message: `Event ${i}` });
      }

      const events = log.getAll();
      expect(events).toHaveLength(5);
    });

    it('keeps the most recent events when buffer overflows', () => {
      for (let i = 0; i < 8; i++) {
        log.append({ level: 'info', code: 'rpc_connected', message: `Event ${i}` });
      }

      const events = log.getAll();
      expect(events).toHaveLength(5);
      expect(events[0]?.message).toBe('Event 3');
      expect(events[4]?.message).toBe('Event 7');
    });
  });

  describe('getAll', () => {
    it('returns empty array when no events', () => {
      expect(log.getAll()).toEqual([]);
    });

    it('returns events in chronological order', () => {
      log.append({ level: 'info', code: 'rpc_connected', message: 'First' });
      log.append({ level: 'warn', code: 'rpc_unreachable', message: 'Second' });
      log.append({ level: 'error', code: 'download_failed', message: 'Third' });

      const events = log.getAll();
      expect(events[0]?.message).toBe('First');
      expect(events[1]?.message).toBe('Second');
      expect(events[2]?.message).toBe('Third');
    });

    it('returns a copy that does not mutate internal state', () => {
      log.append({ level: 'info', code: 'rpc_connected', message: 'Original' });

      const events = log.getAll();
      events.pop();

      expect(log.getAll()).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      log.append({ level: 'info', code: 'rpc_connected', message: 'A' });
      log.append({ level: 'info', code: 'rpc_connected', message: 'B' });

      log.clear();

      expect(log.getAll()).toEqual([]);
    });
  });

  describe('toJSON', () => {
    it('returns valid JSON string of all events', () => {
      log.append({ level: 'info', code: 'rpc_connected', message: 'Test' });

      const json = log.toJSON();
      const parsed = JSON.parse(json) as DiagnosticEvent[];

      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.code).toBe('rpc_connected');
    });
  });

  describe('hydrate', () => {
    it('restores events from a serialized array', () => {
      const events: DiagnosticEvent[] = [
        { id: 'a', ts: 1000, level: 'info', code: 'rpc_connected', message: 'Restored' },
        { id: 'b', ts: 2000, level: 'warn', code: 'rpc_unreachable', message: 'Warn' },
      ];

      log.hydrate(events);

      const result = log.getAll();
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('a');
      expect(result[1]?.id).toBe('b');
    });

    it('truncates to max capacity when hydrating excess events', () => {
      const events: DiagnosticEvent[] = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        ts: i * 1000,
        level: 'info' as const,
        code: 'rpc_connected' as const,
        message: `Event ${i}`,
      }));

      log.hydrate(events);

      expect(log.getAll()).toHaveLength(5);
      expect(log.getAll()[0]?.message).toBe('Event 5');
    });
  });
});
