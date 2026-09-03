/**
 * The committed manifests, and the checks that keep them honest.
 *
 * Committed policy is a CLAIM about a live configuration. A claim nobody
 * re-derives is a comment, so these tests regenerate from the engine and
 * compare, then break each invariant deliberately to show the checker sees it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore -- dependency-free .mjs modules, deliberately untyped
import { extractEffectivePolicy } from '../src/extract-legacy-policy.mjs'
// @ts-ignore
import { buildManifests, shardFor } from '../src/build-manifest.mjs'
// @ts-ignore
import { checkPolicyDrift, checkReferentialIntegrity } from '../src/check-policy.mjs'
// @ts-ignore
import { validate } from '../validate-schema.mjs'

const HERE = import.meta.dirname
const load = (p: string): any => JSON.parse(readFileSync(path.join(HERE, '..', p), 'utf8'))

const POLICY = load('policy.json')
const MAPPINGS = load('engine-mappings.json')
const POLICY_SCHEMA = load('policy.schema.json')
const MAPPING_SCHEMA = load('engine-mappings.schema.json')

const rows = await extractEffectivePolicy()
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('the committed manifests', () => {
  it('cover all 117 policies with a legacy and a replacement mapping each', () => {
    expect(POLICY.policies).toHaveLength(117)
    expect(MAPPINGS.mappings).toHaveLength(234)
  })

  it('validate against their own schemas', () => {
    expect(validate(POLICY, POLICY_SCHEMA)).toEqual([])
    expect(validate(MAPPINGS, MAPPING_SCHEMA)).toEqual([])
  })

  it('allocate every row to MIGRATED_TO_NEW_LINT_ENGINE', () => {
    // The accepted allocation. None goes to the compiler or a dedicated gate.
    const dispositions = new Set(POLICY.policies.map((p: any) => p.disposition))
    expect([...dispositions]).toEqual(['MIGRATED_TO_NEW_LINT_ENGINE'])
  })

  it('records every policy as blocking, because every current policy blocks', () => {
    expect(POLICY.policies.every((p: any) => p.blocking === true)).toBe(true)
  })

  it('carries no vendor identity in the semantic authority', () => {
    for (const row of POLICY.policies) {
      expect(JSON.stringify(row)).not.toMatch(/@typescript-eslint\//)
    }
  })

  it('partitions the 117 across the six shards, totalling exactly 117', () => {
    const counts: Record<string, number> = {}
    for (const p of POLICY.policies) counts[p.proof.shard] = (counts[p.proof.shard] ?? 0) + 1
    expect(counts).toEqual({
      'parser-syntax': 24,
      'core-control': 31,
      'core-policy': 16,
      'typescript-static': 22,
      'typescript-typed-control': 11,
      'typescript-typed-unsafe': 13,
    })
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(117)
  })

  it('gives every row a distinct positive and negative proof file', () => {
    const seen = new Set<string>()
    for (const p of POLICY.policies) {
      expect(p.proof.valid).not.toBe(p.proof.invalid)
      for (const f of [p.proof.valid, p.proof.invalid]) {
        expect(seen.has(f), `${f} is claimed twice`).toBe(false)
        seen.add(f)
      }
    }
  })
})

describe('regeneration is deterministic and matches the engine', () => {
  it('reproduces the committed bytes exactly', () => {
    const built = buildManifests(rows)
    expect(built.policy).toEqual(POLICY)
    expect(built.mappings).toEqual(MAPPINGS)
  })

  it('finds no drift against the live configuration', () => {
    expect(checkPolicyDrift(POLICY, MAPPINGS, rows)).toEqual([])
  })

  it('derives type-awareness from the engine rather than a hand list', () => {
    // A TypeScript rule surviving into js-config cannot need type information,
    // because that role disables every type-aware rule.
    expect(shardFor('@typescript-eslint/no-explicit-any', { typeAware: false })).toBe(
      'typescript-static',
    )
    expect(shardFor('@typescript-eslint/no-floating-promises', { typeAware: true })).toBe(
      'typescript-typed-control',
    )
    expect(shardFor('@typescript-eslint/no-unsafe-return', { typeAware: true })).toBe(
      'typescript-typed-unsafe',
    )
  })

  it('refuses to invent a shard for an unclassified core rule', () => {
    expect(() => shardFor('some-brand-new-core-rule', { typeAware: false })).toThrow(
      /no shard assigned/,
    )
  })
})

describe('drift the manifest must catch', () => {
  it('sees a rule the engine enforces that no policy claims', () => {
    const extra = [...rows, { ruleId: 'newly-enabled-rule', roles: ['library'], options: {} }]
    expect(checkPolicyDrift(POLICY, MAPPINGS, extra).join('\n')).toMatch(
      /the engine enforces "newly-enabled-rule" but no policy row claims it/,
    )
  })

  it('sees a policy the engine no longer enforces', () => {
    const fewer = rows.filter((r: any) => r.ruleId !== 'no-console')
    expect(checkPolicyDrift(POLICY, MAPPINGS, fewer).join('\n')).toMatch(
      /policy claims "no-console" but the engine no longer enforces it/,
    )
  })

  it('sees a role change, which silently alters what blocks where', () => {
    const moved = clone(rows)
    const target = moved.find((r: any) => r.ruleId === 'no-console')
    target.roles = ['library']
    expect(checkPolicyDrift(POLICY, MAPPINGS, moved).join('\n')).toMatch(
      /claims roles \[.*\] but the engine blocks it in \[library\]/,
    )
  })

  it('sees a policy downgraded out of blocking', () => {
    const weakened = clone(POLICY)
    weakened.policies[0].blocking = false
    expect(checkPolicyDrift(weakened, MAPPINGS, rows).join('\n')).toMatch(/is not blocking/)
  })
})

describe('referential integrity between the two authorities', () => {
  it('accepts the committed pair', () => {
    expect(checkReferentialIntegrity(POLICY, MAPPINGS)).toEqual([])
  })

  it('catches a duplicate policy identity', () => {
    const dup = clone(POLICY)
    dup.policies.push(clone(dup.policies[0]))
    expect(checkReferentialIntegrity(dup, MAPPINGS).join('\n')).toMatch(
      /is declared more than once/,
    )
  })

  it('catches a policy left without one of its engines', () => {
    const missing = clone(MAPPINGS)
    missing.mappings = missing.mappings.filter(
      (m: any) => !(m.policy === POLICY.policies[0].id && m.engine === 'replacement'),
    )
    expect(checkReferentialIntegrity(POLICY, missing).join('\n')).toMatch(
      /has no replacement mapping, so one engine would not enforce it/,
    )
  })

  it('catches an orphan mapping', () => {
    const orphan = clone(MAPPINGS)
    orphan.mappings.push({
      policy: 'not-a-policy',
      engine: 'legacy',
      mechanism: 'rule',
      ruleId: 'x',
    })
    expect(checkReferentialIntegrity(POLICY, orphan).join('\n')).toMatch(
      /references no known policy/,
    )
  })

  it('catches a duplicated mapping for one engine', () => {
    const twice = clone(MAPPINGS)
    twice.mappings.push(clone(twice.mappings[0]))
    expect(checkReferentialIntegrity(POLICY, twice).join('\n')).toMatch(
      /has more than one legacy mapping/,
    )
  })

  it('catches a vendor identity smuggled into a policy id', () => {
    const vendor = clone(POLICY)
    vendor.policies[0].id = '@typescript-eslint/no-explicit-any'
    expect(checkReferentialIntegrity(vendor, MAPPINGS).join('\n')).toMatch(
      /carries a vendor-shaped identity/,
    )
  })

  it('catches proof pointing outside its own shard', () => {
    const stray = clone(POLICY)
    stray.policies[0].proof.valid = 'core-policy/valid/elsewhere.ts'
    stray.policies[0].proof.shard = 'parser-syntax'
    expect(checkReferentialIntegrity(stray, MAPPINGS).join('\n')).toMatch(
      /points at proof outside its own shard/,
    )
  })

  it('catches one file used as both the positive and negative case', () => {
    const same = clone(POLICY)
    same.policies[0].proof.invalid = same.policies[0].proof.valid
    expect(checkReferentialIntegrity(same, MAPPINGS).join('\n')).toMatch(
      /uses one file as both its positive and negative case/,
    )
  })

  it('catches an ambiguous repeated role', () => {
    const repeated = clone(POLICY)
    repeated.policies[0].roles = ['library', 'library']
    expect(checkReferentialIntegrity(repeated, MAPPINGS).join('\n')).toMatch(/repeats a role/)
  })
})

describe('replacement mappings are hypotheses, not evidence', () => {
  it('names an engine rule for every policy without claiming it works', () => {
    const replacement = MAPPINGS.mappings.filter((m: any) => m.engine === 'replacement')
    expect(replacement).toHaveLength(117)
    // Nothing in the manifest records a parity result. Only the fixture shards
    // can, and until they exist these rows are unproven by construction.
    expect(JSON.stringify(MAPPINGS)).not.toMatch(/proven|verified|parity/i)
  })

  it('translates TypeScript rules into the replacement plugin namespace', () => {
    const row = MAPPINGS.mappings.find(
      (m: any) => m.policy === 'no-floating-promises' && m.engine === 'replacement',
    )
    expect(row.ruleId).toBe('typescript/no-floating-promises')
  })
})
