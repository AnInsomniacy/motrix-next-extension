import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_UI_PREFS,
  parseConnectionConfig,
  parseDiagnosticEvents,
  parseDownloadSettings,
  parseSiteRules,
  parseSnapshot,
  parseUiPrefs,
} from '@/lib/schema';

describe('persisted schema repair', () => {
  it('repairs invalid connection fields independently and strips extras', () => {
    expect(parseConnectionConfig(null)).toEqual(DEFAULT_CONNECTION_CONFIG);
    expect(parseConnectionConfig({ port: 9000, secret: 42, extra: true })).toEqual({
      port: 9000,
      secret: '',
    });
    expect(parseConnectionConfig({ port: 1, secret: 'kept' })).toEqual({
      port: DEFAULT_CONNECTION_CONFIG.port,
      secret: 'kept',
    });
  });

  it('defaults settings while preserving valid siblings of corrupt fields', () => {
    expect(parseDownloadSettings(undefined)).toEqual(DEFAULT_DOWNLOAD_SETTINGS);
    const repaired = parseDownloadSettings({
      enabled: false,
      forwardCookies: 'invalid',
      desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 999 },
      interceptionScope: { magnet: false },
    });
    expect(repaired).toMatchObject({
      enabled: false,
      forwardCookies: true,
      desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
      interceptionScope: { browserDownloads: true, magnet: false, ed2k: true, thunder: true },
    });
  });

  it('normalizes persisted extension rules', () => {
    expect(
      parseDownloadSettings({
        fileExtensionRule: {
          enabled: true,
          extensions: [' .JPG ', 'tar.gz', 'jpg', 'bad/path'],
          listedAction: 'skip',
          unknownAction: 'intercept',
        },
      }).fileExtensionRule.extensions,
    ).toEqual(['jpg', 'tar.gz']);
  });

  it('keeps only structurally valid site rules', () => {
    expect(
      parseSiteRules([
        { id: 'valid', pattern: '*.example.com', action: 'always-skip', extra: true },
        { id: 'bad-action', pattern: '*', action: 'block' },
        { pattern: '*', action: 'always-skip' },
      ]),
    ).toEqual([{ id: 'valid', pattern: '*.example.com', action: 'always-skip' }]);
    expect(parseSiteRules('invalid')).toEqual([]);
  });

  it('repairs UI preferences without discarding valid values', () => {
    expect(parseUiPrefs(null)).toEqual(DEFAULT_UI_PREFS);
    expect(parseUiPrefs({ theme: 'dark', colorScheme: 1, locale: 'zh_CN' })).toEqual({
      theme: 'dark',
      colorScheme: 'amber',
      locale: 'zh_CN',
    });
  });

  it('builds a complete settings snapshot from partial or corrupt storage', () => {
    expect(parseSnapshot(null)).toEqual({
      connection: DEFAULT_CONNECTION_CONFIG,
      settings: DEFAULT_DOWNLOAD_SETTINGS,
      siteRules: [],
      uiPrefs: DEFAULT_UI_PREFS,
    });
    expect(
      parseSnapshot({ connection: { port: 9000 }, settings: { enabled: false }, unknown: true }),
    ).toMatchObject({ connection: { port: 9000, secret: '' }, settings: { enabled: false } });
  });

  it('drops obsolete and oversized diagnostic events', () => {
    expect(
      parseDiagnosticEvents([
        { id: 'old', ts: 1, level: 'info', code: 'config_loaded', message: 'Old event' },
        {
          id: 'large',
          ts: 2,
          level: 'error',
          code: 'desktop_activation_failed',
          message: 'x'.repeat(241),
        },
      ]),
    ).toEqual([]);
  });
});
