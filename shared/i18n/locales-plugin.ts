/**
 * Vite plugin serving all Chrome i18n bundles as a single virtual module.
 *
 * `import locales from 'virtual:locales'` resolves to
 * `Record<localeId, ChromeMessages>` aggregated from `public/_locales/` at
 * build time. The messages.json files stay the single source of truth and
 * never bypass Vite's "no import from public/" guard.
 *
 * Used by both wxt.config.ts and vitest.config.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VIRTUAL_ID = 'virtual:locales';
const RESOLVED_ID = '\0virtual:locales';

export function localesPlugin(root: string = process.cwd()) {
  return {
    name: 'motrix-next:locales',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (source === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id: string) {
      if (id !== RESOLVED_ID) return;
      const localesDir = resolve(root, 'public/_locales');
      const entries = readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const json = readFileSync(join(localesDir, entry.name, 'messages.json'), 'utf-8');
          return `  ${JSON.stringify(entry.name)}: ${json}`;
        });
      return `export default {\n${entries.join(',\n')}\n};`;
    },
  };
}
