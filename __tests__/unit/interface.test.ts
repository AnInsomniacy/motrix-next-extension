import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, provide, reactive, ref, type App, type Component } from 'vue';
import { NConfigProvider, NDataTable, NSelect, NInputNumber, NSwitch, darkTheme } from 'naive-ui';
import { fakeBrowser } from 'wxt/testing';
import { createI18n, I18N_KEY, useNaiveLocale } from '@/shared/i18n/engine';
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales';
import { buildThemeOverrides, COLOR_SCHEMES } from '@/shared/theme';
import { createDefaultSnapshot } from '@/lib/schema';
import * as storage from '@/lib/storage';
import * as api from '@/lib/api';
import * as permissions from '@/lib/browser';
import * as media from '@/lib/media/messages';
import { mediaCandidate, mediaPresentation, mediaSelection } from '../fixtures/media';
import type { MediaItem } from '@/lib/media/messages';
import Popup from '@/entrypoints/popup/App.vue';
import Options from '@/entrypoints/options/App.vue';
import MediaPanel from '@/entrypoints/popup/components/MediaPanel.vue';
import { createSettingsBackup } from '@/lib/backup';
import { DICTIONARIES } from '@/shared/i18n/dictionaries';
import AppearanceSection from '@/entrypoints/options/components/AppearanceSection.vue';
import SiteRulesSection from '@/entrypoints/options/components/SiteRulesSection.vue';
import MediaSelection from '@/entrypoints/popup/components/MediaSelection.vue';

const stylesheet = document.createElement('style');
stylesheet.textContent = readFileSync('assets/styles/globals.css', 'utf8');
document.head.append(stylesheet);
const apps: App[] = [];
function mount(component: Component, props: Record<string, unknown> = {}, locale = 'en') {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      provide(I18N_KEY, createI18n(locale));
      return () => h(component, props);
    },
  });
  app.mount(host);
  apps.push(app);
  return host;
}
async function settle() {
  for (let i = 0; i < 12; i++) await nextTick();
}
function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function edit(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const connected: Awaited<ReturnType<typeof api.checkConnection>> = {
  status: 'connected',
  version: '3.9.9',
  stat: {
    downloadSpeed: '1024',
    uploadSpeed: '512',
    numActive: '2',
    numWaiting: '1',
    numStopped: '4',
    numStoppedTotal: '4',
  },
};
beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    version: '1.3.7',
    manifest_version: 3,
    name: 'Rayburst Connect',
  });
  vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en');
  vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([]);
  vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false);
  vi.spyOn(storage, 'loadSnapshot').mockResolvedValue(createDefaultSnapshot());
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({ events: [] });
});
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('real themed controls', () => {
  it('keeps teleported select origins stable when the document changes direction', async () => {
    const locale = ref('en');
    const selected = ref('one');
    mount({
      setup() {
        const { naiveLocale, naiveRtl } = useNaiveLocale(locale);
        return () =>
          h(
            NConfigProvider,
            { locale: naiveLocale.value, rtl: naiveRtl.value },
            {
              default: () =>
                h(NSelect, {
                  show: true,
                  virtualScroll: false,
                  value: selected.value,
                  options: [
                    { label: 'One', value: 'one' },
                    { label: 'Two', value: 'two' },
                  ],
                  'onUpdate:value': (value: string) => {
                    selected.value = value;
                  },
                }),
            },
          );
      },
    });
    for (const id of ['en', 'ar', 'fa', 'en']) {
      locale.value = id;
      await settle();
      expect(document.documentElement.dir).toBe(['ar', 'fa'].includes(id) ? 'rtl' : 'ltr');
      const follower = document.querySelector<HTMLElement>('.v-binder-follower-content');
      expect(follower).not.toBeNull();
      expect(getComputedStyle(follower!).left).toBe('0px');
      expect(getComputedStyle(follower!).top).toBe('0px');
      const option = [...document.querySelectorAll<HTMLElement>('.n-base-select-option')].find(
        (node) => node.textContent?.trim() === 'Two',
      );
      expect(option).toBeDefined();
      option!.click();
      await settle();
      expect(selected.value).toBe('two');
      selected.value = 'one';
    }
  });

  it('localizes library control messages in every supported language', async () => {
    const locale = ref('en');
    let result!: ReturnType<typeof useNaiveLocale>;
    mount({
      setup() {
        result = useNaiveLocale(locale);
        return () => h('div');
      },
    });
    for (const { id } of SUPPORTED_LOCALES) {
      locale.value = id;
      await settle();
      expect(result.naiveLocale.value.DynamicTags.add).toBe(DICTIONARIES[id]!.control_add);
      expect(result.naiveLocale.value.Empty.description).toBe(DICTIONARIES[id]!.control_empty);
      expect(result.naiveLocale.value.Select.placeholder).toBe(DICTIONARIES[id]!.control_select);
      expect(document.documentElement.lang).toBe(id.replace('_', '-'));
    }
  });
  it('renders populated tables and form controls with all supported palettes in both modes', async () => {
    const state = reactive({ scheme: COLOR_SCHEMES[0]!, dark: false });
    const host = mount({
      setup: () => () =>
        h(
          NConfigProvider,
          {
            theme: state.dark ? darkTheme : null,
            themeOverrides: buildThemeOverrides(state.scheme, state.dark),
          },
          {
            default: () => [
              h(NDataTable, {
                columns: [{ key: 'name', title: 'Name' }],
                data: [{ key: 'source', name: 'Source file' }],
              }),
              h(NSelect, { value: 'one', options: [{ label: 'One', value: 'one' }] }),
              h(NInputNumber, { value: 29110 }),
              h(NSwitch, { value: true }),
            ],
          },
        ),
    });
    for (const scheme of COLOR_SCHEMES)
      for (const dark of [false, true]) {
        state.scheme = scheme;
        state.dark = dark;
        await settle();
        expect(host.querySelector('td')?.textContent).toBe('Source file');
        expect(
          host.querySelector('input') || host.querySelector('[role="combobox"]'),
        ).not.toBeNull();
        expect(host.textContent).toContain('One');
      }
  });
});

describe('settings layout and appearance', () => {
  it('uses the library horizontal label layout for every settings row', async () => {
    const host = mount(Options);
    await settle();
    button(host, 'Download').click();
    await settle();
    let rows = [...host.querySelectorAll<HTMLElement>('.options-page:not([inert]) .settings-row')];
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      expect(row.classList.contains('n-form-item--left-labelled')).toBe(true);
      expect(getComputedStyle(row).gridTemplateAreas.replace(/\s+/g, ' ').trim()).toBe(
        '"label blank" "label feedback"',
      );
      expect(row.querySelector('.n-form-item-feedback-wrapper')).toBeNull();
    }
    expect(host.querySelectorAll('.scope-options .n-checkbox')).toHaveLength(4);
    button(host, 'Rules').click();
    await settle();
    rows = [...host.querySelectorAll<HTMLElement>('.options-page:not([inert]) .settings-row')];
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every((row) => row.classList.contains('n-form-item--left-labelled'))).toBe(true);
  });
  it('uses library theme controls and applies a custom color on completion', async () => {
    const custom = vi.fn();
    const theme = vi.fn();
    const host = mount(AppearanceSection, {
      theme: 'system',
      colorScheme: 'electric',
      customColorScheme: '#737373',
      'onUpdate:theme': theme,
      'onUpdate:customColorScheme': custom,
    });
    await settle();
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    host.querySelector<HTMLInputElement>('input[value="dark"]')!.click();
    await settle();
    expect(theme).toHaveBeenCalledWith('dark');
    host.querySelector<HTMLButtonElement>('button[aria-label="Custom Color"]')!.click();
    await settle();
    const hex = document.querySelector<HTMLInputElement>('.n-color-picker-input input')!;
    expect(hex).not.toBeNull();
    edit(hex, '#d75a35');
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(custom).toHaveBeenCalledWith('#D75A35');
  });

  it('retains rule input across navigation and keeps hidden pages inert', async () => {
    const host = mount(Options);
    await settle();
    button(host, 'Rules').click();
    await settle();
    const input = host.querySelector<HTMLInputElement>('.rule-add input')!;
    edit(input, '*.example.com');
    button(host, 'Maintenance').click();
    await settle();
    button(host, 'Rules').click();
    await settle();
    expect(host.querySelector<HTMLInputElement>('.rule-add input')).toBe(input);
    expect(input.value).toBe('*.example.com');
    expect(host.querySelector('[aria-labelledby="diagnostics-title"]')?.hasAttribute('inert')).toBe(
      true,
    );
  });
});

describe('popup ownership', () => {
  it('keeps desktop controls usable with interception off and reports rejected actions', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.enabled = false;
    vi.mocked(storage.loadSnapshot).mockResolvedValue(snapshot);
    vi.spyOn(api, 'checkConnection').mockResolvedValue(connected);
    const send = vi.mocked(fakeBrowser.runtime.sendMessage).mockResolvedValue({ ok: false });
    const host = mount(Popup);
    await settle();
    const pause = host.querySelector<HTMLButtonElement>('button[aria-label="Pause All"]')!;
    expect(pause).not.toBeNull();
    expect(pause.disabled).toBe(false);
    pause.click();
    pause.click();
    await settle();
    expect(
      send.mock.calls.filter(([request]: [{ type: string }]) => request.type === 'PAUSE_ALL'),
    ).toHaveLength(1);
    expect(host.textContent).toContain('Could not complete this action.');
    expect(host.textContent).toContain('Stopped');
  });
  it('does not attach listeners after the popup closes during initialization', async () => {
    let resolve!: (value: ReturnType<typeof createDefaultSnapshot>) => void;
    vi.mocked(storage.loadSnapshot).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const listen = vi.spyOn(fakeBrowser.storage.onChanged, 'addListener');
    mount(Popup);
    apps.pop()!.unmount();
    const count = listen.mock.calls.length;
    resolve(createDefaultSnapshot());
    await settle();
    expect(listen.mock.calls.length).toBe(count);
  });
});

describe('settings drafts', () => {
  it('persists custom colors as one preference change and restores the previous color on failure', async () => {
    const persist = vi
      .spyOn(storage, 'updateUiPrefs')
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('Storage unavailable'));
    const host = mount(Options);
    await settle();
    const picker = host.querySelector<HTMLButtonElement>('button[aria-label="Custom Color"]')!;
    picker.click();
    await settle();
    const hex = document.querySelector<HTMLInputElement>('.n-color-picker-input input')!;
    edit(hex, '#D75A35');
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(persist).toHaveBeenLastCalledWith({
      colorScheme: 'custom',
      customColorScheme: '#D75A35',
    });
    const accent = document.documentElement.style.getPropertyValue('--rb-accent');
    edit(hex, '#315AA0');
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(picker.textContent).toContain('#D75A35');
    expect(document.documentElement.style.getPropertyValue('--rb-accent')).toBe(accent);
  });

  it('retains a rejected site rule and does not submit while selecting an action with Enter', async () => {
    const add = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const host = mount(SiteRulesSection, { rules: [], addRule: add });
    const input = host.querySelector<HTMLInputElement>('input')!;
    edit(input, '*.example.com');
    await settle();
    host
      .querySelector('.n-select')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    await settle();
    expect(add).not.toHaveBeenCalled();
    button(host, DICTIONARIES.en!.options_add_rule!).click();
    await settle();
    expect(input.value).toBe('*.example.com');
    button(host, DICTIONARIES.en!.options_add_rule!).click();
    await settle();
    expect(input.value).toBe('');
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('retains the feedback region and acknowledges an identical retry result', async () => {
    const failure = {
      status: 'disconnected' as const,
      version: null,
      error: 'ApiUnreachableError',
    };
    let resolve!: (value: typeof failure) => void;
    const check = vi
      .spyOn(api, 'checkConnection')
      .mockResolvedValueOnce(failure)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    const host = mount(Options);
    await settle();
    button(host, 'Test Connection').click();
    await settle();
    const region = host.querySelector('.feedback');
    const result = host.querySelector('.feedback-result')!;
    expect(result.textContent).toContain(DICTIONARIES.en!.error_api_unreachable!);
    button(host, 'Test Connection').click();
    await settle();
    expect(check).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.feedback-result')).toBe(result);
    expect(host.querySelector('.feedback')?.getAttribute('aria-busy')).toBe('true');
    resolve(failure);
    await settle();
    expect(host.querySelector('.feedback')).toBe(region);
    const updated = host.querySelector('.feedback-result:not([aria-hidden])');
    expect(updated).not.toBe(result);
    expect(updated?.textContent).toContain(DICTIONARIES.en!.error_api_unreachable!);
    expect(host.querySelector('.feedback')?.getAttribute('aria-busy')).toBe('false');
  });

  it('ignores an obsolete connection-test result after the secret changes', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.checkConnection>>) => void;
    vi.spyOn(api, 'checkConnection').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const host = mount(Options);
    await settle();
    button(host, 'Test Connection').click();
    await settle();
    edit(host.querySelector<HTMLInputElement>('input[type="password"]')!, 'new-secret');
    await settle();
    resolve(connected);
    await settle();
    expect(host.textContent).not.toContain('Connected · Rayburst');
    expect(host.textContent).toContain('Unsaved changes');
  });
  it('retains the draft when saving fails, then permits a successful retry', async () => {
    const save = vi
      .spyOn(storage, 'saveConnectionConfig')
      .mockRejectedValueOnce(new Error('Disk unavailable'))
      .mockResolvedValue();
    vi.spyOn(storage, 'saveDiagnosticSettings').mockResolvedValue();
    vi.spyOn(storage, 'updateSettings').mockResolvedValue();
    const host = mount(Options);
    await settle();
    const secret = host.querySelector<HTMLInputElement>('input[type="password"]')!;
    edit(secret, 'keep-this-draft');
    await settle();
    button(host, 'Save').click();
    await settle();
    expect(secret.value).toBe('keep-this-draft');
    expect(button(host, 'Save').disabled).toBe(false);
    button(host, 'Save').click();
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ secret: 'keep-this-draft' }));
  });
});

describe('settings staging and permissions', () => {
  it('stages a backup without saving it and restores persisted settings on discard', async () => {
    const save = vi.spyOn(storage, 'saveSnapshot').mockResolvedValue();
    const host = mount(Options);
    await settle();
    button(host, 'Maintenance').click();
    await settle();
    const imported = createDefaultSnapshot();
    imported.connection.port = 29111;
    const file = new File(
      [JSON.stringify(createSettingsBackup(imported, { extensionVersion: '1.3.7' }))],
      'settings.json',
      { type: 'application/json' },
    );
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(save).not.toHaveBeenCalled();
    button(host, 'General').click();
    await settle();
    expect(
      host.querySelector<HTMLInputElement>('.options-page:not([inert]) .n-input-number input')
        ?.value,
    ).toBe('29111');
    expect(button(host, 'Discard').disabled).toBe(false);
    button(host, 'Discard').click();
    await settle();
    expect(storage.loadSnapshot).toHaveBeenCalledTimes(2);
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLInputElement>('.options-page:not([inert]) .n-input-number input')
          ?.value,
      ).toBe('29110'),
    );
    expect(
      host.querySelector<HTMLInputElement>('.options-page:not([inert]) .n-input-number input')
        ?.value,
    ).toBe('29110');
    expect(save).not.toHaveBeenCalled();
  });
  it('leaves cookie forwarding off when the browser denies permission', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.forwardCookies = false;
    vi.mocked(storage.loadSnapshot).mockResolvedValue(snapshot);
    const request = vi.spyOn(permissions, 'requestCookieForwardingAccess').mockResolvedValue(false);
    const host = mount(Options);
    await settle();
    button(host, 'Download').click();
    await settle();
    const toggle = host.querySelector<HTMLElement>(
      `[role="switch"][aria-label="${DICTIONARIES.en!.options_forward_cookies_label}"]`,
    )!;
    expect(toggle).not.toBeNull();
    toggle.click();
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });
  it('restores an immediate switch when storage rejects its change', async () => {
    vi.spyOn(storage, 'updateSettings').mockRejectedValue(new Error('Storage unavailable'));
    const host = mount(Options);
    await settle();
    button(host, 'Download').click();
    await settle();
    const toggle = host.querySelector<HTMLElement>(
      '[role="switch"][aria-label="Intercept downloads"]',
    )!;
    toggle.click();
    await settle();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
});

describe('media catalogue', () => {
  it('refreshes on tab reactivation and keeps source and locate actions separate', async () => {
    vi.mocked(fakeBrowser.tabs.query).mockResolvedValue([
      { id: 1, url: 'https://example.com/video' },
    ] as never);
    const candidate: MediaItem = { ...mediaCandidate(), hasRequestContext: false };
    const list = { host: 'example.com', enabled: true, excluded: false, items: [candidate] };
    const send = vi.spyOn(media, 'sendMediaCommand').mockResolvedValue(list);
    const props = reactive({ active: false });
    const host = mount(MediaPanel, props);
    await settle();
    expect(host.querySelector('.media-source')).not.toBeNull();
    expect(host.querySelector('.media-source button')).toBeNull();
    const count = send.mock.calls.length;
    props.active = true;
    await settle();
    expect(send.mock.calls.length).toBeGreaterThan(count);
    button(host, DICTIONARIES.en!.media_locate!).click();
    await settle();
    expect(send).toHaveBeenLastCalledWith(
      { type: 'MEDIA_LOCATE', tabId: 1, candidateId: candidate.id },
      false,
    );
  });
});

describe('media selection', () => {
  it('restores actual track IDs and blocks duplicate submission while busy', async () => {
    const probeId = crypto.randomUUID();
    const candidate = mediaCandidate();
    const item: MediaItem = {
      ...candidate,
      hasRequestContext: false,
      operation: {
        candidateId: candidate.id,
        createdAt: Date.now(),
        probeId,
        state: 'ready',
        probe: {
          id: probeId,
          expiresAt: Date.now() + 60000,
          state: 'ready',
          presentation: mediaPresentation(),
        },
      },
    };
    const submit = vi.fn();
    const props = reactive({
      item,
      busy: false,
      draft: { ...mediaSelection, videoId: 'video-720' },
      onSubmit: submit,
    });
    const host = mount(MediaSelection, props);
    await settle();
    const form = host.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: 'video-720', audioId: 'audio-en' }),
    );
    props.busy = true;
    await settle();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
