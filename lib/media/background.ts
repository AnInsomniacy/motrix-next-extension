import { browser, type Browser } from 'wxt/browser';
import type { DesktopApiClient } from '../api';
import { MediaApiError } from '../api';
import { updateSettings } from '../storage';
import {
  MEDIA_RETENTION_MS,
  type ConnectionConfig,
  type DownloadSettings,
  type MediaCandidate,
  type SiteRule,
} from '../schema';
import {
  captureRequestHeaderContext,
  type RequestHeaderContextStore,
} from '../download/request-context';
import { matchSiteRule } from '../site-rules';
import { createMediaCatalog } from './catalog';
import {
  detectMedia,
  hostname,
  isMediaFragment,
  mediaOrigin,
  type MediaObservation,
} from './detection';
import { captureMediaContext } from './request-context';
import { MediaCommandSchema, MediaObservationsSchema, type MediaList } from './messages';
import { createMediaWorkflow, mediaErrorCode } from './workflow';
import type { MediaRequestContext } from './contracts';

const HTTP_URLS = ['http://*/*', 'https://*/*'];
const CLEANUP_ALARM = 'media-cleanup';
const REQUEST_TTL_MS = 2 * 60_000;

export function startMediaBackground(options: {
  client: DesktopApiClient;
  ensureConfig: () => Promise<void>;
  settings: () => DownloadSettings;
  siteRules: () => SiteRule[];
  connection: () => ConnectionConfig;
  activate: () => Promise<boolean>;
  requestHeaders: RequestHeaderContextStore;
  onError?: () => void;
}) {
  const catalog = createMediaCatalog();
  const pending = new Map<string, { context: MediaRequestContext; generation: string }>();
  const generations = new Map<string, number>();
  let configured = false;
  const report = () => options.onError?.();
  const safely = (work: Promise<unknown>) => {
    void work.catch(report);
  };
  safely(
    options.ensureConfig().then(() => {
      configured = true;
    }),
  );
  const generation = (tabId: number, frameId: number) =>
    `${generations.get(`${tabId}:0`) ?? 0}:${generations.get(`${tabId}:${frameId}`) ?? 0}`;

  function allowed(pageUrl: string, url: string): boolean {
    const settings = options.settings();
    return (
      settings.mediaDiscovery.enabled &&
      !settings.mediaDiscovery.excludedHosts.includes(hostname(pageUrl)) &&
      matchSiteRule(options.siteRules(), [pageUrl, url]) !== 'always-skip'
    );
  }

  async function frameContext(tabId: number, frameId: number, documentId?: string) {
    if (tabId < 0 || frameId < 0) return null;
    const [tab, frame] = await Promise.all([
      browser.tabs.get(tabId),
      browser.webNavigation.getFrame({ tabId, frameId }),
    ]);
    if (!tab.url || !/^https?:/.test(tab.url) || !frame || frame.errorOccurred) return null;
    if (documentId && frame.documentId && documentId !== frame.documentId) return null;
    return { tab, frame };
  }

  async function validateCandidate(candidate: MediaCandidate): Promise<boolean> {
    await options.ensureConfig();
    if (!allowed(candidate.pageUrl, candidate.url)) return false;
    try {
      const current = await frameContext(candidate.tabId, candidate.frameId, candidate.documentId);
      return Boolean(
        current &&
        current.frame.url === candidate.frameUrl &&
        current.tab.url === candidate.pageUrl &&
        candidate.lastSeen >= Date.now() - MEDIA_RETENTION_MS,
      );
    } catch {
      return false;
    }
  }

  async function updateBadge(tabId: number) {
    const count = await catalog.run(
      (state) =>
        state.candidates.filter((item) => item.tabId === tabId && item.kind !== 'embedded').length,
    );
    await browser.action.setBadgeText({ tabId, text: count ? String(count) : '' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#7c5800' });
  }

  async function observe(
    input: MediaObservation,
    tabId: number,
    frameId: number,
    documentId?: string,
    title = '',
    context?: MediaRequestContext,
    documentUrl?: string,
  ) {
    const detected = detectMedia(input);
    const fragment =
      input.evidence === 'network' &&
      input.method === 'GET' &&
      [200, 206, 304].includes(input.status ?? 0) &&
      isMediaFragment(input.url, input.mime);
    if (!detected && !fragment) return;
    await options.ensureConfig();
    const current = await frameContext(tabId, frameId, documentId).catch(() => null);
    if (!current || !allowed(current.tab.url ?? '', input.url)) return;
    if (documentUrl && current.frame.url !== documentUrl) return;
    const now = Date.now();
    const cleanContext = context
      ? {
          ...captureMediaContext(input.url, context.headers, options.settings()),
          capturedAt: context.capturedAt,
        }
      : undefined;
    if (cleanContext?.headers.length) {
      await catalog.run((state) => {
        const previous = state.contexts.find(
          (item) =>
            item.tabId === tabId &&
            item.frameId === frameId &&
            item.documentId === (current.frame.documentId ?? '') &&
            mediaOrigin(item.url) === mediaOrigin(input.url),
        );
        // Avoid one storage transaction per fragment when credentials are unchanged.
        if (
          previous &&
          now - previous.capturedAt < 15_000 &&
          JSON.stringify(previous.headers) === JSON.stringify(cleanContext.headers)
        )
          return;
        state.contexts = state.contexts.filter((item) => item !== previous);
        state.contexts.push({
          ...cleanContext,
          tabId,
          frameId,
          documentId: current.frame.documentId ?? '',
          frameUrl: current.frame.url,
          pageUrl: current.tab.url ?? '',
        });
      }, true);
    }
    if (!detected) return;
    await catalog.observe({
      ...detected,
      id: crypto.randomUUID(),
      tabId,
      frameId,
      documentId: current.frame.documentId ?? '',
      frameUrl: current.frame.url,
      pageUrl: current.tab.url ?? '',
      title: (title || current.tab.title || detected.filename).slice(0, 512),
      firstSeen: now,
      lastSeen: now,
      context: cleanContext,
    });
    await updateBadge(tabId);
  }

  browser.webRequest.onSendHeaders.addListener(
    (details) => {
      if (!configured) return;
      // Capture synchronously so a fast response cannot overtake its request context.
      const now = Date.now();
      for (const [id, entry] of pending)
        if (entry.context.capturedAt < now - REQUEST_TTL_MS) pending.delete(id);
      if (pending.size >= 512) {
        const oldest = pending.keys().next().value;
        if (oldest) pending.delete(oldest);
      }
      const settings = options.settings();
      if (settings.forwardRequestHeaders) {
        const legacy = captureRequestHeaderContext(details);
        if (legacy) options.requestHeaders.remember(legacy);
      }
      if (details.tabId < 0 || !settings.mediaDiscovery.enabled) return;
      pending.set(details.requestId, {
        context: captureMediaContext(details.url, details.requestHeaders ?? [], settings),
        generation: generation(details.tabId, details.frameId),
      });
    },
    { urls: HTTP_URLS },
    import.meta.env.FIREFOX ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'],
  );

  browser.webRequest.onResponseStarted.addListener(
    (details) => {
      const captured = pending.get(details.requestId);
      const context = captured?.context;
      pending.delete(details.requestId);
      if (
        !details.documentId &&
        captured &&
        captured.generation !== generation(details.tabId, details.frameId)
      )
        return;
      const documentUrl =
        'documentUrl' in details && typeof details.documentUrl === 'string'
          ? details.documentUrl
          : undefined;
      const header = (name: string) =>
        details.responseHeaders?.find((item) => item.name.toLowerCase() === name)?.value;
      safely(
        observe(
          {
            url: details.url,
            method: details.method,
            status: details.statusCode,
            evidence: 'network',
            mime: header('content-type'),
            disposition: header('content-disposition'),
            length: header('content-length'),
            contentRange: header('content-range'),
          },
          details.tabId,
          details.frameId,
          details.documentId,
          '',
          context?.url === details.url ? context : undefined,
          documentUrl,
        ),
      );
    },
    { urls: HTTP_URLS },
    ['responseHeaders'],
  );
  browser.webRequest.onErrorOccurred.addListener(
    (details) => {
      pending.delete(details.requestId);
    },
    { urls: HTTP_URLS },
  );
  browser.webRequest.onCompleted.addListener(
    (details) => {
      pending.delete(details.requestId);
    },
    { urls: HTTP_URLS },
  );

  async function synchronizeTab(tabId: number) {
    const [tab, frames] = await Promise.all([
      browser.tabs.get(tabId),
      browser.webNavigation.getAllFrames({ tabId }),
    ]);
    await catalog.run((state) => {
      state.candidates = state.candidates.filter((item) => {
        if (item.tabId !== tabId) return true;
        const frame = frames?.find((value) => value.frameId === item.frameId);
        return (
          frame &&
          !frame.errorOccurred &&
          frame.url === item.frameUrl &&
          (!frame.documentId || frame.documentId === item.documentId) &&
          tab.url === item.pageUrl &&
          allowed(item.pageUrl, item.url)
        );
      });
      state.contexts = state.contexts.filter(
        (item) =>
          item.tabId !== tabId ||
          Boolean(
            frames?.some(
              (frame) =>
                frame.frameId === item.frameId &&
                frame.url === item.frameUrl &&
                (!frame.documentId || frame.documentId === item.documentId),
            ) &&
            tab.url === item.pageUrl &&
            allowed(item.pageUrl, item.url),
          ),
      );
    }, true);
    await updateBadge(tabId);
  }

  browser.webNavigation.onCommitted.addListener((details) => {
    const key = `${details.tabId}:${details.frameId}`;
    const next = (generations.get(key) ?? 0) + 1;
    if (details.frameId === 0)
      for (const entry of generations.keys())
        if (entry.startsWith(`${details.tabId}:`)) generations.delete(entry);
    generations.set(key, next);
    options.requestHeaders.clear(details.tabId);
    safely(
      catalog
        .run((state) => {
          state.candidates = state.candidates.filter(
            (item) =>
              item.tabId !== details.tabId ||
              (details.frameId !== 0 && item.frameId !== details.frameId) ||
              Boolean(details.documentId && item.documentId === details.documentId),
          );
          state.contexts = state.contexts.filter(
            (item) =>
              item.tabId !== details.tabId ||
              (details.frameId !== 0 && item.frameId !== details.frameId) ||
              Boolean(details.documentId && item.documentId === details.documentId),
          );
        }, true)
        .then(() => updateBadge(details.tabId)),
    );
  });
  const sameDocumentNavigation = (details: { tabId: number; frameId: number; url: string }) => {
    // A same-document route change keeps playing media but refreshes its page provenance.
    safely(
      catalog.run((state) => {
        for (const item of [...state.candidates, ...state.contexts])
          if (item.tabId === details.tabId) {
            if (details.frameId === 0) item.pageUrl = details.url;
            if (item.frameId === details.frameId) item.frameUrl = details.url;
          }
      }, true),
    );
    safely(browser.tabs.sendMessage(details.tabId, { type: 'MEDIA_RESCAN' }));
  };
  browser.webNavigation.onHistoryStateUpdated.addListener(sameDocumentNavigation);
  browser.webNavigation.onReferenceFragmentUpdated.addListener(sameDocumentNavigation);
  browser.tabs.onRemoved.addListener((tabId) => {
    options.requestHeaders.clear(tabId);
    for (const entry of generations.keys())
      if (entry.startsWith(`${tabId}:`)) generations.delete(entry);
    safely(catalog.remove(tabId));
  });
  browser.tabs.onReplaced.addListener((added, removed) => {
    safely(
      catalog.remove(removed).then(() => browser.tabs.sendMessage(added, { type: 'MEDIA_RESCAN' })),
    );
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
    const command = MediaCommandSchema.safeParse(raw);
    if (!command.success) return;
    // Page scripts may report hints but cannot start downloads, inspect credentials, or change settings.
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('')))
      return;
    return (async () => {
      await options.ensureConfig();
      const message = command.data;
      switch (message.type) {
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
        case 'MEDIA_CLEAR': {
          const ids = await catalog.run((state) =>
            state.operations
              .filter(
                (item) =>
                  state.candidates.some(
                    (candidate) =>
                      candidate.id === item.candidateId && candidate.tabId === message.tabId,
                  ) &&
                  (!message.candidateId || item.candidateId === message.candidateId),
              )
              .map((item) => item.candidateId),
          );
          for (const id of ids) await workflow.cancel(message.tabId, id);
          await catalog.remove(message.tabId, message.candidateId);
          break;
        }
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
      return { ok: true, data: await list(message.tabId) };
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
      pending.clear();
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
