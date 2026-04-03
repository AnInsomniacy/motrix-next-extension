// ─── Types ──────────────────────────────────────────────

export interface MenuItem {
  id: string;
  title: string;
  contexts: string[];
}

interface ContextMenuInfo {
  linkUrl?: string;
  srcUrl?: string;
  pageUrl?: string;
}

// ─── Service ────────────────────────────────────────────

/**
 * Context menu builder and URL extractor.
 * Pure functions — no chrome.* dependency.
 */
export class ContextMenuService {
  /** Build the standard context menu item definitions. */
  static buildMenuItems(): MenuItem[] {
    return [
      {
        id: 'download-with-motrix-next',
        title: 'Download with Motrix Next',
        contexts: ['link', 'image', 'audio', 'video'],
      },
    ];
  }

  /**
   * Extract the downloadable URL from context menu click info.
   * Prefers linkUrl, falls back to srcUrl. Returns null if neither.
   */
  static extractUrl(info: ContextMenuInfo): string | null {
    return info.linkUrl ?? info.srcUrl ?? null;
  }
}
