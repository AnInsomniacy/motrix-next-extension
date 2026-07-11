import { describe, it, expect } from 'vitest';
import {
  parseConnectionConfig,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
  parseStorage,
} from '@/lib/storage/schema';

// ─── ConnectionConfig Schema ────────────────────────────

describe('parseConnectionConfig', () => {
  it('returns valid config unchanged', () => {
    const input = { port: 9999, secret: 'mysecret' };
    const result = parseConnectionConfig(input);
    expect(result).toEqual(input);
  });

  it('fills missing fields with defaults', () => {
    const result = parseConnectionConfig({});
    expect(result).toEqual({ port: 29110, secret: '' });
  });

  it('fills undefined input with defaults', () => {
    const result = parseConnectionConfig(undefined);
    expect(result).toEqual({ port: 29110, secret: '' });
  });

  it('replaces invalid port type with default', () => {
    const result = parseConnectionConfig({ port: 'not-a-number' });
    expect(result.port).toBe(29110);
  });

  it('clamps port below minimum to default', () => {
    const result = parseConnectionConfig({ port: -1 });
    expect(result.port).toBe(29110);
  });

  it('clamps port above maximum to default', () => {
    const result = parseConnectionConfig({ port: 99999 });
    expect(result.port).toBe(29110);
  });

  it('replaces invalid secret type with default', () => {
    const result = parseConnectionConfig({ secret: 123 });
    expect(result.secret).toBe('');
  });

  it('strips extra fields', () => {
    const result = parseConnectionConfig({
      port: 29110,
      secret: '',
      extra: true,
    });
    expect(result).not.toHaveProperty('extra');
  });
});

// ─── DownloadSettings Schema ────────────────────────────

describe('parseDownloadSettings', () => {
  it('returns valid settings unchanged', () => {
    const input = {
      enabled: false,
      hideDownloadBar: true,
      desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: false,
      forwardCookies: true,
      duplicateGuard: {
        enabled: false,
        windowSeconds: 25,
      },
      minimumFileSize: {
        enabled: true,
        sizeMb: 5,
        unknownSizeAction: 'skip',
      },
      fileExtensionRule: {
        enabled: true,
        extensions: ['jpg', 'tar.gz'],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: false,
        magnet: true,
        ed2k: false,
        thunder: true,
      },
    };
    const result = parseDownloadSettings(input);
    expect(result).toEqual(input);
  });

  it('fills missing fields with defaults', () => {
    const result = parseDownloadSettings({});
    expect(result).toEqual({
      enabled: true,
      hideDownloadBar: false,
      desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: false,
        sizeMb: 5,
        unknownSizeAction: 'intercept',
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    });
  });

  it('fills undefined input with defaults', () => {
    const result = parseDownloadSettings(undefined);
    expect(result).toEqual({
      enabled: true,
      hideDownloadBar: false,
      desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: false,
        sizeMb: 5,
        unknownSizeAction: 'intercept',
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    });
  });

  it('replaces invalid boolean with default', () => {
    const result = parseDownloadSettings({ enabled: 'yes' });
    expect(result.enabled).toBe(true);
  });

  it('strips extra fields', () => {
    const result = parseDownloadSettings({ enabled: true, unknown: 42 });
    expect(result).not.toHaveProperty('unknown');
  });

  it('accepts a one-second desktop startup timeout', () => {
    const result = parseDownloadSettings({
      desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 1 },
    });

    expect(result.desktopUnavailable.startupTimeoutSeconds).toBe(1);
  });

  it('preserves valid sibling fields when one setting is corrupt', () => {
    const result = parseDownloadSettings({
      enabled: false,
      hideDownloadBar: true,
      desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: false,
      forwardCookies: true,
      unknown: 42,
    });

    expect(result).toEqual({
      enabled: false,
      hideDownloadBar: true,
      desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: false,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: false,
        sizeMb: 5,
        unknownSizeAction: 'intercept',
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    });
    expect(result).not.toHaveProperty('unknown');
  });

  it('normalizes file extension rule values', () => {
    const result = parseDownloadSettings({
      fileExtensionRule: {
        enabled: true,
        extensions: ['.JPG', ' tar.gz ', '../bad', 'jpg'],
        listedAction: 'intercept',
        unknownAction: 'skip',
      },
    });

    expect(result.fileExtensionRule).toEqual({
      enabled: true,
      extensions: ['jpg', 'tar.gz'],
      listedAction: 'intercept',
      unknownAction: 'skip',
    });
  });
});

// ─── SiteRules Schema ───────────────────────────────────

describe('parseSiteRules', () => {
  it('returns valid rules unchanged', () => {
    const input = [
      { id: 'rule-1', pattern: '*.github.com', action: 'always-intercept' as const },
      { id: 'rule-2', pattern: 'example.com', action: 'always-skip' as const },
    ];
    const result = parseSiteRules(input);
    expect(result).toEqual(input);
  });

  it('returns empty array for undefined input', () => {
    const result = parseSiteRules(undefined);
    expect(result).toEqual([]);
  });

  it('returns empty array for non-array input', () => {
    const result = parseSiteRules('not-an-array');
    expect(result).toEqual([]);
  });

  it('filters out rules with invalid action', () => {
    const input = [
      { id: 'rule-1', pattern: '*.github.com', action: 'always-intercept' },
      { id: 'rule-2', pattern: 'bad.com', action: 'INVALID' },
    ];
    const result = parseSiteRules(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.pattern).toBe('*.github.com');
  });

  it('filters out rules missing required fields', () => {
    const input = [
      { id: 'rule-1', pattern: '*.github.com', action: 'always-intercept' },
      { pattern: 'no-id.com', action: 'always-skip' }, // missing id
      { id: 'rule-3', action: 'always-skip' }, // missing pattern
    ];
    const result = parseSiteRules(input);
    expect(result).toHaveLength(1);
  });

  it('strips extra fields from individual rules', () => {
    const input = [{ id: 'r1', pattern: 'x.com', action: 'use-global', extra: true }];
    const result = parseSiteRules(input);
    expect(result[0]).not.toHaveProperty('extra');
  });
});

// ─── UiPrefs Schema ─────────────────────────────────────

describe('parseUiPrefs', () => {
  it('returns valid prefs unchanged', () => {
    const input = { theme: 'dark' as const, colorScheme: 'space', locale: 'zh_CN' };
    const result = parseUiPrefs(input);
    expect(result).toEqual(input);
  });

  it('fills missing fields with defaults', () => {
    const result = parseUiPrefs({});
    expect(result).toEqual({ theme: 'system', colorScheme: 'amber', locale: 'auto' });
  });

  it('fills undefined input with defaults', () => {
    const result = parseUiPrefs(undefined);
    expect(result).toEqual({ theme: 'system', colorScheme: 'amber', locale: 'auto' });
  });

  it('preserves valid locale values', () => {
    expect(parseUiPrefs({ locale: 'en' }).locale).toBe('en');
    expect(parseUiPrefs({ locale: 'zh_CN' }).locale).toBe('zh_CN');
    expect(parseUiPrefs({ locale: 'auto' }).locale).toBe('auto');
  });

  it('defaults locale when missing', () => {
    const result = parseUiPrefs({ theme: 'dark' });
    expect(result.locale).toBe('auto');
  });

  it('replaces invalid theme with default', () => {
    const result = parseUiPrefs({ theme: 'invalid-theme' });
    expect(result.theme).toBe('system');
  });

  it('accepts all valid theme values', () => {
    expect(parseUiPrefs({ theme: 'system' }).theme).toBe('system');
    expect(parseUiPrefs({ theme: 'light' }).theme).toBe('light');
    expect(parseUiPrefs({ theme: 'dark' }).theme).toBe('dark');
  });

  it('preserves valid sibling fields when one preference is corrupt', () => {
    const result = parseUiPrefs({
      theme: 'invalid-theme',
      colorScheme: 'space',
      locale: 'zh_CN',
      unknown: true,
    });

    expect(result).toEqual({ theme: 'system', colorScheme: 'space', locale: 'zh_CN' });
    expect(result).not.toHaveProperty('unknown');
  });
});

// ─── Full Storage Schema ────────────────────────────────

describe('parseStorage', () => {
  it('returns fully defaulted storage for empty object', () => {
    const result = parseStorage({});
    expect(result.connection).toEqual({ port: 29110, secret: '' });
    expect(result.settings).toEqual({
      enabled: true,
      hideDownloadBar: false,
      desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: false,
        sizeMb: 5,
        unknownSizeAction: 'intercept',
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    });
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs).toEqual({ theme: 'system', colorScheme: 'amber', locale: 'auto' });
    expect(result.diagnosticLog).toEqual([]);
  });

  it('returns fully defaulted storage for null input', () => {
    const result = parseStorage(null);
    expect(result.connection.port).toBe(29110);
    expect(result.settings.enabled).toBe(true);
  });

  it('correctly parses a partial storage object', () => {
    const result = parseStorage({
      connection: { port: 9000 },
      settings: { enabled: false },
    });
    expect(result.connection.port).toBe(9000);
    expect(result.connection.secret).toBe(''); // defaulted
    expect(result.settings.enabled).toBe(false);
    expect(result.settings).toEqual({
      enabled: false,
      hideDownloadBar: false,
      desktopUnavailable: { action: 'launch', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: true,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: false,
        sizeMb: 5,
        unknownSizeAction: 'intercept',
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: true,
        magnet: true,
        ed2k: true,
        thunder: true,
      },
    });
  });

  it('strips unknown fields without discarding valid stored values', () => {
    const result = parseStorage({
      connection: { port: 16802, secret: 'token', extra: true },
      settings: {
        enabled: false,
        hideDownloadBar: true,
        desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
        forwardRequestHeaders: false,
        forwardCookies: true,
        interceptionScope: {
          browserDownloads: false,
          magnet: false,
          ed2k: true,
          thunder: false,
        },
        extra: 'ignored',
      },
      uiPrefs: { theme: 'dark', colorScheme: 'mint', locale: 'en', extra: true },
    });

    expect(result.connection).toEqual({ port: 16802, secret: 'token' });
    expect(result.settings).toEqual({
      enabled: false,
      hideDownloadBar: true,
      desktopUnavailable: { action: 'browser', startupTimeoutSeconds: 15 },
      forwardRequestHeaders: false,
      forwardCookies: true,
      duplicateGuard: {
        enabled: true,
        windowSeconds: 10,
      },
      minimumFileSize: {
        enabled: false,
        sizeMb: 5,
        unknownSizeAction: 'intercept',
      },
      fileExtensionRule: {
        enabled: false,
        extensions: [],
        listedAction: 'skip',
        unknownAction: 'intercept',
      },
      interceptionScope: {
        browserDownloads: false,
        magnet: false,
        ed2k: true,
        thunder: false,
      },
    });
    expect(result.uiPrefs).toEqual({ theme: 'dark', colorScheme: 'mint', locale: 'en' });
  });

  it('survives completely corrupt data gracefully', () => {
    const result = parseStorage({
      connection: 'garbage',
      settings: 12345,
      siteRules: 'not-an-array',
      uiPrefs: null,
      diagnosticLog: false,
    });
    // All fields should be defaults — not throw
    expect(result.connection).toEqual({ port: 29110, secret: '' });
    expect(result.settings.enabled).toBe(true);
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs.theme).toBe('system');
    expect(result.diagnosticLog).toEqual([]);
  });
});
