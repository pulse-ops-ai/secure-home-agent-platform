/**
 * The legacy extraction oracle.
 *
 * The policy is whatever the engine ACTUALLY enforces. `base.js` lists roughly
 * thirty rules and the effective set is 117, so a test that agreed with the
 * config source would be agreeing with the wrong thing. Every assertion here is
 * against the resolved configuration, through the real ESLint API.
 */
import { describe, expect, it } from 'vitest'

// @ts-ignore -- dependency-free .mjs oracle, deliberately untyped
import {
  MEMBER_TEST_PROBE,
  ROLE_PROBES,
  extractEffectivePolicy,
  extractIgnores,
  optionsOf,
  policyIdFor,
  severityOf,
} from '../src/extract-legacy-policy.mjs'

type Row = { ruleId: string; roles: string[]; options: Record<string, unknown[]> }

const rows = (await extractEffectivePolicy()) as Row[]
const rule = (id: string): Row | undefined => rows.find((r) => r.ruleId === id)

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
    // and recommendedTypeChecked. An extractor reading the config source would
    // miss every one of them.
    for (const inherited of ['no-empty', 'no-cond-assign', 'no-dupe-keys']) {
      expect(rows.map((r) => r.ruleId)).toContain(inherited)
    }
  })

  it('captures explicitly authored rules with their exact options', () => {
    expect(rule('eqeqeq')?.options['library']).toEqual(['always', { null: 'ignore' }])
  })

  it('keeps a rule out of the roles whose config turns it OFF', () => {
    // service and application switch it off; both config roles do too. It
    // survives at the adapter entry because that role relaxes only three rules,
    // and this is not one of them.
    expect(rule('@typescript-eslint/explicit-module-boundary-types')?.roles).toEqual([
      'adapter-bin',
      'library',
    ])
  })

  it('keeps type-aware rules out of the JavaScript-config role', () => {
    expect(rule('@typescript-eslint/no-floating-promises')?.roles).not.toContain('js-config')
  })

  it('proves the js-config role is not redundant with config-file', () => {
    // If these collapsed, the JavaScript-config behaviour would vanish entirely.
    const jsOnly = rows.filter((r) => r.roles.includes('js-config') && !r.roles.includes('library'))
    expect(jsOnly.length).toBeGreaterThan(0)
  })
})

describe('member-role assignment and the exported test role are separate facts', () => {
  it('resolves an ordinary test file to its MEMBER role, not the exported one', async () => {
    // REQ-LP-004. No member composes `@secure-home/eslint-config/test`, so a
    // `.test.ts` inside a library member gets EXACTLY the library rules.
    // Asserted rather than assumed, because assuming it is how the exported
    // role's relaxations would silently leak onto every test file.
    const probe = MEMBER_TEST_PROBE as { member: string; file: string }
    const asTest = (await extractEffectivePolicy({
      probes: [{ role: 'probe', member: probe.member, file: probe.file }],
      includeExportedTestRole: false,
    })) as Row[]
    const asSource = (await extractEffectivePolicy({
      probes: [{ role: 'probe', member: probe.member, file: 'src/index.ts' }],
      includeExportedTestRole: false,
    })) as Row[]
    expect(asTest.map((r) => r.ruleId).sort()).toEqual(asSource.map((r) => r.ruleId).sort())
  })

  it('models the exported test role as a real but unconsumed contract', () => {
    // It IS more permissive -- that is the contract it exports. What it must
    // not do is apply to anything, because nothing composes it.
    expect(rows.filter((r) => r.roles.includes('exported-test'))).toHaveLength(91)
    for (const relaxed of [
      'no-console',
      'no-restricted-globals',
      'no-restricted-properties',
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-unsafe-assignment',
    ]) {
      expect(rule(relaxed)?.roles, `${relaxed} is relaxed by the exported role`).not.toContain(
        'exported-test',
      )
      expect(rule(relaxed)?.roles, `${relaxed} still blocks for library members`).toContain(
        'library',
      )
    }
  })

  it('offers no bare `test` role, which would blur the two facts', () => {
    expect(rows.flatMap((r) => r.roles)).not.toContain('test')
  })
})

describe('the coding-adapter process entry', () => {
  it('relaxes exactly the three rules its declared boundary needs', () => {
    for (const relaxed of ['no-console', 'no-restricted-globals', 'no-restricted-properties']) {
      expect(rule(relaxed)?.roles).not.toContain('adapter-bin')
    }
    expect(rows.filter((r) => r.roles.includes('adapter-bin'))).toHaveLength(96)
  })

  it('keeps every other library restriction in force at that entry', () => {
    for (const stillOn of [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-explicit-any',
      'eqeqeq',
    ]) {
      expect(rule(stillOn)?.roles).toContain('adapter-bin')
    }
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
    const probes = (await extractIgnores()) as {
      path: string
      ignored: boolean
      actual: boolean
      why: string
    }[]
    for (const probe of probes) {
      expect(probe.actual, `${probe.path} (${probe.why})`).toBe(probe.ignored)
    }
  })

  it('covers both sides, so an ignore-everything engine would fail it', async () => {
    const probes = (await extractIgnores()) as { ignored: boolean }[]
    expect(probes.some((p) => p.ignored)).toBe(true)
    expect(probes.some((p) => !p.ignored)).toBe(true)
  })
})

describe('the probe set', () => {
  it('covers every member role plus the adapter entry', () => {
    expect((ROLE_PROBES as { role: string }[]).map((p) => p.role).sort()).toEqual([
      'adapter-bin',
      'application',
      'config-file',
      'js-config',
      'library',
      'service',
    ])
  })
})
