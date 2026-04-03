/**
 * @fileoverview I18n engine with Vue integration and Naive UI locale mapping.
 *
 * Architecture:
 *   I18nEngine    — Framework-agnostic translation engine (Vue + service worker)
 *   createI18n()  — Vue provide/inject factory for App roots
 *   useI18n()     — Vue inject helper for child components
 *   useNaiveLocale() — Reactive NConfigProvider locale mapping
 *
 * The engine is a class (not pure functions) because Background service
 * worker needs stateful locale without Vue reactivity.
 *
 * Reactivity trick: a _version ref is bumped on setLocale(). All t()/tSub()
 * closures read _version as a tracked dependency, so Vue re-renders on locale
 * change without reactive-proxying the entire dictionary object.
 */
import { ref, computed, inject, type InjectionKey, type Ref, type ComputedRef } from 'vue';
import {
  zhCN,
  dateZhCN,
  enUS,
  dateEnUS,
  jaJP,
  dateJaJP,
  type NLocale,
  type NDateLocale,
} from 'naive-ui';
import { DICTIONARIES, FALLBACK_LOCALE, resolveLocaleId } from './dictionaries';

// ─── Engine (framework-agnostic) ────────────────────────

/**
 * Stateless-ish translation engine. Used in both Vue UIs
 * (via createI18n wrapper) and Background service worker (directly).
 */
export class I18nEngine {
  private dict: Record<string, string>;
  private readonly fallbackDict: Record<string, string>;
  private _locale: string;

  constructor(initialLocale: string) {
    this._locale = initialLocale;
    this.fallbackDict = DICTIONARIES[FALLBACK_LOCALE]!;
    this.dict = DICTIONARIES[initialLocale] ?? this.fallbackDict;
  }

  get locale(): string {
    return this._locale;
  }

  /** Switch the active locale. Unknown locales fall back to en. */
  setLocale(id: string): void {
    this._locale = id;
    this.dict = DICTIONARIES[id] ?? this.fallbackDict;
  }

  /**
   * Translate a key.
   * Fallback chain: current dict → en dict → provided fallback → raw key.
   */
  t(key: string, fallback?: string): string {
    return this.dict[key] ?? this.fallbackDict[key] ?? fallback ?? key;
  }

  /**
   * Always return the English translation, regardless of current locale.
   * Used by the Language section for bilingual display (“言語 / Language”).
   */
  tEn(key: string, fallback?: string): string {
    return this.fallbackDict[key] ?? fallback ?? key;
  }

  /**
   * Translate with positional substitutions.
   * Replaces $1, $2, ... with corresponding array entries.
   */
  tSub(key: string, subs: string[], fallback?: string): string {
    let msg = this.dict[key] ?? this.fallbackDict[key] ?? fallback ?? key;
    for (let i = 0; i < subs.length; i++) {
      msg = msg.replaceAll(`$${i + 1}`, subs[i]!);
    }
    return msg;
  }
}

// ─── Vue Integration ────────────────────────────────────

/** Context shape exposed via provide/inject. */
export interface I18nContext {
  /** Raw user preference: 'auto' | 'en' | 'zh_CN' | ... */
  locale: Ref<string>;
  /** Resolved effective locale after 'auto' detection. */
  effectiveLocale: ComputedRef<string>;
  /** Translate a key with optional fallback. */
  t: (key: string, fallback?: string) => string;
  /** Always return the English translation (for bilingual display). */
  tEn: (key: string, fallback?: string) => string;
  /** Translate with positional substitutions ($1, $2, ...). */
  tSub: (key: string, subs: string[], fallback?: string) => string;
  /** Change the active locale (triggers reactive re-render). */
  setLocale: (id: string) => void;
}

export const I18N_KEY: InjectionKey<I18nContext> = Symbol('i18n');

/**
 * Detect browser locale using the most accurate signal sources.
 * Priority: chrome.i18n.getUILanguage() → navigator.language → fallback.
 */
function detectBrowserLocale(): string {
  try {
    const uiLang = chrome.i18n.getUILanguage();
    if (uiLang) return resolveLocaleId(uiLang);
  } catch {
    /* Not in extension context (e.g. unit test) */
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    return resolveLocaleId(navigator.language);
  }

  return FALLBACK_LOCALE;
}

/**
 * Create an i18n context for a Vue app root.
 * Call once in App.vue setup, then `provide(I18N_KEY, ctx)`.
 */
export function createI18n(initialLocale: string = 'auto'): I18nContext {
  const resolved = initialLocale === 'auto' ? detectBrowserLocale() : initialLocale;
  const engine = new I18nEngine(resolved);
  const locale = ref(initialLocale);

  // Reactivity trigger — bumped on setLocale to invalidate computed t/tSub.
  const _v = ref(0);

  const effectiveLocale = computed(() => {
    void _v.value; // tracked dependency
    return locale.value === 'auto' ? detectBrowserLocale() : locale.value;
  });

  function setLocale(id: string): void {
    locale.value = id;
    engine.setLocale(id === 'auto' ? detectBrowserLocale() : id);
    _v.value++;
  }

  // Reactive wrappers — depend on _v so Vue re-renders on locale change.
  function t(key: string, fallback?: string): string {
    void _v.value;
    return engine.t(key, fallback);
  }

  function tEn(key: string, fallback?: string): string {
    return engine.tEn(key, fallback);
  }

  function tSub(key: string, subs: string[], fallback?: string): string {
    void _v.value;
    return engine.tSub(key, subs, fallback);
  }

  return { locale, effectiveLocale, t, tEn, tSub, setLocale };
}

/**
 * Inject i18n context in child components.
 * Mirrors vue-i18n's useI18n() API for familiarity.
 */
export function useI18n(): I18nContext {
  const ctx = inject(I18N_KEY);
  if (!ctx) {
    throw new Error(
      '[i18n] useI18n() called without createI18n() in ancestor. ' +
        'Call createI18n() and provide(I18N_KEY, ctx) in your App root.',
    );
  }
  return ctx;
}

// ─── Naive UI Locale Mapping ────────────────────────────

const NAIVE_MAP: Record<string, { locale: NLocale; dateLocale: NDateLocale }> = {
  en: { locale: enUS, dateLocale: dateEnUS },
  ja: { locale: jaJP, dateLocale: dateJaJP },
  zh_CN: { locale: zhCN, dateLocale: dateZhCN },
};

const NAIVE_FALLBACK = NAIVE_MAP.en!;

/**
 * Reactive Naive UI locale objects for NConfigProvider.
 *
 * @example
 * const { naiveLocale, naiveDateLocale } = useNaiveLocale(effectiveLocale);
 * // <NConfigProvider :locale="naiveLocale" :date-locale="naiveDateLocale">
 */
export function useNaiveLocale(effectiveLocale: ComputedRef<string> | Ref<string>) {
  return {
    naiveLocale: computed(() => (NAIVE_MAP[effectiveLocale.value] ?? NAIVE_FALLBACK).locale),
    naiveDateLocale: computed(
      () => (NAIVE_MAP[effectiveLocale.value] ?? NAIVE_FALLBACK).dateLocale,
    ),
  };
}
