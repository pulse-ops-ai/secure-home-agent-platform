// Shared ESLint flat configuration.
//
// Deliberately small. It enforces correctness rules that apply to every
// package; it does NOT enforce architectural import direction — that needs a
// dependency-graph rule and arrives with the packages that have real imports
// (ADR-0012 §15). Syncpack does not enforce it either.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // A boundary package may legitimately export nothing yet.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
)
