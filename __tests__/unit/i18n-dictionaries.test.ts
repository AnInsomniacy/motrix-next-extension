import { describe, it, expect } from 'vitest';

// ─── flatten() ──────────────────────────────────────────

describe('flatten', () => {
  // We test the internal flatten via the public DICTIONARIES export.
  // If flatten is not exported, these tests exercise it indirectly.

  it('extracts message strings from Chrome i18n format', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    expect(DICTIONARIES.en!['popup_status_connected']).toBe('Connected');
    expect(DICTIONARIES.zh_CN!['popup_status_connected']).toBe('已连接');
  });

  it('pre-compiles named placeholders to positional format', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    // "↓ $speed$" with placeholders { speed: { content: "$1" } } → "↓ $1"
    expect(DICTIONARIES.en!['popup_speed_download']).toBe('↓ $1');
    expect(DICTIONARIES.en!['popup_speed_upload']).toBe('↑ $1');
  });

  it('pre-compiles named placeholders for all supported locales', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    // zh_CN: "↓ $speed$" → "↓ $1"
    expect(DICTIONARIES.zh_CN!['popup_speed_download']).toBe('↓ $1');
  });

  it('preserves messages that already use positional placeholders', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    // "Check your network or firewall settings. RPC port: $1"
    // placeholders: { "1": { content: "$1" } } — $1$ → $1 (identity)
    const msg = DICTIONARIES.en!['popup_error_timeout_hint'];
    expect(msg).toContain('$1');
    expect(msg).not.toContain('$1$');
  });

  it('flattens all keys from en messages.json', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    const enDict = DICTIONARIES.en!;
    // Verify key count matches source
    expect(Object.keys(enDict).length).toBeGreaterThanOrEqual(76);
    // Spot-check a few keys across different sections
    expect(enDict['ext_name']).toBe('Motrix Next Extension');
    expect(enDict['options_section_connection']).toBe('Connection');
    expect(enDict['context_menu_download']).toBe('Download with Motrix Next');
  });

  it('produces string values only (no nested objects)', async () => {
    const { DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    for (const value of Object.values(DICTIONARIES.en!)) {
      expect(typeof value).toBe('string');
    }
  });
});

// ─── SUPPORTED_LOCALES ──────────────────────────────────

describe('SUPPORTED_LOCALES', () => {
  it('contains at least en and zh_CN', async () => {
    const { SUPPORTED_LOCALES } = await import('@/shared/i18n/dictionaries');
    const ids = SUPPORTED_LOCALES.map((l) => l.id);
    expect(ids).toContain('en');
    expect(ids).toContain('ja');
    expect(ids).toContain('zh_CN');
  });

  it('has endonym and exonym for each locale', async () => {
    const { SUPPORTED_LOCALES } = await import('@/shared/i18n/dictionaries');
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.endonym).toBeTruthy();
      expect(locale.exonym).toBeTruthy();
      expect(locale.id).toBeTruthy();
    }
  });

  it('has matching DICTIONARIES entry for each supported locale', async () => {
    const { SUPPORTED_LOCALES, DICTIONARIES } = await import('@/shared/i18n/dictionaries');
    for (const locale of SUPPORTED_LOCALES) {
      expect(DICTIONARIES[locale.id]).toBeDefined();
    }
  });
});

// ─── FALLBACK_LOCALE ────────────────────────────────────

describe('FALLBACK_LOCALE', () => {
  it('is set to en', async () => {
    const { FALLBACK_LOCALE } = await import('@/shared/i18n/dictionaries');
    expect(FALLBACK_LOCALE).toBe('en');
  });
});

// ─── resolveLocaleId() ──────────────────────────────────

describe('resolveLocaleId', () => {
  it('resolves exact match', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('en')).toBe('en');
    expect(resolveLocaleId('zh_CN')).toBe('zh_CN');
  });

  it('normalizes hyphen to underscore for BCP 47 tags', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('zh-CN')).toBe('zh_CN');
  });

  it('matches base language when exact match fails', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    // zh-TW should map to zh_CN (closest Chinese variant)
    expect(resolveLocaleId('zh-TW')).toBe('zh_CN');
    expect(resolveLocaleId('zh')).toBe('zh_CN');
  });

  it('falls back to en for unsupported locales', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('fr')).toBe('en');
    expect(resolveLocaleId('de-DE')).toBe('en');
    expect(resolveLocaleId('ko')).toBe('en');
  });

  it('resolves ja as a supported locale', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('ja')).toBe('ja');
    expect(resolveLocaleId('ja-JP')).toBe('ja');
  });

  it('handles empty string gracefully', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('')).toBe('en');
  });

  it('is case-insensitive for base language matching', async () => {
    const { resolveLocaleId } = await import('@/shared/i18n/dictionaries');
    expect(resolveLocaleId('EN')).toBe('en');
    expect(resolveLocaleId('ZH-cn')).toBe('zh_CN');
  });
});
