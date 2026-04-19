import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['modules/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'locale:ar': resolve(__dirname, 'public/_locales/ar/messages.json'),
      'locale:bg': resolve(__dirname, 'public/_locales/bg/messages.json'),
      'locale:ca': resolve(__dirname, 'public/_locales/ca/messages.json'),
      'locale:de': resolve(__dirname, 'public/_locales/de/messages.json'),
      'locale:el': resolve(__dirname, 'public/_locales/el/messages.json'),
      'locale:en': resolve(__dirname, 'public/_locales/en/messages.json'),
      'locale:es': resolve(__dirname, 'public/_locales/es/messages.json'),
      'locale:fa': resolve(__dirname, 'public/_locales/fa/messages.json'),
      'locale:fr': resolve(__dirname, 'public/_locales/fr/messages.json'),
      'locale:hu': resolve(__dirname, 'public/_locales/hu/messages.json'),
      'locale:id': resolve(__dirname, 'public/_locales/id/messages.json'),
      'locale:it': resolve(__dirname, 'public/_locales/it/messages.json'),
      'locale:ja': resolve(__dirname, 'public/_locales/ja/messages.json'),
      'locale:ko': resolve(__dirname, 'public/_locales/ko/messages.json'),
      'locale:nb': resolve(__dirname, 'public/_locales/nb/messages.json'),
      'locale:nl': resolve(__dirname, 'public/_locales/nl/messages.json'),
      'locale:pl': resolve(__dirname, 'public/_locales/pl/messages.json'),
      'locale:pt_BR': resolve(__dirname, 'public/_locales/pt_BR/messages.json'),
      'locale:ro': resolve(__dirname, 'public/_locales/ro/messages.json'),
      'locale:ru': resolve(__dirname, 'public/_locales/ru/messages.json'),
      'locale:th': resolve(__dirname, 'public/_locales/th/messages.json'),
      'locale:tr': resolve(__dirname, 'public/_locales/tr/messages.json'),
      'locale:uk': resolve(__dirname, 'public/_locales/uk/messages.json'),
      'locale:vi': resolve(__dirname, 'public/_locales/vi/messages.json'),
      'locale:zh_CN': resolve(__dirname, 'public/_locales/zh_CN/messages.json'),
      'locale:zh_TW': resolve(__dirname, 'public/_locales/zh_TW/messages.json'),
    },
  },
});
