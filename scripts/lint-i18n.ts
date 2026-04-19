/**
 * @fileoverview i18n lint script for Chrome extension messages.
 *
 * Checks for:
 * 1. Duplicate keys in JSON files (JSON.parse silently uses last-wins)
 * 2. Key mismatches between locales (en is the reference)
 * 3. Empty message values
 *
 * Usage: npx tsx scripts/lint-i18n.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Config ─────────────────────────────────────────────

const LOCALES_DIR = resolve(import.meta.dirname ?? '.', '..', 'public', '_locales');
const REFERENCE_LOCALE = 'en';
const LOCALES = [
  'ar',
  'bg',
  'ca',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fr',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt_BR',
  'ro',
  'ru',
  'th',
  'tr',
  'uk',
  'vi',
  'zh_CN',
  'zh_TW',
];

// ─── Duplicate Key Detection ────────────────────────────
// JSON.parse doesn't detect duplicates — we parse the raw text with regex.

function findDuplicateKeys(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  // Match only top-level message keys (2-space indent, value is an object).
  // This avoids matching nested keys like "placeholders" inside a message.
  const keyRegex = /^ {2}"([^"]+)"\s*:\s*\{/gm;
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(content)) !== null) {
    const key = match[1]!;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicates.push(key);
  }

  return duplicates;
}

// ─── Key Consistency Check ──────────────────────────────

function getKeys(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as Record<string, unknown>;
  return new Set(Object.keys(data));
}

// ─── Empty Message Check ────────────────────────────────

function findEmptyMessages(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content) as Record<string, { message?: string }>;
  return Object.entries(data)
    .filter(
      ([, v]) => typeof v === 'object' && v !== null && (!v.message || v.message.trim() === ''),
    )
    .map(([k]) => k);
}

// ─── Main ───────────────────────────────────────────────

let hasErrors = false;

for (const locale of LOCALES) {
  const filePath = resolve(LOCALES_DIR, locale, 'messages.json');
  if (!existsSync(filePath)) {
    console.error(`❌ Locale file missing: ${filePath}`);
    hasErrors = true;
    continue;
  }

  // Check duplicates
  const dups = findDuplicateKeys(filePath);
  if (dups.length > 0) {
    console.error(`❌ [${locale}] Duplicate keys: ${dups.join(', ')}`);
    hasErrors = true;
  }

  // Check empty messages
  const empty = findEmptyMessages(filePath);
  if (empty.length > 0) {
    console.error(`❌ [${locale}] Empty messages: ${empty.join(', ')}`);
    hasErrors = true;
  }
}

// Check key consistency between locales
const refPath = resolve(LOCALES_DIR, REFERENCE_LOCALE, 'messages.json');
const refKeys = getKeys(refPath);

for (const locale of LOCALES) {
  if (locale === REFERENCE_LOCALE) continue;
  const locPath = resolve(LOCALES_DIR, locale, 'messages.json');
  if (!existsSync(locPath)) continue;

  const locKeys = getKeys(locPath);

  const missingInLoc = [...refKeys].filter((k) => !locKeys.has(k));
  const extraInLoc = [...locKeys].filter((k) => !refKeys.has(k));

  if (missingInLoc.length > 0) {
    console.error(
      `❌ [${locale}] Missing keys (present in ${REFERENCE_LOCALE}): ${missingInLoc.join(', ')}`,
    );
    hasErrors = true;
  }
  if (extraInLoc.length > 0) {
    console.error(
      `⚠️  [${locale}] Extra keys (not in ${REFERENCE_LOCALE}): ${extraInLoc.join(', ')}`,
    );
    // Extra keys are a warning, not an error
  }
}

if (hasErrors) {
  console.error('\ni18n lint failed.');
  process.exit(1);
} else {
  console.log('✅ i18n lint passed — no duplicate keys, all locales consistent.');
}
