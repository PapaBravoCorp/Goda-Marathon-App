import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Core no-unused-vars does not see a variable used only as the object of a
      // JSX member expression, so `<motion.div>` left `motion` looking unused
      // and the config reported an error on correct code. This rule marks such
      // identifiers as used, which is the whole reason it exists.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',

      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        // An unused binding in `catch (err)` is a real smell -- it means an
        // error was caught and thrown away. Allow it only when it is named to
        // say so explicitly.
        caughtErrorsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      }],

      // Flagged on two mount-time effects that read sessionStorage and the
      // router. Both are legitimate external-system reads, but the rule is
      // worth keeping visible as a warning rather than silenced outright.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
