import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {...js.configs.recommended, files: ['**/*.{js,mjs,cjs,jsx}']},
  ...tseslint.configs.recommended,
  nextPlugin.configs['core-web-vitals'],
  {files: ['scripts/**/*.mjs', 'tests/fixtures/run-backend-double.mjs'], languageOptions: {globals: globals.node}},
  {settings: {react: {version: '19.3.0'}}},
  globalIgnores(['.next/**', 'out/**', 'build/**', 'public/maplibre/**', 'next-env.d.ts'])
]);
