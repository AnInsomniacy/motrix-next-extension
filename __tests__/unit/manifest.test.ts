import { describe, expect, it } from 'vitest';
import { buildExtensionManifest } from '@/shared/manifest';

describe('buildExtensionManifest', () => {
  it('requires cookie forwarding permissions on Chromium', () => {
    const manifest = buildExtensionManifest('chromium');

    expect(manifest.permissions).toEqual([
      'downloads',
      'storage',
      'contextMenus',
      'notifications',
      'webRequest',
      'cookies',
    ]);
    expect(manifest.optional_permissions).toEqual(['downloads.ui']);
    expect(manifest.host_permissions).toEqual([
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://*/*',
      'http://*/*',
    ]);
    expect(manifest.optional_host_permissions).toEqual([]);
  });

  it('requires cookie forwarding permissions while preserving Firefox metadata', () => {
    const manifest = buildExtensionManifest('firefox');

    expect(manifest.permissions).toEqual([
      'downloads',
      'storage',
      'contextMenus',
      'notifications',
      'webRequest',
      'webRequestBlocking',
      'cookies',
    ]);
    expect(manifest.optional_permissions).toEqual([]);
    expect(manifest.host_permissions).toEqual([
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://*/*',
      'http://*/*',
    ]);
    expect(manifest.optional_host_permissions).toEqual([]);
    expect(manifest.browser_specific_settings?.gecko.id).toBe(
      'motrix-next-extension@aninsomniacy.dev',
    );
    expect(manifest.browser_specific_settings?.gecko.strict_min_version).toBe('140.0');
    expect(manifest.browser_specific_settings?.gecko.data_collection_permissions.required).toEqual([
      'none',
    ]);
    expect(manifest.browser_specific_settings?.gecko_android?.strict_min_version).toBe('142.0');
  });
});
