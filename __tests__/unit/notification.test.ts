import { describe, it, expect } from 'vitest';
import { NotificationService } from '@/lib/services/notification';

describe('NotificationService', () => {
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
});
