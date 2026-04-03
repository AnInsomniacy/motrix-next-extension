import { Aria2Client } from '@/modules/rpc/aria2-client';
import { DownloadOrchestrator } from '@/modules/download/orchestrator';
import { DownloadBarService } from '@/modules/services/download-bar';
import { CompletionTracker } from '@/modules/services/completion-tracker';
import { ContextMenuService } from '@/modules/services/context-menu';
import { NotificationService } from '@/modules/services/notification';
import { DiagnosticLog } from '@/modules/storage/diagnostic-log';
import { buildProtocolUrl } from '@/modules/protocol/launcher';
import { decodeThunderLink } from '@/shared/thunder';
import { extractFilenameFromUrl } from '@/shared/url';
import { DEFAULT_RPC_CONFIG, DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { DownloadSettings, RpcConfig, SiteRule } from '@/shared/types';

export default defineBackground(() => {
  // ─── State (restored from storage on each wake) ───
  let rpcConfig: RpcConfig = { ...DEFAULT_RPC_CONFIG };
  let settings: DownloadSettings = { ...DEFAULT_DOWNLOAD_SETTINGS };
  let siteRules: SiteRule[] = [];
  let enhancedPermissions = false;

  const client = new Aria2Client(rpcConfig, { timeoutMs: 5000, maxRetries: 1 });
  const downloadBarService = new DownloadBarService({
    setUiOptions: (opts) => chrome.downloads.setUiOptions(opts),
  });
  const diagnosticLog = new DiagnosticLog();

  const completionTracker = new CompletionTracker({
    tellStatus: (gid) => client.tellStatus(gid),
    onComplete: (_, filename) => {
      if (!settings.notifyOnComplete) return;
      const notification = NotificationService.buildSentNotification(filename, Date.now());
      void chrome.notifications.create(`complete-${Date.now()}`, {
        type: 'basic',
        title: chrome.i18n.getMessage('notification_complete_title') || 'Download Complete',
        message: filename,
        iconUrl: notification.options.iconUrl,
      } as chrome.notifications.NotificationCreateOptions);
    },
  });

  // ─── Load config from storage on startup ──────────
  async function loadConfig(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get([
        'rpc',
        'settings',
        'siteRules',
        'diagnosticLog',
      ]);
      if (stored.rpc) {
        rpcConfig = stored.rpc as RpcConfig;
        client.updateConfig(rpcConfig);
      }
      if (stored.settings) {
        settings = stored.settings as DownloadSettings;
      }
      if (stored.siteRules) {
        siteRules = stored.siteRules as SiteRule[];
      }
      if (stored.diagnosticLog) {
        diagnosticLog.hydrate(stored.diagnosticLog as import('@/shared/types').DiagnosticEvent[]);
      }
    } catch {
      // Use defaults on first install
    }

    // Check enhanced permissions
    try {
      enhancedPermissions = await chrome.permissions.contains({
        permissions: ['cookies', 'downloads.ui'],
        origins: ['https://*/*', 'http://*/*'],
      });
    } catch {
      enhancedPermissions = false;
    }
  }

  // ─── Persist diagnostic log to storage ────────────
  async function persistDiagnosticLog(): Promise<void> {
    try {
      await chrome.storage.local.set({ diagnosticLog: diagnosticLog.getAll() });
    } catch {
      // Silently fail — not critical
    }
  }

  // ─── Get tab URL for referer ──────────────────────
  async function getTabUrl(): Promise<string> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url ?? '';
    } catch {
      return '';
    }
  }

  // ─── Orchestrator ─────────────────────────────────
  const orchestrator = new DownloadOrchestrator({
    aria2: client,
    downloads: {
      pause: (id) => chrome.downloads.pause(id),
      resume: (id) => chrome.downloads.resume(id),
      cancel: (id) => chrome.downloads.cancel(id),
      erase: (query) => chrome.downloads.erase(query).then(() => {}),
    },
    notifications: {
      create: (id: string, opts: Record<string, unknown>) =>
        chrome.notifications.create(id, opts as chrome.notifications.NotificationCreateOptions),
    },
    cookies: {
      getAll: (details) => chrome.cookies.getAll(details),
    },
    diagnosticLog: {
      append: (event) => {
        diagnosticLog.append(event);
        void persistDiagnosticLog();
      },
    },
    getSettings: () => settings,
    getSiteRules: () => siteRules,
    getTabUrl,
    hasEnhancedPermissions: () => enhancedPermissions,
    onSent: (gid, filename) => completionTracker.track(gid, filename),
  });

  // ─── Register Listeners (must be synchronous top-level) ────

  // Download interception
  chrome.downloads.onCreated.addListener((item) => {
    void loadConfig().then(() =>
      orchestrator.handleCreated({
        id: item.id,
        url: item.url,
        finalUrl: item.finalUrl,
        filename: item.filename,
        fileSize: item.fileSize,
        mime: item.mime,
        byExtensionId: (item as unknown as Record<string, string>).byExtensionId,
        state: item.state,
      }),
    );
  });

  // Context menu
  const menuItems = ContextMenuService.buildMenuItems();
  for (const menuItem of menuItems) {
    chrome.contextMenus.create({
      id: menuItem.id,
      title: chrome.i18n.getMessage('context_menu_download') || menuItem.title,
      contexts: menuItem.contexts as [
        chrome.contextMenus.ContextType,
        ...chrome.contextMenus.ContextType[],
      ],
    });
  }

  chrome.contextMenus.onClicked.addListener((info) => {
    const rawUrl = ContextMenuService.extractUrl({
      linkUrl: info.linkUrl,
      srcUrl: info.srcUrl,
      pageUrl: info.pageUrl,
    });
    if (!rawUrl) return;

    void loadConfig().then(async () => {
      // ─── URL Classification ────────────────────
      // Decode thunder:// links to their original HTTP/FTP URL.
      // Magnet URIs pass through unchanged — aria2 handles them natively.
      const url = decodeThunderLink(rawUrl);
      const tabUrl = info.pageUrl ?? '';

      // ─── Collect Metadata (parity with interception path) ─
      const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';

      const headers: string[] = [];
      if (tabUrl) headers.push(`Referer: ${tabUrl}`);

      // Collect cookies when enhanced permissions are available
      if (enhancedPermissions) {
        try {
          const cookies = await chrome.cookies.getAll({ url });
          if (cookies.length > 0) {
            const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
            headers.push(`Cookie: ${cookieStr}`);
          }
        } catch {
          // Cookie collection is best-effort — graceful degradation
        }
      }

      // ─── Send to aria2 ────────────────────────
      // Do NOT set `out` — let aria2 resolve filename natively
      // (Content-Disposition > URL path, see HttpResponse.cc:determineFilename)
      const aria2Options: Record<string, unknown> = {};
      if (headers.length > 0) {
        aria2Options.header = headers;
      }

      try {
        const gid = await client.addUri([url], aria2Options);

        diagnosticLog.append({
          level: 'info',
          code: 'download_sent',
          message: `Context menu: ${displayName}`,
          context: { url, filename: displayName },
        });
        void persistDiagnosticLog();

        // ─── Completion tracking (parity with interception) ─
        completionTracker.track(gid, displayName);

        if (settings.notifyOnStart) {
          await chrome.notifications.create(`sent-ctx-${Date.now()}`, {
            type: 'basic',
            title: chrome.i18n.getMessage('notification_sent_title') || 'Sent to Motrix Next',
            message: displayName,
            iconUrl: 'icon/128.png',
          });
        }
      } catch (error) {
        diagnosticLog.append({
          level: 'error',
          code: 'download_failed',
          message: `Context menu failed: ${url}`,
          context: { url, error: String(error) },
        });
        void persistDiagnosticLog();

        // ─── Error notification (not silent anymore) ─
        await chrome.notifications.create(`failed-ctx-${Date.now()}`, {
          type: 'basic',
          title: chrome.i18n.getMessage('notification_failed_title') || 'Download Failed',
          message: displayName,
          iconUrl: 'icon/128.png',
        });
      }
    });
  });

  // Notification clicks
  chrome.notifications.onClicked.addListener((notificationId) => {
    const action = NotificationService.resolveClickAction(notificationId);
    switch (action) {
      case 'launch-app':
        void chrome.tabs.create({ url: buildProtocolUrl(), active: false }).then((tab) => {
          if (tab.id) setTimeout(() => chrome.tabs.remove(tab.id!), 500);
        });
        break;
      case 'open-options':
        void chrome.runtime.openOptionsPage();
        break;
    }
  });

  // Storage change listener — update config when user modifies settings
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.rpc?.newValue) {
      rpcConfig = changes.rpc.newValue as RpcConfig;
      client.updateConfig(rpcConfig);
    }
    if (changes.settings?.newValue) {
      settings = changes.settings.newValue as DownloadSettings;
      void downloadBarService.apply({
        hideDownloadBar: settings.hideDownloadBar,
        hasEnhancedPermissions: enhancedPermissions,
      });
    }
    if (changes.siteRules?.newValue) {
      siteRules = changes.siteRules.newValue as SiteRule[];
    }
  });

  // Initial load + apply download bar + start completion polling
  void loadConfig().then(() => {
    downloadBarService.apply({
      hideDownloadBar: settings.hideDownloadBar,
      hasEnhancedPermissions: enhancedPermissions,
    });

    // Poll completion every 3 seconds when there are tracked GIDs
    setInterval(() => {
      if (completionTracker.trackedCount > 0) {
        void completionTracker.poll();
      }
    }, 3000);
  });
});
