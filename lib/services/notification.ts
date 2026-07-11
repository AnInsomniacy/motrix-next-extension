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

// ─── Service ────────────────────────────────────────────

/**
 * Notification builder and click action resolver.
 * Pure functions — no chrome.* dependency.
 */
export class NotificationService {
  static buildDuplicateDownloadNotification(
    title = 'Task submitted',
    message = 'Duplicate request skipped',
  ): NotificationPayload {
    return {
      id: `duplicate-download-${Date.now()}`,
      options: {
        type: 'basic',
        title,
        message,
        iconUrl: 'icon/128.png',
      },
    };
  }
}
