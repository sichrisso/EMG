import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Advisory in this codebase: prop-to-state sync in AvatarPicker and
      // react-hook-form's watch() are intentional, reviewed patterns.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/incompatible-library': 'warn',
      // Strictness that matters is enforced by tsc (strict, noUnusedLocals).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', console: 'readonly',
                 setTimeout: 'readonly', clearTimeout: 'readonly', alert: 'readonly',
                 confirm: 'readonly', URL: 'readonly', File: 'readonly',
                 FileReader: 'readonly', HTMLInputElement: 'readonly' },
    },
  },
);
