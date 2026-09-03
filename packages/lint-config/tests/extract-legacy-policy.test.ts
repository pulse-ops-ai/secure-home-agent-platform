/**
 * The legacy extraction oracle.
 *
 * The policy is whatever the engine ACTUALLY enforces. `base.js` lists roughly
 * thirty rules and the effective set is 117, so a test that agreed with the
 * config source would be agreeing with the wrong thing. These assertions are
 * against the resolved configuration, through the real ESLint API.
 */
import { describe, expect, it } from 'vitest'

// @ts-ignore -- dependency-free .mjs oracle, deliberately untyped
import {
  ROLE_PROBES,
  extractEffectivePolicy,
  extractIgnores,
  optionsOf,
  policyIdFor,
  severityOf,
} from '../src/extract-legacy-policy.mjs'

type Row = { ruleId: string; roles: string[]; options: Record<string, unknown[]> }

const rows = (await extractEffectivePolicy()) as Row[]

describe('the effective blocking policy', () => {
  it('resolves 117 identities, the number the engine really enforces', () => {
    expect(rows).toHaveLength(117)
  })

  it('splits 46 type-aware and 71 core, which the config source alone cannot tell you', () => {
    const typed = rows.filter((r) => r.ruleId.startsWith('@typescript-eslint/'))
    expect(typed).toHaveLength(46)
    expect(rows.length - typed.length).toBe(71)
  })

  it('captures rules INHERITED from the recommended presets, not just authored ones', () => {
    // Nothing in base.js names these; they arrive through js.configs.recommended
    // and recommendedTypeChecked. An extractor that read the config source would
    // miss every one of them.
    for (const inherited of ['no-empty', 'no-cond-assign', 'no-dupe-keys']) {
      expect(rows.map((r) => r.ruleId)).toContain(inherited)
    }
  })

  it('captures explicitly authored rules with their exact options', () => {
    const eqeqeq = rows.find((r) => r.ruleId === 'eqeqeq')
    expect(eqeqeq?.options['library']).toEqual(['always', { null: 'ignore' }])
  })

  it('records every role a rule blocks in', () => {
    const noConsole = rows.find((r) => r.ruleId === 'no-console')
    // Off in the two CONFIG roles, because configFileOverrides turns it off.
    // Still on for test files -- see the dead-export finding below.
    expect(noConsole?.roles).toEqual(['application', 'library', 'service', 'test'])
  })

  it('keeps a rule out of the roles whose config turns it OFF', () => {
    const boundary = rows.find(
      (r) => r.ruleId === '@typescript-eslint/explicit-module-boundary-types',
    )
    // service and application both switch it off; the config roles do too.
    expect(boundary?.roles).toEqual(['library', 'test'])
  })

  it('records that the authored `test` role is NOT in force anywhere', () => {
    // A finding, asserted so it cannot be assumed away during the engine swap.
    //
    // `@secure-home/eslint-config/test` relaxes no-console, the unsafe-* rules,
    // no-explicit-any, and the process restrictions for test files. NO member
    // composes that export -- every eslint.config.js uses library, service, or
    // application -- so test sources inherit the full role rules instead.
    //
    // The effective policy is therefore STRICTER than the config's own comments
    // describe. Migrating the documented intent rather than the resolved
    // behaviour would silently relax four rules on every test file in the
    // repository, which is precisely the class of drift the manifest exists to
    // prevent.
    for (const stillOn of [
      'no-console',
      'no-restricted-globals',
      'no-restricted-properties',
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-unsafe-assignment',
    ]) {
      const row = rows.find((r) => r.ruleId === stillOn)
      expect(row?.roles, `${stillOn} should still block on test sources`).toContain('test')
    }
  })

  it('keeps type-aware rules out of the JavaScript-config role', () => {
    const floating = rows.find((r) => r.ruleId === '@typescript-eslint/no-floating-promises')
    expect(floating?.roles).not.toContain('js-config')
  })

  it('proves the js-config role is not redundant with config-file', () => {
    // If these collapsed, the JavaScript-config behaviour would vanish from the
    // policy entirely.
    const jsOnly = rows.filter((r) => r.roles.includes('js-config') && !r.roles.includes('library'))
    expect(jsOnly.length).toBeGreaterThan(0)
  })
})

describe('policy identity is repository-owned', () => {
  it('derives a unique, schema-valid id for all 117 rules', () => {
    const taken = new Set<string>()
    const ids = rows.map((r) => {
      const id = policyIdFor(r.ruleId, taken) as string
      taken.add(id)
      return id
    })
    expect(new Set(ids).size).toBe(117)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
  })

  it('drops the vendor prefix, so an engine change cannot rename a policy', () => {
    expect(policyIdFor('@typescript-eslint/no-floating-promises')).toBe('no-floating-promises')
    expect(policyIdFor('no-console')).toBe('no-console')
  })

  it('keeps a core rule and its typed namesake distinct instead of overwriting', () => {
    const taken = new Set(['no-unused-vars'])
    expect(policyIdFor('@typescript-eslint/no-unused-vars', taken)).toBe('typed-no-unused-vars')
  })

  it('refuses rather than inventing a third id', () => {
    const taken = new Set(['no-unused-vars', 'typed-no-unused-vars'])
    expect(() => policyIdFor('@typescript-eslint/no-unused-vars', taken)).toThrow(
      /cannot derive a unique policy id/,
    )
  })
})

describe('severity and options normalization', () => {
  it.each([
    [2, 'error'],
    ['error', 'error'],
    [['error', { a: 1 }], 'error'],
    [1, 'warn'],
    ['warn', 'warn'],
    [0, 'off'],
    ['off', 'off'],
  ])('normalizes %j to %s', (entry, expected) => {
    expect(severityOf(entry)).toBe(expected)
  })

  it('separates options from severity', () => {
    expect(optionsOf(['error', { a: 1 }])).toEqual([{ a: 1 }])
    expect(optionsOf('error')).toEqual([])
  })
})

describe('what is not linted is also policy', () => {
  it('agrees with the engine on every ignore probe', async () => {
    const rows = (await extractIgnores()) as {
      path: string
      ignored: boolean
      actual: boolean
      why: string
    }[]
    for (const row of rows) {
      expect(row.actual, `${row.path} (${row.why})`).toBe(row.ignored)
    }
  })

  it('covers both sides, so an ignore-everything engine would fail it', async () => {
    const rows = (await extractIgnores()) as { ignored: boolean }[]
    expect(rows.some((r) => r.ignored)).toBe(true)
    expect(rows.some((r) => !r.ignored)).toBe(true)
  })
})

describe('the probe set', () => {
  it('covers every role the policy schema admits', () => {
    expect((ROLE_PROBES as { role: string }[]).map((p) => p.role).sort()).toEqual([
      'application',
      'config-file',
      'js-config',
      'library',
      'service',
      'test',
    ])
  })
})
