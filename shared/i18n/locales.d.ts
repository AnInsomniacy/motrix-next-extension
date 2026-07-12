declare module 'virtual:locales' {
  /** Record<localeId, Chrome i18n messages.json content>. */
  const locales: Record<string, Record<string, unknown>>;
  export default locales;
}
