import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';

// Ensure persistent browser profile directories exist before chrome-launcher
// attempts to write chrome-out.log. mkdirSync is idempotent with recursive.
const CHROMIUM_PROFILE = resolve('.wxt/chrome-data');
const FIREFOX_PROFILE = resolve('.wxt/firefox-data');
mkdirSync(CHROMIUM_PROFILE, { recursive: true });
mkdirSync(FIREFOX_PROFILE, { recursive: true });

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  zip: {
    artifactTemplate: '{{name}}-{{version}}-chromium-mv3.zip',
  },
  webExt: {
    // Reuse a persistent browser profile across dev restarts so that
    // chrome.storage.local data (RPC secret, theme, etc.) is preserved.
    // Works for both Chromium (Chrome/Edge) and Firefox.
    chromiumProfile: CHROMIUM_PROFILE,
    firefoxProfile: FIREFOX_PROFILE,
    keepProfileChanges: true,
  },
  manifest: ({ browser }) => ({
    name: '__MSG_ext_name__',
    description: '__MSG_ext_description__',
    default_locale: 'en',
    permissions:
      browser === 'firefox'
        ? ['downloads', 'storage', 'contextMenus', 'notifications', 'cookies']
        : ['downloads', 'storage', 'contextMenus', 'notifications', 'cookies', 'downloads.ui'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*', 'http://*/*'],
    // Firefox AMO requires gecko.id for signing and data_collection_permissions
    // for privacy disclosure. Chrome ignores this key entirely.
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'motrix-next-extension@aninsomniacy.dev',
          strict_min_version: '128.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    }),
  }),
  vite: () => ({
    plugins: [
      tailwindcss(),
      Components({
        resolvers: [NaiveUiResolver()],
        dirs: ['entrypoints/**/components'],
        dts: false,
      }),
      // Serve public/_locales/*.json as virtual modules so dictionaries.ts
      // can import them without hitting Vite's "no import from public/" guard.
      // public/_locales/ remains the SSOT — no duplication, no build scripts.
      {
        name: 'locale-virtual-import',
        enforce: 'pre' as const,
        resolveId(source: string) {
          const m = source.match(/^locale:(\w+)$/);
          if (m) return `\0locale:${m[1]}`;
        },
        load(id: string) {
          const m = id.match(/^\0locale:(\w+)$/);
          if (!m) return;
          const filePath = resolve(`public/_locales/${m[1]}/messages.json`);
          const json = readFileSync(filePath, 'utf-8');
          return `export default ${json}`;
        },
      },
    ],
  }),
});
