import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Data-fetch-on-mount is standard in this app; the rule flags most loadX() effects.
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useAuth', 'mapApiMediaItem'] },
      ],
    },
  },
  {
    files: ['vite-plugin-oss-dev-relay.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
