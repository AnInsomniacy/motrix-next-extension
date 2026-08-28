import { describe, expect, it } from 'vitest';
import { buildExtensionManifest } from '@/shared/manifest';

describe('buildExtensionManifest', () => {
  it('requires Native Messaging on Chromium', () => {
    const manifest = buildExtensionManifest('chromium');

    expect(manifest.permissions).toContain('nativeMessaging');
    expect(manifest.permissions).not.toContain('webRequestBlocking');
  });

  it('requires Native Messaging and response blocking on Firefox', () => {
    const manifest = buildExtensionManifest('firefox');

    expect(manifest.permissions).toContain('nativeMessaging');
    expect(manifest.permissions).toContain('webRequestBlocking');
  });
});
