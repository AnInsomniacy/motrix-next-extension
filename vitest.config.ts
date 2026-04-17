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
      'locale:en': resolve(__dirname, 'public/_locales/en/messages.json'),
      'locale:ja': resolve(__dirname, 'public/_locales/ja/messages.json'),
      'locale:zh_Hant': resolve(__dirname, 'public/_locales/zh_Hant/messages.json'),
      'locale:zh_CN': resolve(__dirname, 'public/_locales/zh_CN/messages.json'),
    },
  },
});
