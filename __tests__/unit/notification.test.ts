import { describe, it, expect } from 'vitest';
import { NotificationService } from '@/modules/services/notification';

describe('NotificationService', () => {
  describe('buildSentNotification', () => {
    it('builds a notification for successful download send', () => {
      const notif = NotificationService.buildSentNotification('archive.zip', 42);

      expect(notif.id).toContain('sent-42');
      expect(notif.options.type).toBe('basic');
      expect(notif.options.message).toContain('archive.zip');
    });
  });

  describe('buildFailedNotification', () => {
    it('builds a notification for failed download send', () => {
      const notif = NotificationService.buildFailedNotification(
        'archive.zip',
        'Connection timeout',
      );

      expect(notif.options.type).toBe('basic');
      expect(notif.options.message).toContain('archive.zip');
    });
  });

  describe('buildFallbackNotification', () => {
    it('builds a notification for browser fallback', () => {
      const notif = NotificationService.buildFallbackNotification('archive.zip');

      expect(notif.options.type).toBe('basic');
      expect(notif.options.message).toContain('archive.zip');
    });
  });

  describe('resolveClickAction', () => {
    it('returns open-options for error notifications', () => {
      const action = NotificationService.resolveClickAction('failed-123');
      expect(action).toBe('open-options');
    });

    it('returns launch-app for sent notifications', () => {
      const action = NotificationService.resolveClickAction('sent-42');
      expect(action).toBe('launch-app');
    });

    it('returns none for unknown notification ids', () => {
      const action = NotificationService.resolveClickAction('unknown');
      expect(action).toBe('none');
    });
  });
});
