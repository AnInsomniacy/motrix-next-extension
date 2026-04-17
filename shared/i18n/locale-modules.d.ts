/**
 * Type declarations for locale virtual modules.
 *
 * These are served by the `locale-virtual-import` Vite plugin in
 * wxt.config.ts, which reads from public/_locales/ at build time.
 */

type ChromeMessages = Record<
  string,
  {
    message: string;
    description?: string;
    placeholders?: Record<string, { content: string; example?: string }>;
  }
>;

declare module 'locale:en' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:zh_CN' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:ja' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:zh_Hant' {
  const messages: ChromeMessages;
  export default messages;
}

// Extension point: add more `declare module 'locale:xx'` as needed.
