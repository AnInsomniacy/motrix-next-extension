import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'wxt';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import { buildExtensionManifest, EXTENSION_ICON_SIZES } from './shared/manifest';
import { localesPlugin } from './shared/i18n/locales-plugin';

const chromiumProfile = resolve('.wxt/chrome-data');

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/rayburst-connect.svg',
    developmentIndicator: false,
    sizes: EXTENSION_ICON_SIZES,
  },
  webExt: {
    // Reuse the development profile through the runner instead of competing CLI flags.
    chromiumProfile,
    keepProfileChanges: true,
  },
  hooks: {
    'server:created': async () => {
      // chrome-launcher opens its log files before creating the browser profile.
      await mkdir(chromiumProfile, { recursive: true });
    },
  },
  dev: {
    // Native extension CSP and injected Vite URLs must share one origin.
    // Fail on duplicate dev servers instead of emitting an unloadable build.
    server: { port: 3000 },
  },
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}-mv3.zip',
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
