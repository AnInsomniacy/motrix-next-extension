/** Validate locale registration, message structure, placeholders, and key parity. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { FALLBACK_LOCALE, SUPPORTED_LOCALES } from '../shared/i18n/locales';

const localesDir = resolve(import.meta.dirname, '..', 'public', '_locales');
const MessagesSchema = z.record(
  z.string(),
  z.object({
    message: z.string().trim().min(1),
    placeholders: z.record(z.string(), z.object({ content: z.string().min(1) })).optional(),
  }),
);

function readLocale(id: string) {
  const text = readFileSync(resolve(localesDir, id, 'messages.json'), 'utf8');
  // Locale files use Prettier's two-space indentation.
  const keys = [...text.matchAll(/^ {2}"([^"]+)"\s*:/gm)].map((match) => match[1]);
  if (new Set(keys).size !== keys.length) throw new Error(`[${id}] Duplicate message keys`);
  const parsed = MessagesSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`[${id}] Invalid messages: ${parsed.error.message}`);

  for (const [key, entry] of Object.entries(parsed.data)) {
    for (const match of entry.message.matchAll(/\$([a-zA-Z][\w]*)\$/g)) {
      if (!Object.hasOwn(entry.placeholders ?? {}, match[1]!)) {
        throw new Error(`[${id}] Undefined placeholder in ${key}: ${match[0]}`);
      }
    }
  }
  return Object.keys(parsed.data).sort();
}

try {
  const referenceKeys = readLocale(FALLBACK_LOCALE);
  const ids = SUPPORTED_LOCALES.map((locale) => locale.id).sort();
  const directories = readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (new Set(ids).size !== ids.length || ids.join() !== directories.join()) {
    throw new Error('Registered locales and locale directories must match exactly');
  }
  for (const locale of SUPPORTED_LOCALES) {
    if (!locale.endonym.trim() || !locale.exonym.trim())
      throw new Error(`[${locale.id}] Missing display name`);
    if (locale.id === FALLBACK_LOCALE) continue;
    const keys = readLocale(locale.id);
    const missing = referenceKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !referenceKeys.includes(key));
    if (missing.length || extra.length) {
      throw new Error(
        `[${locale.id}] Missing keys: ${missing.join(', ')}; extra keys: ${extra.join(', ')}`,
      );
    }
  }
  console.log(`i18n checks passed for ${ids.length} locales.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
