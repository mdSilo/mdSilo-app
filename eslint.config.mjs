// Lints the app (src). packages/mdsmirror has its own eslint.config.mjs.
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['packages/', 'dist/', 'dist-web/', 'build/', 'src-tauri/', 'web/'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...js.configs.recommended,
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
  },
  ...tsPlugin.configs['flat/recommended'].map((config) => ({ files: ['src/**/*.{ts,tsx}'], ...config })),
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  ...[importPlugin.flatConfigs.errors, importPlugin.flatConfigs.warnings, importPlugin.flatConfigs.typescript].map(
    (config) => ({ files: ['src/**/*.{ts,tsx}'], ...config }),
  ),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'import/no-named-as-default': 'off',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        },
      ],
    },
    settings: {
      react: {
        // "detect" calls context.getFilename(), which eslint 10 removed
        version: '19.3',
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          moduleDirectory: ['node_modules', 'src'],
        },
      },
    },
  },
];
