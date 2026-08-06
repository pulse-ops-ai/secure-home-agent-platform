// Shared Vitest configuration.
//
// Authored as plain ESM JavaScript, NOT TypeScript, on purpose: a consumer's
// vitest.config.ts imports this, and if it were built TypeScript then `pnpm
// test` would fail on a clean checkout until `pnpm build` had run. A config that
// requires a build to run tests is a bootstrapping trap.
//
// Node environment only. There is no browser-side code in this repository, and
// a jsdom default would silently mask a Node-only mistake.

/** Test files. Unit tests live beside their source; integration tests do not. */
export const UNIT_INCLUDE = ['src/**/*.test.ts']
export const INTEGRATION_INCLUDE = ['tests/integration/**/*.test.ts']

/** Never collected as tests, never counted as coverage. */
export const EXCLUDE = ['**/dist/**', '**/node_modules/**', '**/coverage/**']

/**
 * Deterministic timeouts. A test that depends on machine speed fails randomly
 * on a loaded Raspberry Pi and passes on CI, which trains people to re-run
 * rather than investigate.
 */
export const TIMEOUTS = {
  unit: { testTimeout: 5_000, hookTimeout: 5_000 },
  integration: { testTimeout: 30_000, hookTimeout: 30_000 },
}

/**
 * Base configuration shared by every package.
 *
 * @type {import('vitest/config').ViteUserConfig}
 */
export const baseConfig = {
  test: {
    environment: 'node',
    include: UNIT_INCLUDE,
    exclude: EXCLUDE,
    // Explicit imports rather than ambient globals: a test file that reads like
    // an ordinary module is easier to reason about, and needs no extra types.
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    ...TIMEOUTS.unit,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', ...EXCLUDE],
      // No thresholds yet. Every package boundary is empty, so a threshold
      // would either be 0 (meaningless) or fail the build (dishonest).
      // Thresholds arrive with the first package that has behaviour to cover.
    },
  },
}

/**
 * Build a package's Vitest config from the shared base.
 *
 * @param {import('vitest/config').ViteUserConfig} [overrides]
 * @returns {import('vitest/config').ViteUserConfig}
 */
export function definePackageConfig(overrides = {}) {
  return {
    ...baseConfig,
    ...overrides,
    test: {
      ...baseConfig.test,
      ...(overrides.test ?? {}),
      coverage: {
        ...baseConfig.test.coverage,
        ...(overrides.test?.coverage ?? {}),
      },
    },
  }
}

/**
 * Integration variant: same defaults, different includes and longer timeouts.
 *
 * The infrastructure integration tests will need (containers, fixtures, a live
 * dependency) is deliberately NOT implemented here — this only reserves the
 * shape so integration tests are not later bolted on with their own conventions.
 *
 * @param {import('vitest/config').ViteUserConfig} [overrides]
 */
export function defineIntegrationConfig(overrides = {}) {
  return definePackageConfig({
    ...overrides,
    test: {
      include: INTEGRATION_INCLUDE,
      ...TIMEOUTS.integration,
      ...(overrides.test ?? {}),
    },
  })
}

/**
 * Setup-file extension point. A package that needs shared setup passes
 * `setupFiles` through `definePackageConfig`; nothing is registered globally,
 * so no package inherits setup it did not ask for.
 */
export const SETUP_FILES_EXTENSION_POINT = 'test.setupFiles'
