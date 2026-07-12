import { defineConfig } from 'wxt';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { buildExtensionManifest } from './shared/manifest';
import { localesPlugin } from './shared/i18n/locales-plugin';

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
    artifactTemplate: '{{name}}-{{version}}-{{browser}}-mv3.zip',
  },
  webExt: {
    // Reuse a persistent browser profile across dev restarts so that
    // chrome.storage.local data (RPC secret, theme, etc.) is preserved.
    chromiumProfile: CHROMIUM_PROFILE,
    firefoxProfile: FIREFOX_PROFILE,
    keepProfileChanges: true,
  },
  manifest: ({ browser }) => buildExtensionManifest(browser),
  vite: () => ({
    build: {
      // WXT builds the service worker as an IIFE, so manual code-splitting is
      // not valid for every entrypoint. Keep the warning threshold explicit.
      chunkSizeWarningLimit: 1024,
    },
    plugins: [
      localesPlugin(),
      Components({
        resolvers: [NaiveUiResolver()],
        dirs: ['entrypoints/**/components'],
        dts: false,
      }),
    ],
  }),
});
