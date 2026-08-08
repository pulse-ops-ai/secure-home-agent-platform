// Base flat configuration — every other export builds on this.
//
// Type-aware linting is enabled through `projectService`, so each consumer gets
// full type information from its own tsconfig without re-declaring parser or
// project settings. That is the whole point of this package: a member's
// eslint.config.js should be two lines.
//
// Framework-neutral by rule. No NestJS, Next.js, React, or Zod rules live here
// — those belong to the issues that introduce those frameworks (ADR-0012 §15,
// and the neutrality rule in ADR-0003).
//
// FORMATTING IS NOT HERE. Prettier is the single formatting authority
// (packages/eslint-config/README.md). ESLint 10 ships no formatting rules in
// core and this package adds no stylistic plugin, so the two cannot conflict.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Package-root tooling files: eslint.config.js, vitest.config.ts,
 * vitest.base.js. They are configuration, not build input, so the rules that
 * protect a package's public surface do not apply. Append this LAST in a role
 * config so it wins over the role's own rules.
 */
export const configFileOverrides = {
  files: ['*.js', '*.mjs', '*.cjs', '*.config.ts'],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-restricted-globals': 'off',
    'no-restricted-properties': 'off',
    'no-console': 'off',
  },
}

/**
 * Never linted: build output, dependencies, and lint FIXTURES.
 *
 * Fixtures under tests/fixtures/ are deliberately-invalid code whose whole
 * purpose is to make a rule fire. Linting them would fail the build on the very
 * violations they exist to prove are caught.
 */
export const ignores = {
  ignores: [
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/*.d.ts',
    '**/tests/fixtures/**',
  ],
}

/**
 * Rules that need type information. Kept separate so a JavaScript-only config
 * package can use `base` without paying for a TypeScript program.
 */
const typeAwareRules = {
  // A promise nobody awaits is a bug that surfaces as an unhandled rejection,
  // often in production and never in tests.
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/require-await': 'error',

  // `any` propagation defeats the strict compiler settings in
  // @secure-home/tsconfig. These are warnings rather than errors only where a
  // third-party type would otherwise force a suppression comment.
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
}

const sharedRules = {
  // Unused code is either a mistake or dead weight. `_`-prefixed arguments are
  // the documented escape hatch for interface conformance.
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'all',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],

  // ESM hygiene. `verbatimModuleSyntax` in the shared tsconfig requires type
  // imports to be marked; this makes the fix automatic rather than a compiler
  // error the author has to decode.
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-import-type-side-effects': 'error',

  // An explicit `any` is a decision, so it must be visible in review.
  '@typescript-eslint/no-explicit-any': 'error',

  // Suppressions must carry a reason.
  '@typescript-eslint/ban-ts-comment': [
    'error',
    { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
  ],

  // Structured logging is a platform contract (ADR-0012 §14); console output
  // bypasses it and cannot be redacted.
  'no-console': 'error',

  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
}

/**
 * Base configuration: recommended + type-checked rules, plus the shared rules
 * above. Consumers normally use a role-specific export instead.
 */
export const base = tseslint.config(
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Resolves each file against the nearest tsconfig automatically, so a
        // member never re-declares `project` or `tsconfigRootDir`.
        projectService: {
          // A package-root `*.config.ts` sits outside the tsconfig `include`,
          // which is correct — it is tooling, not build input. JavaScript files
          // are handled by the untyped block below instead, so this glob stays
          // narrow enough to avoid the default-project file-count limit.
          allowDefaultProject: ['*.config.ts'],
        },
      },
    },
    rules: { ...sharedRules, ...typeAwareRules },
  },
  {
    // JavaScript is not in a TypeScript project, so type-aware rules cannot
    // run on it. Turning them off explicitly is the difference between a lint
    // result and a parse error.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
)

export default base
