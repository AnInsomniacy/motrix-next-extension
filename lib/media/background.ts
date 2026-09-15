import { browser, type Browser } from 'wxt/browser';
import type { DesktopApiClient } from '../api';
import { MediaApiError } from '../api';
import { updateSettings } from '../storage';
import {
  type ConnectionConfig,
  type DownloadSettings,
  type MediaCandidate,
  type SiteRule,
} from '../schema';
import { type RequestHeaderContextStore } from '../download/request-context';
import { matchSiteRule } from '../site-rules';
import { createMediaCatalog } from './catalog';
import { hostname } from './detection';
import { frameContext, startMediaDiscovery } from './discovery';
import { captureMediaContext } from './request-context';
import {
  MediaCommandSchema,
  MediaFrameCommandSchema,
  MediaObservationsSchema,
  type MediaList,
} from './messages';
import { createMediaWorkflow, mediaErrorCode } from './workflow';
import { loadUiPrefs } from '../storage';
import { I18nEngine } from '@/shared/i18n/engine';
import { resolveLocaleId } from '@/shared/i18n/dictionaries';

const CLEANUP_ALARM = 'media-cleanup';

export function startMediaBackground(options: {
  client: DesktopApiClient;
  ensureConfig: () => Promise<void>;
  settings: () => DownloadSettings;
  siteRules: () => SiteRule[];
  connection: () => ConnectionConfig;
  activate: () => Promise<boolean>;
  sendFile: (candidate: MediaCandidate) => Promise<boolean>;
  requestHeaders: RequestHeaderContextStore;
  onError?: () => void;
}) {
  const catalog = createMediaCatalog();
  const report = () => options.onError?.();
  const safely = (work: Promise<unknown>) => {
    void work.catch(report);
  };

  function allowed(pageUrl: string, url: string): boolean {
    const settings = options.settings();
    return (
      settings.mediaDiscovery.enabled &&
      !settings.mediaDiscovery.excludedHosts.includes(hostname(pageUrl)) &&
      matchSiteRule(options.siteRules(), [pageUrl, url]) !== 'always-skip'
    );
  }

  const { observe, validateCandidate, synchronizeTab, updateBadge, clearRequests } =
    startMediaDiscovery({
      catalog,
      ensureConfig: options.ensureConfig,
      settings: options.settings,
      requestHeaders: options.requestHeaders,
      allowed,
      report,
    });

  async function connectionKey() {
    const connection = options.connection();
    const settings = options.settings();
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify([
          connection.port,
          connection.secret,
          settings.forwardCookies,
          settings.forwardRequestHeaders,
        ]),
      ),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }
  const workflow = createMediaWorkflow({
    catalog,
    client: options.client,
    getSettings: options.settings,
    activate: options.activate,
    sendFile: options.sendFile,
    validateCandidate,
    connectionKey,
  });

  async function list(tabId: number): Promise<MediaList> {
    await synchronizeTab(tabId);
    const tab = await browser.tabs.get(tabId);
    const host = hostname(tab.url ?? '');
    const settings = options.settings();
    return catalog.run((state) => ({
      host,
      enabled: settings.mediaDiscovery.enabled,
      excluded: settings.mediaDiscovery.excludedHosts.includes(host),
      items: state.candidates
        .filter((item) => item.tabId === tabId)
        .map(({ context, ...candidate }) => {
          const operation = state.operations.find((item) => item.candidateId === candidate.id);
          const view = operation
            ? (({ request, connectionKey: _connectionKey, ...data }) => ({
                ...data,
                probeId: request.id,
              }))(operation)
            : undefined;
          return {
            ...candidate,
            hasRequestContext: Boolean(context?.headers.length),
            operation: view,
          };
        }),
    }));
  }

  browser.runtime.onMessage.addListener((raw: unknown, sender: Browser.runtime.MessageSender) => {
    if (
      raw &&
      typeof raw === 'object' &&
      'type' in raw &&
      raw.type === 'MEDIA_OVERLAY_LABELS' &&
      sender.id === browser.runtime.id
    ) {
      return loadUiPrefs().then((prefs) => {
        const locale =
          prefs.locale === 'auto' ? resolveLocaleId(browser.i18n.getUILanguage()) : prefs.locale;
        const i18n = new I18nEngine(locale);
        return {
          download: i18n.t('media_download'),
          close: i18n.t('media_close'),
          options: i18n.t('media_options'),
        };
      });
    }
    const observations = MediaObservationsSchema.safeParse(raw);
    if (observations.success) {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab?.id === undefined ||
        sender.frameId === undefined
      )
        return;
      const tabId = sender.tab.id;
      const frameId = sender.frameId;
      return Promise.all(
        observations.data.observations.map((item) =>
          observe(
            item,
            tabId,
            frameId,
            sender.documentId,
            observations.data.title,
            undefined,
            sender.url,
          ),
        ),
      )
        .then(() => ({ ok: true }))
        .catch(() => ({ ok: false }));
    }
    const scoped = MediaFrameCommandSchema.safeParse(raw);
    const command = MediaCommandSchema.safeParse(scoped.success ? scoped.data.command : raw);
    if (!command.success) return;
    if (sender.id !== browser.runtime.id) return;
    if (scoped.success) {
      if (sender.tab?.id === undefined || sender.frameId === undefined) return;
      if (['MEDIA_ENABLE', 'MEDIA_CLEAR'].includes(command.data.type)) return;
      command.data.tabId = sender.tab.id;
    } else if (!sender.url?.startsWith(browser.runtime.getURL(''))) return;
    return (async () => {
      await options.ensureConfig();
      const message = command.data;
      let sourceFrameId = sender.frameId;
      if (scoped.success) {
        if (sourceFrameId === undefined) throw new MediaApiError('source_expired');
        const isPanel = sender.url?.split('?')[0] === browser.runtime.getURL('/media.html');
        if (isPanel) {
          const panel = await browser.webNavigation.getFrame({
            tabId: message.tabId,
            frameId: sourceFrameId,
          });
          if (!panel || panel.parentFrameId < 0) throw new MediaApiError('source_expired');
          sourceFrameId = panel.parentFrameId;
        }
        const current = await frameContext(
          message.tabId,
          sourceFrameId,
          isPanel ? undefined : sender.documentId,
        );
        if (!current || (!isPanel && current.frame.url !== sender.url))
          throw new MediaApiError('source_expired');
        if (!allowed(current.tab.url ?? '', current.frame.url))
          return { ok: true, data: { ...(await list(message.tabId)), enabled: false, items: [] } };
        if ('candidateId' in message && message.candidateId) {
          const valid = await catalog.run((state) =>
            state.candidates.some(
              (item) =>
                item.id === message.candidateId &&
                item.tabId === message.tabId &&
                item.frameId === sourceFrameId &&
                item.documentId === (current.frame.documentId ?? '') &&
                item.frameUrl === current.frame.url,
            ),
          );
          if (!valid) throw new MediaApiError('source_expired');
        }
      }
      switch (message.type) {
        case 'MEDIA_LOCATE': {
          const item = await catalog.run((state) =>
            state.candidates.find(
              (candidate) =>
                candidate.id === message.candidateId && candidate.tabId === message.tabId,
            ),
          );
          if (!item || !(await validateCandidate(item))) throw new MediaApiError('source_expired');
          const found: unknown = await browser.tabs.sendMessage(
            message.tabId,
            { type: 'MEDIA_LOCATE_PLAYER', url: item.url },
            { frameId: item.frameId },
          );
          if (found !== true) throw new MediaApiError('player_not_found');
          await browser.tabs.update(message.tabId, { active: true });
          break;
        }
        case 'MEDIA_ENABLE':
          await updateSettings({
            mediaDiscovery: { ...options.settings().mediaDiscovery, enabled: message.enabled },
          });
          break;
        case 'MEDIA_SITE': {
          const host = hostname((await browser.tabs.get(message.tabId)).url ?? '');
          if (!host) throw new MediaApiError('unsupported_source');
          const excluded = options
            .settings()
            .mediaDiscovery.excludedHosts.filter((value) => value !== host);
          if (message.excluded) excluded.push(host);
          if (excluded.length > 100) throw new MediaApiError('site_limit');
          await updateSettings({
            mediaDiscovery: { ...options.settings().mediaDiscovery, excludedHosts: excluded },
          });
          break;
        }
        case 'MEDIA_RESCAN':
          await browser.tabs.sendMessage(message.tabId, { type: 'MEDIA_RESCAN' });
          break;
        case 'MEDIA_CLEAR':
          await catalog.remove(message.tabId, message.candidateId);
          break;
        case 'MEDIA_DOWNLOAD_FILE':
          await workflow.downloadFile(message.tabId, message.candidateId);
          break;
        case 'MEDIA_PROBE':
          await workflow.probe(message.tabId, message.candidateId);
          break;
        case 'MEDIA_POLL':
          await workflow.poll(message.tabId, message.candidateId);
          break;
        case 'MEDIA_SUBMIT':
          await workflow.submit(message.tabId, message.candidateId, message.selection);
          break;
        case 'MEDIA_CANCEL':
          await workflow.cancel(message.tabId, message.candidateId);
          break;
      }
      const data = await list(message.tabId);
      if (scoped.success) data.items = data.items.filter((item) => item.frameId === sourceFrameId);
      return { ok: true, data };
    })().catch((error: unknown) => ({ ok: false, error: mediaErrorCode(error) }));
  });

  async function cleanup() {
    await options.ensureConfig();
    const tabs = await browser.tabs.query({});
    const key = await connectionKey();
    const openIds = new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])));
    await catalog.run((state) => {
      state.candidates = state.candidates.filter(
        (item) => openIds.has(item.tabId) && allowed(item.pageUrl, item.url),
      );
      for (const item of state.candidates)
        if (item.context)
          item.context = {
            ...captureMediaContext(item.url, item.context.headers, options.settings()),
            capturedAt: item.context.capturedAt,
          };
      state.contexts = state.contexts
        .filter((item) => openIds.has(item.tabId) && allowed(item.pageUrl, item.url))
        .map((item) => ({
          ...item,
          headers: captureMediaContext(item.url, item.headers, options.settings()).headers,
        }));
      for (const operation of state.operations) {
        const stripped = operation.request.source.requestContexts.map((context) => ({
          ...context,
          headers: captureMediaContext(context.url, context.headers, options.settings()).headers,
        }));
        if (JSON.stringify(stripped) !== JSON.stringify(operation.request.source.requestContexts)) {
          operation.request.source.requestContexts = [];
          if (!['submitted', 'cancelled'].includes(operation.state)) {
            if (!['submitting', 'cancelling'].includes(operation.state)) operation.state = 'failed';
            operation.error = 'privacy_changed';
          }
        }
        if (
          operation.connectionKey !== key &&
          !['submitted', 'cancelled'].includes(operation.state)
        ) {
          operation.request.source.requestContexts = [];
          if (!['submitting', 'cancelling'].includes(operation.state)) operation.state = 'failed';
          operation.error = 'connection_changed';
        }
      }
    }, true);
    for (const tabId of openIds) await updateBadge(tabId).catch(() => undefined);
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.settings || changes.siteRules || changes.connection)) {
      clearRequests();
      options.requestHeaders.clear();
      safely(cleanup());
    }
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM) safely(cleanup());
  });
  safely(
    (async () => {
      await browser.alarms.create(CLEANUP_ALARM, { periodInMinutes: 1 });
    })(),
  );
  safely(cleanup());
}
