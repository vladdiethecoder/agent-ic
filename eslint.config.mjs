import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.agent-ic/**',
      'coverage/**',
      'demo-out/**',
      'public/**',
      'data/**',
      'docs/video-audit-evidence-iter2/**',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];

export default eslintConfig;
