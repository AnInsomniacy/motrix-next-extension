import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  runner: {
    // Reuse a persistent browser profile across dev restarts so that
    // chrome.storage.local data (RPC secret, theme, etc.) is preserved.
    dataPersistence: 'project',
  },
  manifest: {
    name: '__MSG_ext_name__',
    description: '__MSG_ext_description__',
    default_locale: 'en',
    permissions: ['downloads', 'storage', 'contextMenus', 'notifications'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    optional_permissions: ['cookies', 'downloads.ui'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
  vite: () => ({
    plugins: [
      tailwindcss(),
      Components({
        resolvers: [NaiveUiResolver()],
        dirs: ['entrypoints/**/components'],
        dts: false,
      }),
    ],
  }),
});
