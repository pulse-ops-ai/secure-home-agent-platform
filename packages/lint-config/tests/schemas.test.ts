/**
 * The three closed schemas of the lint-policy authority.
 *
 * These are contract tests, so every case asserts a REFUSAL for a specific
 * reason rather than merely a non-empty error list. A schema that rejected
 * everything would pass a weaker suite and be useless.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// eslint-disable-next-line
// @ts-ignore -- dependency-free .mjs validator, deliberately untyped
import { validate } from '../validate-schema.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const load = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(HERE, '..', p), 'utf8')) as Record<string, unknown>

const POLICY_SCHEMA = load('policy.schema.json')
const MAPPING_SCHEMA = load('engine-mappings.schema.json')
const BOUNDARY_SCHEMA = JSON.parse(
  readFileSync(
    path.join(HERE, '..', '..', '..', 'scripts', 'toolchain-boundaries.schema.json'),
    'utf8',
  ),
) as Record<string, unknown>

const errors = (doc: unknown, schema: Record<string, unknown>): string[] =>
  validate(doc, schema) as string[]

const policyRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'no-floating-promises',
  intent: 'An unawaited promise surfaces as an unhandled rejection in production.',
  roles: ['library', 'service'],
  blocking: true,
  disposition: 'PRESERVED_NATIVE',
  proof: {
    shard: 'typescript-typed-control',
    valid: 'valid/awaited.ts',
    invalid: 'invalid/floating.ts',
  },
  ...over,
})

const policyDoc = (rows: unknown[]): Record<string, unknown> => ({
  schemaVersion: 1,
  policies: rows,
})

const mappingDoc = (rows: unknown[]): Record<string, unknown> => ({
  schemaVersion: 1,
  engines: ['legacy', 'replacement'],
  mappings: rows,
})

// ── positive controls ───────────────────────────────────────────────────────

describe('minimal valid documents', () => {
  it('accepts a minimal semantic policy', () => {
    expect(errors(policyDoc([policyRow()]), POLICY_SCHEMA)).toEqual([])
  })

  it('accepts minimal engine mappings for both engines', () => {
    const doc = mappingDoc([
      {
        policy: 'no-floating-promises',
        engine: 'legacy',
        mechanism: 'rule',
        ruleId: '@typescript-eslint/no-floating-promises',
      },
      {
        policy: 'no-floating-promises',
        engine: 'replacement',
        mechanism: 'rule',
        ruleId: 'typescript/no-floating-promises',
      },
    ])
    expect(errors(doc, MAPPING_SCHEMA)).toEqual([])
  })

  it('accepts a minimal toolchain-boundary document', () => {
    const doc = {
      schemaVersion: 1,
      compatibilityConsumers: ['scripts/check-source-imports.mjs'],
      normalCompilerEntryPoints: ['typecheck', 'build'],
      platforms: ['ubuntu-24.04', 'ubuntu-24.04-arm'],
      installPosture: { onlyBuiltDependencies: [] },
      maintenanceClasses: [{ id: 'lint-engine', allows: ['engine pin'] }],
      protectedAuthorities: ['packages/lint-config/policy.json'],
      subjectIsolation: {
        deniedToSubject: ['GITHUB_TOKEN'],
        processBoundary: 'container',
        containerControls: ['non-root'],
      },
      genesisState: 'GENESIS_ONLY',
    }
    expect(errors(doc, BOUNDARY_SCHEMA)).toEqual([])
  })
})

// ── the separation that makes an engine replaceable ─────────────────────────

describe('policy authority may not carry engine identity', () => {
  it('refuses an unknown field, which is how a vendor rule id would arrive', () => {
    const doc = policyDoc([policyRow({ ruleId: '@typescript-eslint/no-floating-promises' })])
    expect(errors(doc, POLICY_SCHEMA)).toContain('<root>.policies[0]: unknown field "ruleId"')
  })

  it('refuses a vendor-shaped policy id', () => {
    const doc = policyDoc([policyRow({ id: '@typescript-eslint/no-floating-promises' })])
    expect(errors(doc, POLICY_SCHEMA).join('\n')).toMatch(/policies\[0\]\.id: does not match/)
  })
})

describe('mapping authority may not carry policy semantics', () => {
  it.each(['intent', 'roles', 'blocking', 'options', 'proof', 'disposition'])(
    'refuses the semantic field %s',
    (field) => {
      const doc = mappingDoc([
        { policy: 'p-one', engine: 'legacy', mechanism: 'rule', ruleId: 'r', [field]: 'x' },
      ])
      expect(errors(doc, MAPPING_SCHEMA)).toContain(`<root>.mappings[0]: unknown field "${field}"`)
    },
  )

  it('requires a rule mapping to name the vendor rule it uses', () => {
    const doc = mappingDoc([{ policy: 'p-one', engine: 'legacy', mechanism: 'rule' }])
    expect(errors(doc, MAPPING_SCHEMA)).toContain('<root>.mappings[0]: missing required "ruleId"')
  })

  it('requires an unavailable mapping to say why, so it cannot be a silent drop', () => {
    const doc = mappingDoc([{ policy: 'p-one', engine: 'replacement', mechanism: 'unavailable' }])
    expect(errors(doc, MAPPING_SCHEMA)).toContain(
      '<root>.mappings[0]: missing required "unavailableReason"',
    )
  })

  it('carries no version pin: the catalog is the single version authority', () => {
    const doc = { ...mappingDoc([]), versions: { oxlint: '1.80.0' } }
    expect(errors(doc, MAPPING_SCHEMA)).toContain('<root>: unknown field "versions"')
  })
})

// ── disposition and proof ───────────────────────────────────────────────────

describe('disposition is exactly one allowed outcome', () => {
  it('refuses a missing disposition', () => {
    const row = policyRow()
    delete row['disposition']
    expect(errors(policyDoc([row]), POLICY_SCHEMA)).toContain(
      '<root>.policies[0]: missing required "disposition"',
    )
  })

  it('refuses DROPPED, which Scope 1 does not permit at all', () => {
    const doc = policyDoc([policyRow({ disposition: 'DROPPED' })])
    expect(errors(doc, POLICY_SCHEMA).join('\n')).toMatch(/"DROPPED" is not one of/)
  })

  it('refuses two dispositions, since a JSON object cannot hold a duplicate key', () => {
    // The schema-level guarantee is that `disposition` is a single enum value,
    // so a second outcome can only arrive as an array or an extra field.
    expect(
      errors(policyDoc([policyRow({ disposition: ['A', 'B'] })]), POLICY_SCHEMA).length,
    ).toBeGreaterThan(0)
    expect(errors(policyDoc([policyRow({ disposition2: 'DROPPED' })]), POLICY_SCHEMA)).toContain(
      '<root>.policies[0]: unknown field "disposition2"',
    )
  })
})

describe('every policy row must reference executable proof', () => {
  it('refuses a row with no proof at all', () => {
    const row = policyRow()
    delete row['proof']
    expect(errors(policyDoc([row]), POLICY_SCHEMA)).toContain(
      '<root>.policies[0]: missing required "proof"',
    )
  })

  it.each(['valid', 'invalid', 'shard'])('refuses proof missing %s', (field) => {
    const proof = { ...(policyRow()['proof'] as Record<string, unknown>) }
    delete proof[field]
    expect(errors(policyDoc([policyRow({ proof })]), POLICY_SCHEMA)).toContain(
      `<root>.policies[0].proof: missing required "${field}"`,
    )
  })

  it('refuses a malformed shard id', () => {
    const proof = { ...(policyRow()['proof'] as Record<string, unknown>), shard: 'made-up' }
    expect(errors(policyDoc([policyRow({ proof })]), POLICY_SCHEMA).join('\n')).toMatch(
      /"made-up" is not one of/,
    )
  })

  it('refuses a malformed role', () => {
    expect(
      errors(policyDoc([policyRow({ roles: ['backend'] })]), POLICY_SCHEMA).join('\n'),
    ).toMatch(/"backend" is not one of/)
  })
})

// ── the boundary schema ─────────────────────────────────────────────────────

describe('toolchain boundaries', () => {
  const base = (): Record<string, unknown> => ({
    schemaVersion: 1,
    compatibilityConsumers: ['scripts/check-source-imports.mjs'],
    normalCompilerEntryPoints: ['typecheck'],
    platforms: ['ubuntu-24.04', 'ubuntu-24.04-arm'],
    installPosture: { onlyBuiltDependencies: [] },
    maintenanceClasses: [{ id: 'lint-engine', allows: ['engine pin'] }],
    protectedAuthorities: ['policy'],
    subjectIsolation: {
      deniedToSubject: ['GITHUB_TOKEN'],
      processBoundary: 'container',
      containerControls: ['non-root'],
    },
  })

  it('refuses a non-empty install allowance', () => {
    const doc = base()
    doc['installPosture'] = { onlyBuiltDependencies: ['esbuild'] }
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/more than 0 items/)
  })

  it('refuses a single-platform claim', () => {
    const doc = base()
    doc['platforms'] = ['ubuntu-24.04']
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/fewer than 2 items/)
  })

  it('refuses running the candidate as the launcher itself', () => {
    const doc = base()
    ;(doc['subjectIsolation'] as Record<string, unknown>)['processBoundary'] = 'same-uid'
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/"same-uid" is not one of/)
  })

  it('carries no package version', () => {
    const doc = { ...base(), versions: { oxlint: '1.80.0' } }
    expect(errors(doc, BOUNDARY_SCHEMA)).toContain('<root>: unknown field "versions"')
  })
})

// ── the validator itself ────────────────────────────────────────────────────

describe('the validator refuses what it cannot check', () => {
  it('throws on an unsupported keyword rather than silently ignoring it', () => {
    expect(() => validate({}, { type: 'object', minProperties: 1 })).toThrow(
      /unsupported schema keyword "minProperties"/,
    )
  })
})
