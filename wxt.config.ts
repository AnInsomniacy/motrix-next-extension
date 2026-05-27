import { defineConfig } from 'wxt';
import Components from 'unplugin-vue-components/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { buildExtensionManifest } from './shared/manifest';

// Ensure persistent browser profile directories exist before chrome-launcher
// attempts to write chrome-out.log. mkdirSync is idempotent with recursive.
const CHROMIUM_PROFILE = resolve('.wxt/chrome-data');
const FIREFOX_PROFILE = resolve('.wxt/firefox-data');
mkdirSync(CHROMIUM_PROFILE, { recursive: true });
mkdirSync(FIREFOX_PROFILE, { recursive: true });

const CHUNK_SIZE_WARNING_LIMIT_KB = 1024;

async function createTailwindPlugin() {
  // Tailwind 4.3 still emits Node's DEP0205 while loading its Vite plugin.
  // Scope suppression to this import so real project warnings still surface.
  const previousNoDeprecation = process.noDeprecation;
  process.noDeprecation = true;
  try {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    return tailwindcss();
  } finally {
    process.noDeprecation = previousNoDeprecation;
  }
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}-mv3.zip',
  },
  webExt: {
    // Reuse a persistent browser profile across dev restarts so that
    // chrome.storage.local data (RPC secret, theme, etc.) is preserved.
    // Works for both Chromium (Chrome/Edge) and Firefox.
    chromiumProfile: CHROMIUM_PROFILE,
    firefoxProfile: FIREFOX_PROFILE,
    keepProfileChanges: true,
  },
  manifest: ({ browser }) => buildExtensionManifest(browser),
  vite: async () => ({
    build: {
      // WXT builds the service worker as an IIFE, so manual code-splitting is
      // not valid for every entrypoint. Keep the warning threshold explicit
      // instead of relying on Vite's generic web-app default.
      chunkSizeWarningLimit: CHUNK_SIZE_WARNING_LIMIT_KB,
    },
    plugins: [
      await createTailwindPlugin(),
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
