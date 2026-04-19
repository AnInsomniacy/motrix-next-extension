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

declare module 'locale:ar' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:bg' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:ca' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:de' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:el' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:en' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:es' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:fa' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:fr' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:hu' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:id' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:it' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:ja' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:ko' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:nb' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:nl' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:pl' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:pt_BR' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:ro' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:ru' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:th' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:tr' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:uk' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:vi' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:zh_CN' {
  const messages: ChromeMessages;
  export default messages;
}

declare module 'locale:zh_TW' {
  const messages: ChromeMessages;
  export default messages;
}
