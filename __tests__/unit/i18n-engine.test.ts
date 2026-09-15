import { describe, expect, it } from 'vitest';
import { I18nEngine, createI18n } from '@/shared/i18n/engine';

describe('I18nEngine', () => {
  it('translates with locale and English fallback dictionaries', () => {
    const engine = new I18nEngine('zh_CN');

    expect(engine.t('popup_status_connected')).toBe('已连接');
    expect(engine.t('ext_name')).toBe('Motrix Next Extension');
  });

  it('uses fallback string before returning the raw missing key', () => {
    const engine = new I18nEngine('en');

    expect(engine.t('missing_key', 'Fallback')).toBe('Fallback');
    expect(engine.t('missing_key')).toBe('missing_key');
  });

  it('falls back to English for unsupported locales', () => {
    const engine = new I18nEngine('sw');

    expect(engine.t('popup_status_connected')).toBe('Connected');
  });

  it('replaces positional placeholders through the Vue context', () => {
    const ctx = createI18n('en');

    expect(ctx.tSub('options_diagnostics_pagination', ['1–10', '25', '100'])).toBe(
      '1–10 of 25 · max 100',
    );
    ctx.setLocale('zh_CN');
    expect(ctx.t('options_diagnostics_clear_confirm')).toBe('确认清除');
    expect(ctx.tSub('options_diagnostics_pagination', ['1–10', '25', '100'])).toBe(
      '1–10 / 25 · 最多 100 条',
    );
    expect(ctx.tSub('missing_key', ['A', 'B'], '$1 and $2')).toBe('A and B');
  });

  it('switches locale at runtime, falling back to English for unknown ids', () => {
    const engine = new I18nEngine('en');

    engine.setLocale('zh_CN');
    expect(engine.t('options_section_connection')).toBe('连接');

    engine.setLocale('unknown');
    expect(engine.t('options_section_connection')).toBe('Connection');
  });
});
