import { Aria2Client } from '@/lib/rpc';
import { DownloadOrchestrator } from '@/lib/download';
import {
  DownloadBarService,
  CompletionTracker,
  ContextMenuService,
  NotificationService,
} from '@/lib/services';
import {
  DiagnosticLog,
  StorageService,
  parseRpcConfig,
  parseDownloadSettings,
  parseSiteRules,
} from '@/lib/storage';
import { buildProtocolUrl } from '@/lib/protocol';
import { decodeThunderLink } from '@/shared/thunder';
import { extractFilenameFromUrl } from '@/shared/url';
import { usePolling } from '@/shared/use-polling';
import { DEFAULT_RPC_CONFIG, DEFAULT_DOWNLOAD_SETTINGS } from '@/shared/constants';
import type { DownloadSettings, RpcConfig, SiteRule } from '@/shared/types';
import { I18nEngine } from '@/shared/i18n/engine';
import { resolveLocaleId, FALLBACK_LOCALE } from '@/shared/i18n/dictionaries';

export default defineBackground(() => {
  // ─── State (restored from storage on each wake) ───
  let rpcConfig: RpcConfig = { ...DEFAULT_RPC_CONFIG };
  let settings: DownloadSettings = { ...DEFAULT_DOWNLOAD_SETTINGS };
  let siteRules: SiteRule[] = [];
  let enhancedPermissions = false;

  const bgI18n = new I18nEngine(FALLBACK_LOCALE);

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
        title: bgI18n.t('notification_complete_title', 'Download Complete'),
        message: filename,
        iconUrl: notification.options.iconUrl,
      } as chrome.notifications.NotificationCreateOptions);
    },
  });

  const storageService = new StorageService(chrome.storage.local);

  // ─── Load config from storage on startup ──────────
  async function loadConfig(): Promise<void> {
    try {
      const data = await storageService.load();
      rpcConfig = data.rpc;
      client.updateConfig(rpcConfig);
      settings = data.settings;
      siteRules = data.siteRules;
      diagnosticLog.hydrate(data.diagnosticLog);

      // Hydrate i18n locale
      const effectiveLocale =
        data.uiPrefs.locale === 'auto'
          ? resolveLocaleId(chrome.i18n.getUILanguage())
          : data.uiPrefs.locale;
      bgI18n.setLocale(effectiveLocale);
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
      await storageService.saveDiagnosticLog(diagnosticLog.getAll());
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
      title: bgI18n.t('context_menu_download', menuItem.title),
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
      const url = decodeThunderLink(rawUrl);
      const tabUrl = info.pageUrl ?? '';

      try {
        await orchestrator.sendUrl(url, tabUrl);
      } catch {
        // Error already logged by orchestrator — show error notification
        const displayName = extractFilenameFromUrl(url) || url.split('/').pop() || 'download';
        await chrome.notifications.create(`failed-ctx-${Date.now()}`, {
          type: 'basic',
          title: bgI18n.t('notification_failed_title', 'Download Failed'),
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

  // Storage change listener — update config with schema validation
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.rpc?.newValue) {
      rpcConfig = parseRpcConfig(changes.rpc.newValue);
      client.updateConfig(rpcConfig);
    }
    if (changes.settings?.newValue) {
      settings = parseDownloadSettings(changes.settings.newValue);
      void downloadBarService.apply({
        hideDownloadBar: settings.hideDownloadBar,
        hasEnhancedPermissions: enhancedPermissions,
      });
    }
    if (changes.siteRules?.newValue) {
      siteRules = parseSiteRules(changes.siteRules.newValue);
    }
  });

  // Initial load + apply download bar + start completion polling
  void loadConfig().then(() => {
    downloadBarService.apply({
      hideDownloadBar: settings.hideDownloadBar,
      hasEnhancedPermissions: enhancedPermissions,
    });

    // Smart completion polling with exponential backoff
    const completionPoller = usePolling({
      fn: async () => {
        if (completionTracker.trackedCount > 0) {
          await completionTracker.poll();
        }
      },
      baseIntervalMs: 3000,
      maxIntervalMs: 30000,
      backoffMultiplier: 2,
    });
    completionPoller.start();
  });
});
