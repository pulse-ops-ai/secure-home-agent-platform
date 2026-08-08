/**
 * Tests for the shared Vitest configuration.
 *
 * The config is what every package's tests run under, so a wrong default is a
 * repository-wide wrong default — and one that fails silently, by making tests
 * pass that should not have run at all.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  EXCLUDE,
  INTEGRATION_INCLUDE,
  TIMEOUTS,
  UNIT_INCLUDE,
  baseConfig,
  defineIntegrationConfig,
  definePackageConfig,
} from '../vitest.base.js'

describe('base defaults', () => {
  it('runs in a Node environment — there is no browser code here', () => {
    expect(baseConfig.test?.environment).toBe('node')
  })

  it('uses explicit imports rather than ambient globals', () => {
    expect(baseConfig.test?.globals).toBe(false)
  })

  it('collects unit tests beside their source', () => {
    expect(baseConfig.test?.include).toEqual(UNIT_INCLUDE)
    expect(UNIT_INCLUDE).toContain('src/**/*.test.ts')
  })

  it('never collects from generated directories', () => {
    for (const pattern of ['**/dist/**', '**/node_modules/**', '**/coverage/**']) {
      expect(EXCLUDE).toContain(pattern)
    }
  })

  it('sets deterministic timeouts so a loaded Pi does not fail randomly', () => {
    expect(baseConfig.test?.testTimeout).toBe(TIMEOUTS.unit.testTimeout)
    expect(typeof baseConfig.test?.testTimeout).toBe('number')
  })

  it('resets mock state between tests', () => {
    expect(baseConfig.test?.clearMocks).toBe(true)
    expect(baseConfig.test?.restoreMocks).toBe(true)
  })
})

describe('coverage', () => {
  it('uses V8 — built into Node, so no native build on ARM64', () => {
    expect(baseConfig.test?.coverage).toMatchObject({ provider: 'v8' })
  })

  it('measures source, not tests', () => {
    const coverage = baseConfig.test?.coverage as { include: string[]; exclude: string[] }
    expect(coverage['include']).toContain('src/**/*.ts')
    expect(coverage['exclude']).toContain('src/**/*.test.ts')
  })

  it('sets no threshold yet — every boundary is empty, so any number would lie', () => {
    const coverage = baseConfig.test?.coverage as Record<string, unknown>
    expect(coverage['thresholds']).toBeUndefined()
  })
})

describe('definePackageConfig', () => {
  it('returns the base defaults when given nothing', () => {
    expect(definePackageConfig().test?.environment).toBe('node')
  })

  it('lets a package override a default without losing the rest', () => {
    const config = definePackageConfig({ test: { testTimeout: 1234 } })
    expect(config.test?.testTimeout).toBe(1234)
    expect(config.test?.environment).toBe('node')
    expect(config.test?.exclude).toEqual(EXCLUDE)
  })

  it('merges coverage rather than replacing it', () => {
    const config = definePackageConfig({ test: { coverage: { reporter: ['json'] } } })
    const coverage = config.test?.coverage as Record<string, unknown>
    expect(coverage['reporter']).toEqual(['json'])
    expect(coverage['provider']).toBe('v8')
  })

  it('does not mutate the shared base', () => {
    definePackageConfig({ test: { testTimeout: 999 } })
    expect(baseConfig.test?.testTimeout).toBe(TIMEOUTS.unit.testTimeout)
  })

  it('exposes setupFiles as the extension point without registering any globally', () => {
    expect(baseConfig.test?.setupFiles).toBeUndefined()
    const config = definePackageConfig({ test: { setupFiles: ['./tests/setup.ts'] } })
    expect(config.test?.setupFiles).toEqual(['./tests/setup.ts'])
  })
})

describe('integration variant', () => {
  it('collects only integration tests', () => {
    expect(defineIntegrationConfig().test?.include).toEqual(INTEGRATION_INCLUDE)
  })

  it('allows longer timeouts than a unit test', () => {
    const timeout = defineIntegrationConfig().test?.testTimeout as number
    expect(timeout).toBe(TIMEOUTS.integration.testTimeout)
    expect(timeout).toBeGreaterThan(TIMEOUTS.unit.testTimeout)
  })

  it('keeps the shared environment and coverage settings', () => {
    const config = defineIntegrationConfig()
    expect(config.test?.environment).toBe('node')
    expect(config.test?.coverage).toMatchObject({ provider: 'v8' })
  })
})

describe('ESM package loading on Node 24', () => {
  it('is an ESM package', () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { type: string; exports: Record<string, unknown> }
    expect(pkg.type).toBe('module')
  })

  it('exposes the vitest config through a package export path', async () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { exports: Record<string, unknown> }
    expect(pkg.exports['./vitest']).toBe('./vitest.base.js')

    // The export must be plain JavaScript: a consumer's vitest.config.ts imports
    // it on a clean checkout, before anything has been built.
    const module = await import('../vitest.base.js')
    expect(typeof module.definePackageConfig).toBe('function')
  })

  it('runs on Node 24 or newer', () => {
    expect(Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)).toBeGreaterThanOrEqual(
      24,
    )
  })
})
