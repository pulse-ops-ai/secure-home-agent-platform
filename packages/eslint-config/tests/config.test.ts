/**
 * Tests for the shared ESLint configuration.
 *
 * A lint config that is never tested drifts silently: a rule can be disabled by
 * an ordering mistake and nothing fails. These tests run the real ESLint API
 * against real fixtures, so a rule that stops firing breaks the build.
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

import application from '../application.js'
import base from '../base.js'
import library from '../library.js'
import node from '../node.js'
import service from '../service.js'
import test from '../test.js'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

/** Lint one fixture with the library config and return the rule ids that fired. */
async function rulesFiredOn(fixture: string): Promise<string[]> {
  const overrideConfig = [
    ...(library as unknown[]),
    { languageOptions: { parserOptions: { tsconfigRootDir: FIXTURES } } },
  ] as ConstructorParameters<typeof ESLint>[0] extends { overrideConfig?: infer C }
    ? NonNullable<C>
    : never

  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig, cwd: FIXTURES })
  const results = await eslint.lintFiles([join(FIXTURES, fixture)])
  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'fatal'))
}

describe('exports', () => {
  it.each([
    ['base', base],
    ['node', node],
    ['library', library],
    ['service', service],
    ['application', application],
    ['test', test],
  ])('%s loads and is a non-empty flat config array', (_name, config) => {
    expect(Array.isArray(config)).toBe(true)
    expect(config.length).toBeGreaterThan(0)
  })

  it('ignores generated output so dist is never linted', () => {
    const ignorePatterns = base.flatMap((c) => (c as { ignores?: string[] }).ignores ?? [])
    expect(ignorePatterns).toContain('**/dist/**')
    expect(ignorePatterns).toContain('**/coverage/**')
  })
})

describe('a valid fixture passes', () => {
  it('reports nothing', async () => {
    expect(await rulesFiredOn('valid.ts')).toEqual([])
  })
})

describe('invalid fixtures fail for the intended rule', () => {
  it.each([
    ['floating-promise.ts', '@typescript-eslint/no-floating-promises'],
    ['unused-var.ts', '@typescript-eslint/no-unused-vars'],
    ['explicit-any.ts', '@typescript-eslint/no-explicit-any'],
    ['console.ts', 'no-console'],
  ])('%s fires %s', async (fixture, rule) => {
    expect(await rulesFiredOn(fixture)).toContain(rule)
  })
})

describe('role configs differ where they should', () => {
  const boundaryTypes = '@typescript-eslint/explicit-module-boundary-types'

  function ruleSetting(config: unknown[], rule: string): unknown {
    // Last matching block wins in flat config.
    let setting: unknown
    for (const block of config) {
      const rules = (block as { rules?: Record<string, unknown>; files?: unknown }).rules
      if (rules && rule in rules && !(block as { files?: unknown }).files) setting = rules[rule]
    }
    return setting
  }

  it('a library states its exported signatures', () => {
    expect(ruleSetting(library, boundaryTypes)).toBe('error')
  })

  it('a service and an application do not — they are composition roots', () => {
    expect(ruleSetting(service, boundaryTypes)).toBe('off')
    expect(ruleSetting(application, boundaryTypes)).toBe('off')
  })

  it('a library may not read process state; a service may', () => {
    expect(ruleSetting(library, 'no-restricted-properties')).toBeDefined()
    expect(ruleSetting(service, 'no-restricted-properties')).toBeUndefined()
  })
})

describe('framework neutrality', () => {
  it('adds no NestJS, Next.js, React, or Zod rule', () => {
    const allRules = library.flatMap((block) =>
      Object.keys((block as { rules?: Record<string, unknown> }).rules ?? {}),
    )
    const frameworkish = allRules.filter((r) => /nest|next|react|zod|jsx/i.test(r))
    expect(frameworkish).toEqual([])
  })

  it('adds no formatting rule — Prettier is the single formatting authority', () => {
    const allRules = library.flatMap((block) =>
      Object.keys((block as { rules?: Record<string, unknown> }).rules ?? {}),
    )
    const formatting = allRules.filter((r) =>
      /^(indent|quotes|semi|comma-dangle|max-len)$|^@stylistic\//.test(r),
    )
    expect(formatting).toEqual([])
  })
})
