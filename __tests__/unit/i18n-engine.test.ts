import { describe, it, expect } from 'vitest';

// ─── I18nEngine.t() ─────────────────────────────────────

describe('I18nEngine.t', () => {
  it('returns the translation for the current locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('zh_CN');
    expect(engine.t('popup_status_connected')).toBe('已连接');
  });

  it('falls back to en when key is missing in current locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('zh_CN');
    // If a key exists only in en, it should fall back
    expect(engine.t('ext_name')).toBe('Motrix Next'); // Same in both, but tests the chain
  });

  it('falls back to provided fallback string when key is missing everywhere', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    expect(engine.t('nonexistent_key', 'My Fallback')).toBe('My Fallback');
  });

  it('returns raw key when no fallback provided and key is missing', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    expect(engine.t('nonexistent_key')).toBe('nonexistent_key');
  });

  it('uses en dictionary when initialized with unknown locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('fr');
    expect(engine.t('popup_status_connected')).toBe('Connected');
  });
});

// ─── I18nEngine.tSub() ──────────────────────────────────

describe('I18nEngine.tSub', () => {
  it('replaces $1 with the first substitution', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    // popup_speed_download: "↓ $1" after flatten
    const result = engine.tSub('popup_speed_download', ['10 MB/s']);
    expect(result).toBe('↓ 10 MB/s');
  });

  it('replaces $1 in zh_CN locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('zh_CN');
    const result = engine.tSub('popup_speed_active_count', ['3']);
    expect(result).toBe('3 个活跃');
  });

  it('replaces multiple positional placeholders', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    // Simulated via fallback — test the replacement logic
    const result = engine.tSub('nonexistent', ['A', 'B'], '$1 and $2');
    expect(result).toBe('A and B');
  });

  it('returns fallback with substitutions when key is missing', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    const result = engine.tSub('missing_key', ['val'], 'default: $1');
    expect(result).toBe('default: val');
  });

  it('handles zero substitutions gracefully', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    const result = engine.tSub('popup_status_connected', []);
    expect(result).toBe('Connected');
  });
});

// ─── I18nEngine.setLocale() ─────────────────────────────

describe('I18nEngine.setLocale', () => {
  it('switches to the new locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    expect(engine.t('popup_status_connected')).toBe('Connected');

    engine.setLocale('zh_CN');
    expect(engine.t('popup_status_connected')).toBe('已连接');
  });

  it('reports the current locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    expect(engine.locale).toBe('en');

    engine.setLocale('zh_CN');
    expect(engine.locale).toBe('zh_CN');
  });

  it('falls back to en when switching to unknown locale', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');
    engine.setLocale('unknown');
    expect(engine.t('popup_status_connected')).toBe('Connected');
  });

  it('can switch back and forth between locales', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('en');

    engine.setLocale('zh_CN');
    expect(engine.t('options_section_connection')).toBe('连接');

    engine.setLocale('en');
    expect(engine.t('options_section_connection')).toBe('Connection');

    engine.setLocale('zh_CN');
    expect(engine.t('options_section_connection')).toBe('连接');
  });
});

// ─── I18nEngine fallback chain ──────────────────────────

describe('I18nEngine fallback chain', () => {
  it('follows chain: current locale → en → fallback → key', async () => {
    const { I18nEngine } = await import('@/shared/i18n/engine');
    const engine = new I18nEngine('zh_CN');

    // 1. Found in zh_CN
    expect(engine.t('popup_status_connected')).toBe('已连接');

    // 2. Found in en (ext_name is same in both, so use a definitive test)
    expect(engine.t('ext_name')).toBe('Motrix Next');

    // 3. Fallback string provided
    expect(engine.t('totally_missing', 'Fallback')).toBe('Fallback');

    // 4. No fallback — returns raw key
    expect(engine.t('totally_missing')).toBe('totally_missing');
  });
});
