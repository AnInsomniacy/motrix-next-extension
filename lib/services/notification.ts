// ─── Types ──────────────────────────────────────────────

export interface NotificationPayload {
  id: string;
  options: {
    type: string;
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
  static buildSentNotification(filename: string, downloadId: number): NotificationPayload {
    return {
      id: `sent-${downloadId}`,
      options: {
        type: 'basic',
        title: 'Sent to Motrix Next',
        message: `${filename} is now downloading`,
        iconUrl: 'icon/128.png',
      },
    };
  }

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

  static buildFallbackNotification(filename: string): NotificationPayload {
    return {
      id: `fallback-${Date.now()}`,
      options: {
        type: 'basic',
        title: 'Fallback to Browser',
        message: `${filename} — downloading with browser instead`,
        iconUrl: 'icon/128.png',
      },
    };
  }

  /**
   * Determine what action to take when a notification is clicked.
   */
  static resolveClickAction(notificationId: string): ClickAction {
    if (notificationId.startsWith('sent-')) return 'launch-app';
    if (notificationId.startsWith('failed-')) return 'open-options';
    return 'none';
  }
}
