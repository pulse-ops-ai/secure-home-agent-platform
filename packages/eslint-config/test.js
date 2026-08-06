// Test sources.
//
// Tests are production code for the purposes of correctness, but a few rules
// that protect a public surface are noise in a test: a test has no consumers,
// and asserting on loosely-typed fixtures is normal.
//
// Deliberately still ON in tests: no-floating-promises, and the unsafe-* rules
// that catch a mistyped await. A test that silently never runs its assertions
// is worse than no test.

import { configFileOverrides } from './base.js'
import { node } from './node.js'

/** Applied to test files only; compose after a role config. */
export const test = [
  ...node,
  {
    files: ['**/*.test.ts', '**/*.test.js', '**/tests/**/*.ts', '**/tests/**/*.js'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Fixtures are frequently untyped by design.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // A test may legitimately construct a value the type system dislikes in
      // order to prove the runtime rejects it.
      '@typescript-eslint/no-explicit-any': 'off',
      // Tests may read the environment and print.
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-console': 'off',
    },
  },
  configFileOverrides,
]

export default test
