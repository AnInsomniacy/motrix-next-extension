/**
 * I18n engine.
 *
 *   I18nEngine       — stateful translator for the background service worker
 *   createI18n()     — reactive Vue context (provide/inject) for UI roots
 *   useI18n()        — inject helper for child components
 *   useNaiveLocale() — Naive UI NConfigProvider locale mapping
 */
import { computed, inject, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import {
  dateEnUS,
  dateJaJP,
  dateZhCN,
  enUS,
  jaJP,
  zhCN,
  type NDateLocale,
  type NLocale,
} from 'naive-ui';
import { DICTIONARIES, FALLBACK_LOCALE, resolveLocaleId } from './dictionaries';

const FALLBACK_DICT = DICTIONARIES[FALLBACK_LOCALE]!;

function translate(dict: Record<string, string>, key: string, fallback?: string): string {
  return dict[key] ?? FALLBACK_DICT[key] ?? fallback ?? key;
}

function substitute(msg: string, subs: string[]): string {
  return subs.reduce((acc, sub, i) => acc.replaceAll(`$${i + 1}`, sub), msg);
}

// ─── Service Worker Engine ──────────────────────────────

/** Minimal stateful translator for non-Vue contexts (background worker). */
export class I18nEngine {
  private dict: Record<string, string>;

  constructor(initialLocale: string) {
    this.dict = DICTIONARIES[initialLocale] ?? FALLBACK_DICT;
  }

  setLocale(id: string): void {
    this.dict = DICTIONARIES[id] ?? FALLBACK_DICT;
  }

  t(key: string, fallback?: string): string {
    return translate(this.dict, key, fallback);
  }
}

// ─── Vue Integration ────────────────────────────────────

export interface I18nContext {
  /** Raw user preference: 'auto' | 'en' | 'zh_CN' | ... */
  locale: Ref<string>;
  /** Resolved effective locale after 'auto' detection. */
  effectiveLocale: ComputedRef<string>;
  t: (key: string, fallback?: string) => string;
  /** Always the English translation (for bilingual display). */
  tEn: (key: string, fallback?: string) => string;
  /** Translate with positional substitutions ($1, $2, ...). */
  tSub: (key: string, subs: string[], fallback?: string) => string;
  setLocale: (id: string) => void;
}

export const I18N_KEY: InjectionKey<I18nContext> = Symbol('i18n');

export interface CreateI18nOptions {
  localeApi?: { getUILanguage: () => string };
}

function detectBrowserLocale(localeApi?: CreateI18nOptions['localeApi']): string {
  try {
    const uiLang = localeApi?.getUILanguage();
    if (uiLang) return resolveLocaleId(uiLang);
  } catch {
    /* not in an extension context */
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return resolveLocaleId(navigator.language);
  }
  return FALLBACK_LOCALE;
}

/**
 * Create the reactive i18n context for a Vue app root.
 * Call once in App.vue setup, then `provide(I18N_KEY, ctx)`.
 */
export function createI18n(
  initialLocale: string = 'auto',
  options: CreateI18nOptions = {},
): I18nContext {
  const locale = ref(initialLocale);

  const effectiveLocale = computed(() =>
    locale.value === 'auto' ? detectBrowserLocale(options.localeApi) : locale.value,
  );
  const dict = computed(() => DICTIONARIES[effectiveLocale.value] ?? FALLBACK_DICT);

  return {
    locale,
    effectiveLocale,
    t: (key, fallback) => translate(dict.value, key, fallback),
    tEn: (key, fallback) => FALLBACK_DICT[key] ?? fallback ?? key,
    tSub: (key, subs, fallback) => substitute(translate(dict.value, key, fallback), subs),
    setLocale: (id) => {
      locale.value = id;
    },
  };
}

/** Inject the i18n context in child components. */
export function useI18n(): I18nContext {
  const ctx = inject(I18N_KEY);
  if (!ctx) {
    throw new Error('[i18n] useI18n() requires createI18n() + provide(I18N_KEY) in the app root');
  }
  return ctx;
}

// ─── Naive UI Locale Mapping ────────────────────────────

const NAIVE_MAP: Record<string, { locale: NLocale; dateLocale: NDateLocale }> = {
  en: { locale: enUS, dateLocale: dateEnUS },
  ja: { locale: jaJP, dateLocale: dateJaJP },
  zh_CN: { locale: zhCN, dateLocale: dateZhCN },
};

/** Reactive Naive UI locale objects for NConfigProvider. */
export function useNaiveLocale(effectiveLocale: ComputedRef<string> | Ref<string>) {
  return {
    naiveLocale: computed(() => (NAIVE_MAP[effectiveLocale.value] ?? NAIVE_MAP.en!).locale),
    naiveDateLocale: computed(() => (NAIVE_MAP[effectiveLocale.value] ?? NAIVE_MAP.en!).dateLocale),
  };
}
