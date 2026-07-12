import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticLog } from '@/lib/diagnostics';
import { MAX_DIAGNOSTIC_EVENTS } from '@/lib/diagnostics';
import type { DiagnosticEvent } from '@/lib/schema';

// ─── Tests ──────────────────────────────────────────────

describe('DiagnosticLog', () => {
  let log: DiagnosticLog;

  beforeEach(() => {
    log = new DiagnosticLog(5); // small max for testing
  });

  describe('default capacity', () => {
    it('uses MAX_DIAGNOSTIC_EVENTS (100) as default capacity', () => {
      expect(MAX_DIAGNOSTIC_EVENTS).toBe(100);

      const productionLog = new DiagnosticLog();
      for (let i = 0; i < 150; i++) {
        productionLog.append({ level: 'info', code: 'config_loaded', message: `Event ${i}` });
      }

      const events = productionLog.getAll();
      expect(events).toHaveLength(100);
      // Oldest events should be dropped (0-49), newest kept (50-149)
      expect(events[0]?.message).toBe('Event 50');
      expect(events[99]?.message).toBe('Event 149');
    });
  });

  describe('append', () => {
    it('adds an event with auto-generated id and timestamp', () => {
      log.append({ level: 'info', code: 'config_loaded', message: 'Connected to Motrix Next' });

      const events = log.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]?.id).toBeDefined();
      expect(events[0]?.id).not.toBe('');
      expect(events[0]?.ts).toBeGreaterThan(0);
      expect(events[0]?.level).toBe('info');
      expect(events[0]?.code).toBe('config_loaded');
      expect(events[0]?.message).toBe('Connected to Motrix Next');
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
      log.append({ level: 'info', code: 'config_loaded', message: 'A' });
      log.append({ level: 'info', code: 'config_loaded', message: 'B' });

      const events = log.getAll();
      expect(events[0]?.id).not.toBe(events[1]?.id);
    });
  });

  describe('ring buffer behavior', () => {
    it('limits events to max capacity', () => {
      for (let i = 0; i < 10; i++) {
        log.append({ level: 'info', code: 'config_loaded', message: `Event ${i}` });
      }

      const events = log.getAll();
      expect(events).toHaveLength(5);
    });

    it('keeps the most recent events when buffer overflows', () => {
      for (let i = 0; i < 8; i++) {
        log.append({ level: 'info', code: 'config_loaded', message: `Event ${i}` });
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
      log.append({ level: 'info', code: 'config_loaded', message: 'First' });
      log.append({ level: 'warn', code: 'config_changed', message: 'Second' });
      log.append({ level: 'error', code: 'download_failed', message: 'Third' });

      const events = log.getAll();
      expect(events[0]?.message).toBe('First');
      expect(events[1]?.message).toBe('Second');
      expect(events[2]?.message).toBe('Third');
    });

    it('returns a copy that does not mutate internal state', () => {
      log.append({ level: 'info', code: 'config_loaded', message: 'Original' });

      const events = log.getAll();
      events.pop();

      expect(log.getAll()).toHaveLength(1);
    });
  });

  describe('hydrate', () => {
    it('restores events from a serialized array', () => {
      const events: DiagnosticEvent[] = [
        { id: 'a', ts: 1000, level: 'info', code: 'config_loaded', message: 'Restored' },
        { id: 'b', ts: 2000, level: 'warn', code: 'config_changed', message: 'Warn' },
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
        code: 'config_loaded' as const,
        message: `Event ${i}`,
      }));

      log.hydrate(events);

      expect(log.getAll()).toHaveLength(5);
      expect(log.getAll()[0]?.message).toBe('Event 5');
    });
  });
});
