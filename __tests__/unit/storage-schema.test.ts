import { describe, it, expect } from 'vitest';
import {
  parseConnectionConfig,
  parseDownloadSettings,
  parseSiteRules,
  parseUiPrefs,
  parseDiagnosticEvents,
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
    expect(result).toEqual({ port: 16801, secret: '' });
  });

  it('fills undefined input with defaults', () => {
    const result = parseConnectionConfig(undefined);
    expect(result).toEqual({ port: 16801, secret: '' });
  });

  it('replaces invalid port type with default', () => {
    const result = parseConnectionConfig({ port: 'not-a-number' });
    expect(result.port).toBe(16801);
  });

  it('clamps port below minimum to default', () => {
    const result = parseConnectionConfig({ port: -1 });
    expect(result.port).toBe(16801);
  });

  it('clamps port above maximum to default', () => {
    const result = parseConnectionConfig({ port: 99999 });
    expect(result.port).toBe(16801);
  });

  it('replaces invalid secret type with default', () => {
    const result = parseConnectionConfig({ secret: 123 });
    expect(result.secret).toBe('');
  });

  it('strips extra fields', () => {
    const result = parseConnectionConfig({
      port: 16801,
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
      minFileSize: 10,
      fallbackToBrowser: false,
      hideDownloadBar: true,
      notifyOnStart: false,
      notifyOnComplete: true,
      autoLaunchApp: false,
    };
    const result = parseDownloadSettings(input);
    expect(result).toEqual(input);
  });

  it('fills missing fields with defaults', () => {
    const result = parseDownloadSettings({});
    expect(result).toEqual({
      enabled: true,
      minFileSize: 0,
      fallbackToBrowser: true,
      hideDownloadBar: false,
      notifyOnStart: true,
      notifyOnComplete: false,
      autoLaunchApp: true,
    });
  });

  it('fills undefined input with defaults', () => {
    const result = parseDownloadSettings(undefined);
    expect(result).toEqual({
      enabled: true,
      minFileSize: 0,
      fallbackToBrowser: true,
      hideDownloadBar: false,
      notifyOnStart: true,
      notifyOnComplete: false,
      autoLaunchApp: true,
    });
  });

  it('replaces invalid boolean with default', () => {
    const result = parseDownloadSettings({ enabled: 'yes' });
    expect(result.enabled).toBe(true);
  });

  it('replaces negative minFileSize with default', () => {
    const result = parseDownloadSettings({ minFileSize: -5 });
    expect(result.minFileSize).toBe(0);
  });

  it('strips extra fields', () => {
    const result = parseDownloadSettings({ enabled: true, unknown: 42 });
    expect(result).not.toHaveProperty('unknown');
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
});

// ─── DiagnosticEvents Schema ────────────────────────────

describe('parseDiagnosticEvents', () => {
  it('returns valid events unchanged', () => {
    const input = [
      {
        id: 'evt-1',
        ts: 1700000000000,
        level: 'info' as const,
        code: 'download_sent' as const,
        message: 'Test message',
      },
    ];
    const result = parseDiagnosticEvents(input);
    expect(result).toEqual(input);
  });

  it('returns empty array for undefined input', () => {
    const result = parseDiagnosticEvents(undefined);
    expect(result).toEqual([]);
  });

  it('returns empty array for non-array input', () => {
    const result = parseDiagnosticEvents(42);
    expect(result).toEqual([]);
  });

  it('preserves optional context field', () => {
    const input = [
      {
        id: 'evt-1',
        ts: 1700000000000,
        level: 'error' as const,
        code: 'download_failed' as const,
        message: 'Failed',
        context: { url: 'https://example.com', retries: 3 },
      },
    ];
    const result = parseDiagnosticEvents(input);
    expect(result[0]!.context).toEqual({ url: 'https://example.com', retries: 3 });
  });

  it('filters out events with invalid level', () => {
    const input = [
      { id: 'e1', ts: 1, level: 'info', code: 'download_sent', message: 'ok' },
      { id: 'e2', ts: 2, level: 'CRITICAL', code: 'download_sent', message: 'bad level' },
    ];
    const result = parseDiagnosticEvents(input);
    expect(result).toHaveLength(1);
  });

  it('filters out events with unknown diagnostic code', () => {
    const input = [
      { id: 'e1', ts: 1, level: 'info', code: 'download_sent', message: 'ok' },
      { id: 'e2', ts: 2, level: 'info', code: 'totally_made_up', message: 'bad code' },
    ];
    const result = parseDiagnosticEvents(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe('download_sent');
  });

  it.each([
    'api_connected',
    'api_unreachable',
    'api_auth_failed',
    'download_intercepted',
    'download_sent',
    'download_skipped',
    'download_fallback',
    'download_failed',
    'download_wake_attempt',
    'download_routed',
    'download_browser_redirect',
    'cookie_permission_missing',
    'cookie_collect_failed',
    'permission_granted',
    'permission_revoked',
  ] as const)('accepts diagnostic code: %s', (code) => {
    const input = [{ id: 'e1', ts: 1, level: 'info', code, message: 'test' }];
    const result = parseDiagnosticEvents(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe(code);
  });
});

// ─── Full Storage Schema ────────────────────────────────

describe('parseStorage', () => {
  it('returns fully defaulted storage for empty object', () => {
    const result = parseStorage({});
    expect(result.connection).toEqual({ port: 16801, secret: '' });
    expect(result.settings).toEqual({
      enabled: true,
      minFileSize: 0,
      fallbackToBrowser: true,
      hideDownloadBar: false,
      notifyOnStart: true,
      notifyOnComplete: false,
      autoLaunchApp: true,
    });
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs).toEqual({ theme: 'system', colorScheme: 'amber', locale: 'auto' });
    expect(result.diagnosticLog).toEqual([]);
  });

  it('returns fully defaulted storage for null input', () => {
    const result = parseStorage(null);
    expect(result.connection.port).toBe(16801);
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
    expect(result.settings.minFileSize).toBe(0); // defaulted
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
    expect(result.connection).toEqual({ port: 16801, secret: '' });
    expect(result.settings.enabled).toBe(true);
    expect(result.siteRules).toEqual([]);
    expect(result.uiPrefs.theme).toBe('system');
    expect(result.diagnosticLog).toEqual([]);
  });

  it('preserves _version field', () => {
    const result = parseStorage({ _version: 1 });
    expect(result._version).toBe(1);
  });

  it('defaults _version to 0 when missing', () => {
    const result = parseStorage({});
    expect(result._version).toBe(0);
  });
});
