import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  CHROME_EXTENSION_ID,
  CHROME_EXTENSION_PUBLIC_KEY,
  buildExtensionManifest,
} from '@/shared/manifest';

function extensionIdFromPublicKey(publicKey: string): string {
  const digest = createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex');
  return digest
    .slice(0, 32)
    .split('')
    .map((digit) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16)))
    .join('');
}

describe('buildExtensionManifest', () => {
  it('uses a single background writer and a private-browsing mode supported by both browsers', () => {
    for (const browser of ['chromium', 'firefox']) {
      expect(buildExtensionManifest(browser).incognito).toBe('spanning');
    }
  });
  it('requires Native Messaging on Chromium', () => {
    const manifest = buildExtensionManifest('chromium');

    expect(manifest.permissions).toContain('nativeMessaging');
    expect(manifest.permissions).not.toContain('webRequestBlocking');
  });

  it('pins unpacked Chromium builds to the native host identity', () => {
    const manifest = buildExtensionManifest('chrome');

    expect(manifest.key).toBe(CHROME_EXTENSION_PUBLIC_KEY);
    expect(extensionIdFromPublicKey(CHROME_EXTENSION_PUBLIC_KEY)).toBe(CHROME_EXTENSION_ID);
  });

  it('requires Native Messaging and response blocking on Firefox', () => {
    const manifest = buildExtensionManifest('firefox');

    expect(manifest.permissions).toContain('nativeMessaging');
    expect(manifest.permissions).toContain('webRequestBlocking');
    expect(manifest.key).toBeUndefined();
  });
});
