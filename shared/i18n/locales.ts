/** Locale entry for the language selector UI. */
export interface LocaleEntry {
  /** Storage ID: 'en', 'zh_CN', ... */
  readonly id: string;
  /** Native name: 'English', '中文', '日本語' */
  readonly endonym: string;
  /** English name: 'English', 'Chinese', 'Japanese' */
  readonly exonym: string;
}

// ─── Locale Registry ────────────────────────────────────

/** Supported locales with display metadata, sorted by locale ID. */
export const SUPPORTED_LOCALES: readonly LocaleEntry[] = [
  { id: 'ar', endonym: 'عربي', exonym: 'Arabic' },
  { id: 'bg', endonym: 'Българският език', exonym: 'Bulgarian' },
  { id: 'ca', endonym: 'Català', exonym: 'Catalan' },
  { id: 'de', endonym: 'Deutsch', exonym: 'German' },
  { id: 'el', endonym: 'Ελληνικά', exonym: 'Greek' },
  { id: 'en', endonym: 'English', exonym: 'English' },
  { id: 'es', endonym: 'Español', exonym: 'Spanish' },
  { id: 'fa', endonym: 'فارسی', exonym: 'Persian' },
  { id: 'fr', endonym: 'Français', exonym: 'French' },
  { id: 'hi', endonym: 'हिन्दी', exonym: 'Hindi' },
  { id: 'hu', endonym: 'Magyar', exonym: 'Hungarian' },
  { id: 'id', endonym: 'Indonesia', exonym: 'Indonesian' },
  { id: 'it', endonym: 'Italiano', exonym: 'Italian' },
  { id: 'ja', endonym: '日本語', exonym: 'Japanese' },
  { id: 'ko', endonym: '한국어', exonym: 'Korean' },
  { id: 'nb', endonym: 'Norsk Bokmål', exonym: 'Norwegian Bokmål' },
  { id: 'nl', endonym: 'Nederlands', exonym: 'Dutch' },
  { id: 'pl', endonym: 'Polski', exonym: 'Polish' },
  { id: 'pt_BR', endonym: 'Português (Brasil)', exonym: 'Portuguese (Brazil)' },
  { id: 'ro', endonym: 'Română', exonym: 'Romanian' },
  { id: 'ru', endonym: 'Русский', exonym: 'Russian' },
  { id: 'th', endonym: 'แบบไทย', exonym: 'Thai' },
  { id: 'tr', endonym: 'Türkçe', exonym: 'Turkish' },
  { id: 'uk', endonym: 'Українська', exonym: 'Ukrainian' },
  { id: 'vi', endonym: 'Tiếng Việt', exonym: 'Vietnamese' },
  { id: 'zh_CN', endonym: '简体中文', exonym: 'Chinese (Simplified)' },
  { id: 'zh_TW', endonym: '繁體中文', exonym: 'Chinese (Traditional)' },
];

export const FALLBACK_LOCALE = 'en';
