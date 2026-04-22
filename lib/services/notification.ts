// ─── Types ──────────────────────────────────────────────

export interface NotificationPayload {
  id: string;
  options: {
    type: 'basic';
    title: string;
    message: string;
    iconUrl: string;
  };
}

export type ClickAction = 'open-options' | 'launch-app' | 'none';

// ─── Service ────────────────────────────────────────────

/**
 * Notification builder and click action resolver.
 * Pure functions — no chrome.* dependency.
 */
export class NotificationService {
  static buildFailedNotification(filename: string, error: string): NotificationPayload {
    return {
      id: `failed-${Date.now()}`,
      options: {
        type: 'basic',
        title: 'Download Failed',
        message: `${filename}: ${error}`,
        iconUrl: 'icon/128.png',
      },
    };
  }

  /**
   * Determine what action to take when a notification is clicked.
   */
  static resolveClickAction(notificationId: string): ClickAction {
    if (notificationId.startsWith('failed-')) return 'open-options';
    return 'none';
  }
}
