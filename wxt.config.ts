import { defineConfig } from 'wxt';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import { buildExtensionManifest } from './shared/manifest';
import { localesPlugin } from './shared/i18n/locales-plugin';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  dev: {
    // Native extension CSP and injected Vite URLs must share one origin.
    // Fail on duplicate dev servers instead of emitting an unloadable build.
    server: { port: 3000 },
  },
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}-mv3.zip',
  },
  webExt: {
    // Native Messaging registrations are scoped to the regular browser data
    // root on macOS and Linux. Load the dev build into a normal browser profile.
    disabled: true,
  },
  manifest: ({ browser, mode }) => buildExtensionManifest(browser, mode),
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
