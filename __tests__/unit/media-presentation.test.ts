import { describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n/engine';
import {
  mediaDuration,
  mediaFailureKey,
  mediaSize,
  mediaTrackLabel,
} from '@/lib/media/presentation';
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales';

describe('localized media presentation', () => {
  it('formats sizes, durations and track languages using the selected locale', () => {
    expect(mediaSize(1536, 'de', '')).toBe('1,5 KB');
    expect(mediaDuration(2000, 'zh_CN')).toContain('秒');
    expect(
      mediaTrackLabel(
        {
          id: 'audio',
          type: 'audio',
          language: 'ja',
          codec: '',
          width: 0,
          height: 0,
          bandwidth: 0,
          frameRate: 0,
        },
        'zh_CN',
        '',
      ),
    ).toContain('日语');
  });
  it('distinguishes API authentication, source login and media protection', () => {
    const keys = ['api_auth_failed', 'authentication_required', 'protected_media'].map(
      mediaFailureKey,
    );
    expect(new Set(keys).size).toBe(3);
  });
  it('translates failure codes in every locale and never presents raw exception text', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const i18n = createI18n(locale.id);
      for (const code of [
        'unreachable',
        'integration_unavailable',
        'protected_media',
        'api_auth_failed',
        'authentication_required',
        'source_expired',
        'player_not_found',
        'Bearer private',
      ]) {
        const key = mediaFailureKey(code);
        expect(i18n.t(key)).not.toBe(key);
        expect(i18n.t(key)).not.toContain('Bearer private');
      }
    }
  });
});
