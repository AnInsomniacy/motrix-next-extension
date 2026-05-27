import { describe, it, expect } from 'vitest';
import { NotificationService } from '@/lib/services/notification';

describe('NotificationService', () => {
  describe('buildFailedNotification', () => {
    it('builds a notification for failed download routing', () => {
      const notif = NotificationService.buildFailedNotification(
        'archive.zip',
        'Could not reach Motrix Next',
      );

      expect(notif.id).toMatch(/^failed-/);
      expect(notif.options.type).toBe('basic');
      expect(notif.options.message).toContain('archive.zip');
      expect(notif.options.message).toContain('Could not reach Motrix Next');
      expect(notif.options.iconUrl).toBe('icon/128.png');
    });
  });

  describe('buildDuplicateDownloadNotification', () => {
    it('builds a notification for blocked duplicate downloads', () => {
      const notif = NotificationService.buildDuplicateDownloadNotification();

      expect(notif.id).toMatch(/^duplicate-download-/);
      expect(notif.options.type).toBe('basic');
      expect(notif.options.title).toBe('Task submitted');
      expect(notif.options.message).toBe('Duplicate request skipped');
      expect(notif.options.iconUrl).toBe('icon/128.png');
    });
  });

  describe('resolveClickAction', () => {
    it('returns open-options for failed notifications', () => {
      const action = NotificationService.resolveClickAction('failed-123');
      expect(action).toBe('open-options');
    });

    it('returns none for unknown notification ids', () => {
      const action = NotificationService.resolveClickAction('unknown');
      expect(action).toBe('none');
    });
  });
});
