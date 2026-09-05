declare module 'virtual:locales' {
  /** Chrome messages aggregated by the build plugin. */
  const locales: Record<string, Record<string, unknown>>;
  export default locales;
}
