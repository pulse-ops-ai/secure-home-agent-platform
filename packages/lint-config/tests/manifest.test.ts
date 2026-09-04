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
import {
  baselineOptions,
  extractEffectivePolicy,
  policyIdFor,
} from '../src/extract-legacy-policy.mjs'
// @ts-ignore
import { buildManifests, shardFor } from '../src/build-manifest.mjs'
// @ts-ignore
import {
  checkGeneratedDrift,
  checkPolicyDrift,
  checkReferentialIntegrity,
} from '../src/check-policy.mjs'
// @ts-ignore
import { validate } from '../validate-schema.mjs'
// @ts-ignore
import { GENERATED_ROLES, generateAll } from '../src/generate-oxlint-config.mjs'
// @ts-ignore
import { canonicalJson } from '../src/canonical.mjs'

const HERE = import.meta.dirname
const load = (p: string): any => JSON.parse(readFileSync(path.join(HERE, '..', p), 'utf8'))
const readCommitted = (p: string): string => readFileSync(path.join(HERE, '..', p), 'utf8')

const POLICY = load('policy.json')
const MAPPINGS = load('engine-mappings.json')
const POLICY_SCHEMA = load('policy.schema.json')
const MAPPING_SCHEMA = load('engine-mappings.schema.json')

const rows = await extractEffectivePolicy()
const baseline = await baselineOptions()
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
  const generatedEntries = (): { path: string; value: unknown; committed: string }[] => {
    const built = generateAll(POLICY, MAPPINGS)
    const manifests = buildManifests(rows, baseline)
    return [
      { path: 'policy.json', value: manifests.policy, committed: readCommitted('policy.json') },
      {
        path: 'engine-mappings.json',
        value: manifests.mappings,
        committed: readCommitted('engine-mappings.json'),
      },
      ...(GENERATED_ROLES as string[]).map((role) => ({
        path: `generated/oxlintrc.${role}.json`,
        value: built[role],
        committed: readCommitted(`generated/oxlintrc.${role}.json`),
      })),
    ]
  }

  it('passes the byte-identity check for every generated authority', async () => {
    expect(await checkGeneratedDrift(generatedEntries(), canonicalJson)).toEqual([])
  })

  it('REPORTS a formatting-only edit, which object equality cannot see', async () => {
    const entries = generatedEntries()
    const target = entries.find((e) => e.path === 'generated/oxlintrc.library.json')!
    const reformatted = JSON.stringify(JSON.parse(target.committed), null, 4)
    expect(JSON.parse(reformatted)).toEqual(JSON.parse(target.committed))
    const problems = await checkGeneratedDrift(
      [{ ...target, committed: reformatted }],
      canonicalJson,
    )
    expect(problems.join('\n')).toMatch(/is not byte-identical to generator output/)
  })

  it('REPORTS a key-order edit, which also parses identically', async () => {
    const entries = generatedEntries()
    const target = entries.find((e) => e.path === 'generated/oxlintrc.library.json')!
    const parsed = JSON.parse(target.committed)
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()), null, 2)
    expect(JSON.parse(reordered)).toEqual(parsed)
    const problems = await checkGeneratedDrift([{ ...target, committed: reordered }], canonicalJson)
    expect(problems).toHaveLength(1)
  })

  it('reproduces the committed manifests BYTE for byte', async () => {
    // Byte identity, not object equality. AUTH-LINT-CONFIG must be
    // byte-identical to generator output, and an object comparison accepts
    // whitespace and key-order changes -- so a committed authority could be
    // edited into something the generator would never emit and still report
    // clean. That is the check this test previously failed to be.
    const built = buildManifests(rows, baseline)
    expect(await canonicalJson(built.policy)).toBe(readCommitted('policy.json'))
    expect(await canonicalJson(built.mappings)).toBe(readCommitted('engine-mappings.json'))
  })

  it('reproduces the same semantic content, so a byte failure is a real one', () => {
    const built = buildManifests(rows, baseline)
    expect(built.policy).toEqual(POLICY)
    expect(built.mappings).toEqual(MAPPINGS)
  })

  it('finds no drift against the live configuration', () => {
    expect(checkPolicyDrift(POLICY, MAPPINGS, rows, policyIdFor)).toEqual([])
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
    expect(checkPolicyDrift(POLICY, MAPPINGS, extra, policyIdFor).join('\n')).toMatch(
      /the engine enforces "newly-enabled-rule" but no policy row claims it/,
    )
  })

  it('sees a policy the engine no longer enforces', () => {
    const fewer = rows.filter((r: any) => r.ruleId !== 'no-console')
    expect(checkPolicyDrift(POLICY, MAPPINGS, fewer, policyIdFor).join('\n')).toMatch(
      /policy claims "no-console" but the engine no longer enforces it/,
    )
  })

  it('sees a role change, which silently alters what blocks where', () => {
    const moved = clone(rows)
    const target = moved.find((r: any) => r.ruleId === 'no-console')
    target.roles = ['library']
    expect(checkPolicyDrift(POLICY, MAPPINGS, moved, policyIdFor).join('\n')).toMatch(
      /claims roles \[.*\] but the engine blocks it in \[library\]/,
    )
  })

  it('sees a policy downgraded out of blocking', () => {
    const weakened = clone(POLICY)
    weakened.policies[0].blocking = false
    expect(checkPolicyDrift(weakened, MAPPINGS, rows, policyIdFor).join('\n')).toMatch(
      /is not blocking/,
    )
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
  it('maps every policy to the replacement engine without claiming it works', () => {
    const replacement = MAPPINGS.mappings.filter((m: any) => m.engine === 'replacement')
    expect(replacement).toHaveLength(117)
    // 112 through a rule, 5 through the parser. Both count as mapped.
    const byMechanism = replacement.reduce((acc: Record<string, number>, m: any) => {
      acc[m.mechanism] = (acc[m.mechanism] ?? 0) + 1
      return acc
    }, {})
    expect(byMechanism).toEqual({ rule: 112, parser: 5 })
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

/** Parser-enforced on the REPLACEMENT engine. */
const PARSE_ENFORCED = [
  'no-dupe-args',
  'no-octal',
  'no-delete-var',
  'no-nonoctal-decimal-escape',
  'no-with',
]

/** Parser-enforced on the LEGACY engine too. A strict subset -- see below. */
const LEGACY_PARSE_ENFORCED = ['no-dupe-args', 'no-octal', 'no-nonoctal-decimal-escape', 'no-with']

describe('parse-level enforcement', () => {
  it('maps the strict-mode syntax policies to the replacement parser, not a rule', () => {
    // Discovered behaviourally: the replacement engine has no `no-dupe-args` or
    // `no-octal` rule to configure, and reports both with ZERO rules enabled.
    // A registration probe alone would have read that as the policy being
    // unavailable, when it is in fact enforced before any rule runs.
    for (const id of ['no-dupe-args', 'no-octal']) {
      const row = MAPPINGS.mappings.find((m: any) => m.policy === id && m.engine === 'replacement')
      expect(row.mechanism).toBe('parser')
      expect(row.parserMechanism).toBeTruthy()
      expect(row.ruleId).toBeUndefined()
    }
  })

  it('maps them to the parser on the LEGACY side too, because ESLint cannot fire them', () => {
    // Four of the five, not all of them. These are strict-mode syntax errors
    // that ESLint reports as a fatal parse error with no rule id, so recording
    // them as rules would claim an attribution the engine never produces.
    //
    // no-delete-var is the exception, and it is the interesting one: the
    // repository parses .ts with the TypeScript parser, which ACCEPTS
    // `delete localBinding` and lets the rule fire normally. The replacement
    // engine still rejects it at parse time. So one policy is a rule on one
    // engine and a parser fact on the other, which is why mechanism is a
    // per-engine field rather than a property of the policy.
    for (const id of LEGACY_PARSE_ENFORCED) {
      const row = MAPPINGS.mappings.find((m: any) => m.policy === id && m.engine === 'legacy')
      expect(row.mechanism).toBe('parser')
      expect(row.parserMechanism).toBeTruthy()
    }
  })

  it('still allocates them to the lint engine, not to another disposition', () => {
    // Parse-level enforcement is HOW the engine realises the policy. It does not
    // move ownership to the compiler or a dedicated gate.
    for (const id of PARSE_ENFORCED) {
      const row = POLICY.policies.find((p: any) => p.id === id)
      expect(row.disposition).toBe('MIGRATED_TO_NEW_LINT_ENGINE')
    }
  })
})

describe('the generated engine configuration', () => {
  it('is reproducible from the authorities alone, BYTE for byte', async () => {
    const built = generateAll(POLICY, MAPPINGS)
    for (const role of GENERATED_ROLES as string[]) {
      expect(
        await canonicalJson(built[role]),
        `generated/oxlintrc.${role}.json is not the generator's output`,
      ).toBe(readCommitted(`generated/oxlintrc.${role}.json`))
    }
  })

  it('fails on a formatting-only edit, where semantic equality would pass', async () => {
    // The hostile case for byte identity. The JSON parses to exactly the same
    // object; only whitespace moved. Object comparison cannot see this.
    const committed = readCommitted('generated/oxlintrc.library.json')
    const reformatted = JSON.stringify(JSON.parse(committed), null, 4)
    expect(JSON.parse(reformatted)).toEqual(JSON.parse(committed))
    expect(reformatted).not.toBe(committed)

    const built = await canonicalJson(generateAll(POLICY, MAPPINGS)['library'])
    expect(built).toBe(committed)
    expect(built).not.toBe(reformatted)
  })

  it('fails on a key-order edit, which also parses identically', async () => {
    const committed = readCommitted('generated/oxlintrc.library.json')
    const parsed = JSON.parse(committed)
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()), null, 2)
    expect(JSON.parse(reordered)).toEqual(parsed)
    expect(await canonicalJson(parsed)).not.toBe(reordered)
  })

  it('serializes idempotently, so the canonical form is a fixed point', async () => {
    const committed = readCommitted('generated/oxlintrc.library.json')
    expect(await canonicalJson(JSON.parse(committed))).toBe(committed)
  })

  it('disables ambient engine defaults in every role', () => {
    // An engine default is not repository policy. If a rule is not in
    // policy.json nobody decided it, and a failure nobody decided is
    // indistinguishable from a bug in the gate.
    for (const role of GENERATED_ROLES as string[]) {
      expect(load(`generated/oxlintrc.${role}.json`).categories).toEqual({})
    }
  })

  it('enables exactly the rule-mapped policies of each role', () => {
    for (const role of GENERATED_ROLES as string[]) {
      const expected = POLICY.policies.filter(
        (p: any) =>
          p.roles.includes(role) &&
          MAPPINGS.mappings.find((m: any) => m.policy === p.id && m.engine === 'replacement')
            .mechanism === 'rule',
      ).length
      expect(Object.keys(load(`generated/oxlintrc.${role}.json`).rules)).toHaveLength(expected)
    }
  })

  it('takes severity from the policy, never from the engine default', () => {
    const cfg = load('generated/oxlintrc.library.json')
    // A rule is either a bare severity or [severity, ...options]. Every current
    // policy blocks, so every entry must resolve to `error` either way.
    const severities = Object.values(cfg.rules).map((entry) =>
      Array.isArray(entry) ? entry[0] : entry,
    )
    expect(new Set(severities)).toEqual(new Set(['error']))
  })

  it('carries the authored options through to the engine', () => {
    // Seven policies were authored with options here; the rest inherit engine
    // defaults nobody decided. A rule such as no-restricted-globals with no
    // restrictions permits everything, so dropping options would produce a
    // config that loads, reports nothing, and looks enforced.
    const withOptions = POLICY.policies.filter((p: any) => p.options !== undefined)
    expect(withOptions).toHaveLength(7)

    const cfg = load('generated/oxlintrc.library.json')
    expect(Array.isArray(cfg.rules['no-restricted-globals'])).toBe(true)
    expect(JSON.stringify(cfg.rules['no-restricted-globals'])).toMatch(/process/)
  })

  it('does not claim engine defaults as repository policy', () => {
    // preserve-caught-error resolves with `errorClassNames`, an option this
    // repository never wrote and which the replacement engine rejects outright.
    // If a resolved default were lifted into the manifest, the generated config
    // would fail to load -- which is how this was found.
    const row = POLICY.policies.find((p: any) => p.id === 'preserve-caught-error')
    expect(row.options).toBeUndefined()
    expect(JSON.stringify(POLICY)).not.toMatch(/errorClassNames/)
  })

  it('carries no formatting rule, because Prettier is the sole authority', () => {
    for (const role of GENERATED_ROLES as string[]) {
      const rules = Object.keys(load(`generated/oxlintrc.${role}.json`).rules)
      for (const formatting of ['indent', 'quotes', 'semi', 'comma-dangle', 'max-len']) {
        expect(rules).not.toContain(formatting)
      }
    }
  })

  it('refuses to generate when a policy has no replacement mapping', () => {
    const orphaned = clone(MAPPINGS)
    orphaned.mappings = orphaned.mappings.filter((m: any) => m.engine !== 'replacement')
    expect(() => generateAll(POLICY, orphaned)).toThrow(/has no replacement mapping/)
  })

  it('drifts visibly when a mapping changes', () => {
    const changed = clone(MAPPINGS)
    const row = changed.mappings.find(
      (m: any) => m.policy === 'no-console' && m.engine === 'replacement',
    )
    row.ruleId = 'renamed-by-the-engine'
    const built = generateAll(POLICY, changed)
    expect(built['library']).not.toEqual(load('generated/oxlintrc.library.json'))
  })
})
