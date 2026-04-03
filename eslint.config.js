import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  // ─── Global ignores ─────────────────────────────────────
  { ignores: ['node_modules/', '.output/', '.wxt/', 'dist/'] },

  // ─── Base JS rules ──────────────────────────────────────
  eslint.configs.recommended,

  // ─── TypeScript rules ───────────────────────────────────
  ...tseslint.configs.recommended,

  // ─── Vue rules ──────────────────────────────────────────
  ...pluginVue.configs['flat/recommended'],

  // ─── Vue + TypeScript parser ────────────────────────────
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // ─── Browser + WebExtensions globals ────────────────────
  {
    files: ['entrypoints/**/*.{ts,vue}'],
    languageOptions: {
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
  },

  // ─── Project-specific overrides ─────────────────────────
  {
    rules: {
      // Allow unused vars prefixed with _ (common TS pattern)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Allow empty catch blocks (used for graceful degradation)
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Disable rules that conflict with Prettier
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
    },
  },

  // ─── Test files relaxation ──────────────────────────────
  {
    files: ['__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
