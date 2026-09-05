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
  disposition: 'MIGRATED_TO_NEW_LINT_ENGINE',
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
      maintenanceClasses: [
        {
          id: 'lint-engine',
          allows: ['engine pin'],
          allowedProjections: [
            { path: 'pnpm-workspace.yaml', projection: 'catalog-pins', packages: ['oxlint'] },
          ],
        },
      ],
      protectedProjections: [{ path: 'packages/lint-config/policy.json', projection: 'bytes' }],
      maintenanceVerifierAuthorities: ['scripts/check-toolchain-boundaries.mjs'],
      subjectCommands: [{ id: 'replacement-version', argv: ['oxlint', '--version'] }],
      subjectIsolation: {
        deniedToSubject: ['GITHUB_TOKEN'],
        processBoundary: 'container',
        containerControls: ['non-root'],
      },
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

  it('requires a parser mapping to name its parse-level facility', () => {
    const doc = mappingDoc([{ policy: 'p-one', engine: 'replacement', mechanism: 'parser' }])
    expect(errors(doc, MAPPING_SCHEMA)).toContain(
      '<root>.mappings[0]: missing required "parserMechanism"',
    )
  })

  it.each(['compiler', 'dedicated-gate', 'unavailable'])(
    'refuses the mechanism %s, which is not lint-engine translation',
    (mechanism) => {
      // compiler and dedicated-gate ownership are semantic dispositions in
      // policy.json; unavailability is a blocking conformance result. Allowing
      // any of them here would let the mapping table decide policy ownership.
      const doc = mappingDoc([{ policy: 'p-one', engine: 'replacement', mechanism }])
      expect(errors(doc, MAPPING_SCHEMA).join('\n')).toMatch(
        new RegExp(`"${mechanism}" is not one of`),
      )
    },
  )

  it('refuses an unavailableReason field outright', () => {
    const doc = mappingDoc([
      {
        policy: 'p-one',
        engine: 'replacement',
        mechanism: 'rule',
        ruleId: 'r',
        unavailableReason: 'oxlint has no equivalent',
      },
    ])
    expect(errors(doc, MAPPING_SCHEMA)).toContain(
      '<root>.mappings[0]: unknown field "unavailableReason"',
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

  it('accepts each of the three accepted allocations', () => {
    for (const d of [
      'MIGRATED_TO_NEW_LINT_ENGINE',
      'REPLACED_BY_TYPESCRIPT_COMPILER',
      'REPLACED_BY_DEDICATED_REPOSITORY_GATE',
    ]) {
      expect(errors(policyDoc([policyRow({ disposition: d })]), POLICY_SCHEMA)).toEqual([])
    }
  })

  it('refuses DROPPED, which Scope 1 does not permit at all', () => {
    const doc = policyDoc([policyRow({ disposition: 'DROPPED' })])
    expect(errors(doc, POLICY_SCHEMA).join('\n')).toMatch(/"DROPPED" is not one of/)
  })

  it.each(['PRESERVED_NATIVE', 'PRESERVED_VIA_OPTIONS'])(
    'refuses %s, an engine implementation detail rather than a semantic disposition',
    (value) => {
      const doc = policyDoc([policyRow({ disposition: value })])
      expect(errors(doc, POLICY_SCHEMA).join('\n')).toMatch(new RegExp(`"${value}" is not one of`))
    },
  )

  it('refuses REPLACEMENT_UNAVAILABLE, because that is a blocking result not a row', () => {
    // Inability to enforce a policy equivalently STOPS the migration and keeps
    // ESLint. If a row could carry it, a failed migration would look like a
    // recorded decision instead of the failure it is.
    const doc = policyDoc([policyRow({ disposition: 'REPLACEMENT_UNAVAILABLE' })])
    expect(errors(doc, POLICY_SCHEMA).join('\n')).toMatch(/"REPLACEMENT_UNAVAILABLE" is not one of/)
  })

  it.each(['PRESERVED_BY_COMPILER', 'PRESERVED_BY_DEDICATED_GATE'])(
    'refuses the superseded spelling %s',
    (value) => {
      const doc = policyDoc([policyRow({ disposition: value })])
      expect(errors(doc, POLICY_SCHEMA).join('\n')).toMatch(new RegExp(`"${value}" is not one of`))
    },
  )

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

  it('models member roles and the exported test role as separate facts', () => {
    // REQ-LP-004: the existence of `/test` must not imply that an ordinary test
    // file consumes it. A bare `test` role would blur exactly that distinction,
    // so the vocabulary does not offer one.
    expect(errors(policyDoc([policyRow({ roles: ['test'] })]), POLICY_SCHEMA).join('\n')).toMatch(
      /"test" is not one of/,
    )
    for (const role of ['library', 'service', 'application', 'exported-test', 'adapter-bin']) {
      expect(errors(policyDoc([policyRow({ roles: [role] })]), POLICY_SCHEMA)).toEqual([])
    }
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
    maintenanceClasses: [
      {
        id: 'lint-engine',
        allows: ['engine pin'],
        allowedProjections: [
          { path: 'pnpm-workspace.yaml', projection: 'catalog-pins', packages: ['oxlint'] },
        ],
      },
    ],
    protectedProjections: [{ path: 'policy', projection: 'bytes' }],
    maintenanceVerifierAuthorities: ['scripts/check-toolchain-boundaries.mjs'],
    subjectCommands: [{ id: 'replacement-version', argv: ['oxlint', '--version'] }],
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

describe('maintenance classes must carry exact projections', () => {
  const boundaryBase = (): Record<string, unknown> => ({
    schemaVersion: 1,
    compatibilityConsumers: ['scripts/check-source-imports.mjs'],
    platforms: ['ubuntu-24.04', 'ubuntu-24.04-arm'],
    protectedProjections: [{ path: 'packages/lint-config/policy.json', projection: 'bytes' }],
    maintenanceVerifierAuthorities: ['scripts/check-toolchain-boundaries.mjs'],
    subjectCommands: [{ id: 'replacement-version', argv: ['oxlint', '--version'] }],
    subjectIsolation: {
      deniedToSubject: ['GITHUB_TOKEN'],
      processBoundary: 'container',
      containerControls: ['non-root'],
    },
  })

  it('refuses a class that declares only prose', () => {
    // `allows` is a human summary. A class whose admitted delta exists only as
    // prose cannot be checked, and an unchecked class admits everything.
    const doc = { ...boundaryBase(), maintenanceClasses: [{ id: 'x', allows: ['whatever'] }] }
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/allowedProjections/)
  })

  it('refuses an unknown projection kind', () => {
    const doc = {
      ...boundaryBase(),
      maintenanceClasses: [
        {
          id: 'x',
          allows: ['p'],
          allowedProjections: [{ path: 'a', projection: 'trust-me' }],
        },
      ],
    }
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/projection/)
  })

  it('refuses a document with no protected floor', () => {
    const doc: Record<string, unknown> = { ...boundaryBase(), maintenanceClasses: [] }
    delete doc['protectedProjections']
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/protectedProjections/)
  })

  it('refuses a document that names no verifier authority', () => {
    const doc: Record<string, unknown> = boundaryBase()
    delete doc['maintenanceVerifierAuthorities']
    doc['maintenanceClasses'] = []
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(/maintenanceVerifierAuthorities/)
  })
})

/** First element of a required array field, which the schema guarantees exists. */
const at = (doc: Record<string, unknown>, key: string): Record<string, unknown> => {
  const list = doc[key] as Record<string, unknown>[]
  const first = list[0]
  if (first === undefined) throw new Error(`${key} is empty, so this mutation is not evidence`)
  return first
}

describe('the COMMITTED boundary document satisfies its own schema', () => {
  // A stale top-level `protectedAuthorities` from the superseded path-level
  // model survived an entire landing here. The schema forbade it
  // (`additionalProperties: false`) and all 25 gates stayed green, because
  // every existing case validated a synthetic minimal document instead of the
  // canonical one. Validating a document you just built proves the schema
  // parses; only the real instance proves the repository is consistent.
  const BOUNDARY_INSTANCE = JSON.parse(
    readFileSync(path.join(HERE, '..', '..', '..', 'scripts', 'toolchain-boundaries.json'), 'utf8'),
  ) as Record<string, unknown>

  it('validates with no errors', () => {
    expect(errors(BOUNDARY_INSTANCE, BOUNDARY_SCHEMA)).toEqual([])
  })

  it('carries no field from the superseded path-level model', () => {
    expect(BOUNDARY_INSTANCE['protectedAuthorities']).toBeUndefined()
    expect(BOUNDARY_INSTANCE['protectedProjections']).toBeDefined()
  })

  it.each([
    [
      'an unknown top-level field is reintroduced',
      (doc: Record<string, unknown>) => {
        doc['protectedAuthorities'] = ['packages/lint-config/policy.json']
      },
      /protectedAuthorities/,
    ],
    [
      'a required projection field is deleted',
      (doc: Record<string, unknown>) => {
        delete at(doc, 'protectedProjections')['projection']
      },
      /projection/,
    ],
    [
      'an unknown projection property is added',
      (doc: Record<string, unknown>) => {
        at(doc, 'protectedProjections')['exceptWhen'] = 'convenient'
      },
      /exceptWhen/,
    ],
    [
      'a class loses its exact projections',
      (doc: Record<string, unknown>) => {
        delete at(doc, 'maintenanceClasses')['allowedProjections']
      },
      /allowedProjections/,
    ],
  ])('REFUSES the committed document when %s', (_label, mutate, expected) => {
    // Precondition, asserted per case: the UNMUTATED committed document is
    // valid. A refusal case whose baseline was already invalid proves nothing,
    // and this is also what stops the positive proof above from being quietly
    // neutered while these keep passing.
    expect(errors(BOUNDARY_INSTANCE, BOUNDARY_SCHEMA)).toEqual([])
    const doc = JSON.parse(JSON.stringify(BOUNDARY_INSTANCE)) as Record<string, unknown>
    mutate(doc)
    expect(JSON.stringify(doc)).not.toBe(JSON.stringify(BOUNDARY_INSTANCE))
    expect(errors(doc, BOUNDARY_SCHEMA).join('\n')).toMatch(expected)
  })
})
