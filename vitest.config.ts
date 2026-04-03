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
    },
  },
});
