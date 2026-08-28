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
  it('requires Native Messaging on Chromium', () => {
    const manifest = buildExtensionManifest('chromium', 'production');

    expect(manifest.permissions).toContain('nativeMessaging');
    expect(manifest.permissions).not.toContain('webRequestBlocking');
  });

  it('pins Chromium development builds to the Chrome Web Store identity', () => {
    const manifest = buildExtensionManifest('chrome', 'development');

    expect(manifest.key).toBe(CHROME_EXTENSION_PUBLIC_KEY);
    expect(extensionIdFromPublicKey(CHROME_EXTENSION_PUBLIC_KEY)).toBe(CHROME_EXTENSION_ID);
  });

  it('leaves store identities to Chromium production packages', () => {
    expect(buildExtensionManifest('chrome', 'production').key).toBeUndefined();
    expect(buildExtensionManifest('edge', 'production').key).toBeUndefined();
  });

  it('requires Native Messaging and response blocking on Firefox', () => {
    const manifest = buildExtensionManifest('firefox', 'development');

    expect(manifest.permissions).toContain('nativeMessaging');
    expect(manifest.permissions).toContain('webRequestBlocking');
    expect(manifest.key).toBeUndefined();
  });
});
