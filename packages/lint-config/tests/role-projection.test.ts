/**
 * Role and path parity, and the fixture-class projection (task 1.11).
 *
 * Rule-level parity is necessary and not sufficient. A migration can preserve
 * all 117 policies and still change the repository's behaviour by applying them
 * to the wrong files: relaxing a service to library rules, letting the exported
 * test role leak onto ordinary tests, or widening the one admitted process-entry
 * exception. None of that is visible in a per-rule fixture.
 *
 * So the roles are proved BEHAVIOURALLY: one fixture, every role, both engines,
 * against a matrix of which role must reject it. The oracle's resolved
 * configuration is then used only for what a single file cannot show -- the
 * typed policies' role differences, and the per-role totals.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  checkFixtureProjection,
  checkFormattingNeutrality,
  checkFrameworkNeutrality,
  FIXTURE_CLASS,
  loadGeneratedConfigs,
  members,
} from '../src/check-policy.mjs'
// @ts-ignore
import { GENERATED_ROLES } from '../src/generate-oxlint-config.mjs'
// @ts-ignore
import {
  extractEffectivePolicy,
  MEMBER_TEST_PROBE,
  severityOf,
} from '../src/extract-legacy-policy.mjs'
// @ts-ignore
import {
  configForRole,
  legacyRulesForRole,
  loadAuthorities,
  ROLE_FIXTURE_ROOT,
  roleMatrixProblems,
  roleObservation,
  typedLegacyRuleIds,
} from '../src/run-parity.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const load = (p: string): any => JSON.parse(readFileSync(path.join(HERE, '..', p), 'utf8'))

type Row = { ruleId: string; roles: string[]; options?: Record<string, unknown[]> }
const rows = (await extractEffectivePolicy()) as Row[]
const rule = (id: string): Row | undefined => rows.find((r) => r.ruleId === id)
const countFor = (role: string): number => rows.filter((r) => r.roles.includes(role)).length

const { policy: POLICY, mappings: MAPPINGS } = loadAuthorities() as { policy: any; mappings: any }
const GENERATED = loadGeneratedConfigs() as Record<string, any>

const REPLACEMENT_MAPPING = new Map<string, any>(
  MAPPINGS.mappings.filter((m: any) => m.engine === 'replacement').map((m: any) => [m.policy, m]),
)

/** The rules a role's generated config actually enables. */
const enabledFor = (role: string): string[] => Object.keys(GENERATED[role].rules)

/**
 * The rules a role's config MUST enable, derived from the authorities.
 *
 * Policy rows applicable to the role, joined to the replacement mapping, kept
 * where the engine realises them through a rule. A parser-realised policy has
 * nothing to enable.
 */
const expectedFor = (role: string): string[] =>
  POLICY.policies
    .filter((p: any) => p.roles.includes(role))
    .map((p: any) => REPLACEMENT_MAPPING.get(p.id))
    .filter((m: any) => m !== undefined && m.mechanism === 'rule')
    .map((m: any) => m.ruleId)

/** Replacement rule ids for policies that need type information. */
const TYPE_AWARE_REPLACEMENT_RULES: string[] = POLICY.policies
  .filter((p: any) => p.proof.shard.startsWith('typescript-typed-'))
  .map((p: any) => REPLACEMENT_MAPPING.get(p.id))
  .filter((m: any) => m !== undefined && m.mechanism === 'rule')
  .map((m: any) => m.ruleId)

// ── the matrix: one source, every role, both engines ────────────────────────

/** The roles a TypeScript source can be judged under; `js-config` is JavaScript only. */
const TS_ROLES = [
  'library',
  'service',
  'application',
  'adapter-bin',
  'config-file',
  'exported-test',
]
const JS_ROLES = ['js-config']

type Matrix = { file: string; roles: string[]; rejects: Record<string, string[]> }
const MATRIX: Matrix[] = [
  {
    file: 'process-access.ts',
    roles: TS_ROLES,
    rejects: {
      'no-console': ['library', 'service', 'application'],
      'no-restricted-globals': ['library'],
      'no-restricted-properties': ['library'],
    },
  },
  {
    file: 'process-access.js',
    roles: JS_ROLES,
    rejects: { 'no-console': [], 'no-restricted-globals': [], 'no-restricted-properties': [] },
  },
  {
    file: 'module-boundary.ts',
    roles: TS_ROLES,
    rejects: { 'explicit-module-boundary-types': ['library', 'adapter-bin'] },
  },
  {
    file: 'module-boundary.js',
    roles: JS_ROLES,
    rejects: { 'explicit-module-boundary-types': [] },
  },
  {
    file: 'explicit-any.ts',
    roles: TS_ROLES,
    rejects: {
      'no-explicit-any': ['library', 'service', 'application', 'adapter-bin', 'config-file'],
    },
  },
]

type Observation = {
  file: string
  role: string
  observed: Record<string, { legacy: boolean; replacement: boolean }>
}

/**
 * The harness is untyped `.mjs`; TypeScript infers its parameter list from the
 * destructuring, which makes the optional overrides look required. Widened
 * once, here, at the boundary.
 */
const observeRole = roleObservation as unknown as (
  input: Record<string, unknown>,
) => Promise<Observation>

async function observe(
  entry: Matrix,
  overrides: Record<string, unknown> = {},
): Promise<Observation[]> {
  const out: Observation[] = []
  for (const role of entry.roles) {
    out.push(
      (await observeRole({
        file: path.join(ROLE_FIXTURE_ROOT, entry.file),
        role,
        policyIds: Object.keys(entry.rejects),
        rows,
        policy: POLICY,
        mappings: MAPPINGS,
        ...overrides,
      })) as Observation,
    )
  }
  return out
}

describe('role behaviour: one fixture, every role, both engines (EX-ROLE-001)', () => {
  for (const entry of MATRIX) {
    it(`${entry.file}: each role rejects exactly what the matrix says`, async () => {
      const observations = await observe(entry)
      expect(roleMatrixProblems(observations, entry.rejects, entry.roles)).toEqual([])
      // The matrix is not vacuous: every provoked policy is rejected somewhere
      // by both engines, or is a JavaScript twin whose TypeScript original is.
      for (const [policyId, rejecting] of Object.entries(entry.rejects)) {
        if (rejecting.length === 0) continue
        const hit = observations.find((o) => o.role === rejecting[0])?.observed[policyId]
        expect(hit, `${policyId} under ${rejecting[0]}`).toEqual({
          legacy: true,
          replacement: true,
        })
      }
    })
  }

  it('every member role appears in the matrix, and js-config through the JavaScript twins', () => {
    const covered = new Set(MATRIX.flatMap((m) => m.roles))
    expect([...covered].sort()).toEqual([...(GENERATED_ROLES as string[])].sort())
  })

  it('the static role run leaves out exactly the typed policies, by name', () => {
    const typed = typedLegacyRuleIds(MAPPINGS) as Set<string>
    // By the rules' own metadata: 23 declare they need a program. The typed
    // SHARDS hold 24, because shard allocation is derived from the oracle and
    // a static rule the JavaScript-config override switches off lands there;
    // the role run must still exercise that one.
    expect(typed.size).toBe(23)
    for (const id of typed) expect(id).toMatch(/^@typescript-eslint\//)
    expect(typed.has('@typescript-eslint/explicit-module-boundary-types')).toBe(false)
    expect(typed.has('@typescript-eslint/no-floating-promises')).toBe(true)
    // The typed role differences are the oracle's to state (below); nothing
    // typed is silently absent from a role's static rule set.
    const library = legacyRulesForRole(rows, 'library', typed) as Record<string, unknown>
    expect(Object.keys(library)).toHaveLength(countFor('library') - typed.size)
    expect(Object.keys(library)).not.toContain('@typescript-eslint/no-floating-promises')
  })
})

// ── MUT-ROLE-001: a broadened exception fails the matrix, on either engine ───

describe('the matrix fails when a role stops rejecting what it must (MUT-ROLE-001)', () => {
  const entry = MATRIX[0] as Matrix
  const typed = typedLegacyRuleIds(MAPPINGS) as Set<string>

  it('legacy: the process exception broadened onto the library role', async () => {
    const relaxed = legacyRulesForRole(rows, 'library', typed) as Record<string, unknown>
    delete relaxed['no-console']
    delete relaxed['no-restricted-globals']
    delete relaxed['no-restricted-properties']
    const mutated = (await observeRole({
      file: path.join(ROLE_FIXTURE_ROOT, entry.file),
      role: 'library',
      policyIds: Object.keys(entry.rejects),
      rows,
      policy: POLICY,
      mappings: MAPPINGS,
      legacyRules: relaxed,
    })) as Observation
    const others = (await observe(entry)).filter((o) => o.role !== 'library')
    const problems = roleMatrixProblems(
      [mutated, ...others],
      entry.rejects,
      entry.roles,
    ) as string[]
    expect(problems.join('\n')).toMatch(
      /no-console: the legacy engine accepted .* "library" role, which must reject/,
    )
    expect(problems.join('\n')).toMatch(/no-restricted-globals: the legacy engine accepted/)
    expect(problems.filter((p) => p.includes('replacement'))).toEqual([])
  })

  it('replacement: the generated library config without the process rules', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'role-mutation-'))
    const config = load('generated/oxlintrc.library.json')
    delete config.rules['no-console']
    delete config.rules['no-restricted-globals']
    delete config.rules['no-restricted-properties']
    const mutatedConfig = path.join(dir, 'oxlintrc.library.json')
    writeFileSync(mutatedConfig, JSON.stringify(config))
    const mutated = (await observeRole({
      file: path.join(ROLE_FIXTURE_ROOT, entry.file),
      role: 'library',
      policyIds: Object.keys(entry.rejects),
      rows,
      policy: POLICY,
      mappings: MAPPINGS,
      replacementConfig: mutatedConfig,
    })) as Observation
    const others = (await observe(entry)).filter((o) => o.role !== 'library')
    const problems = roleMatrixProblems(
      [mutated, ...others],
      entry.rejects,
      entry.roles,
    ) as string[]
    expect(problems.join('\n')).toMatch(
      /no-console: the replacement engine accepted .* "library" role/,
    )
    expect(problems.filter((p) => p.includes('legacy'))).toEqual([])
  })

  it('leak: the library restrictions reaching a service', async () => {
    // The other direction: a role that starts rejecting what it must accept.
    const strict = legacyRulesForRole(rows, 'library', typed) as Record<string, unknown>
    const mutated = (await observeRole({
      file: path.join(ROLE_FIXTURE_ROOT, entry.file),
      role: 'service',
      policyIds: Object.keys(entry.rejects),
      rows,
      policy: POLICY,
      mappings: MAPPINGS,
      legacyRules: strict,
      replacementConfig: configForRole('library'),
    })) as Observation
    const others = (await observe(entry)).filter((o) => o.role !== 'service')
    const problems = roleMatrixProblems(
      [mutated, ...others],
      entry.rejects,
      entry.roles,
    ) as string[]
    expect(problems.join('\n')).toMatch(
      /no-restricted-globals: the legacy engine rejected .* "service" role, which must accept/,
    )
    expect(problems.join('\n')).toMatch(
      /no-restricted-globals: the replacement engine rejected .* "service" role/,
    )
  })

  it('a missing observation is a problem, never a pass', () => {
    const problems = roleMatrixProblems([], { 'no-console': ['library'] }, ['library']) as string[]
    expect(problems).toEqual(['no-console: no observation for the "library" role'])
  })
})

// ── the roles differ, and differ specifically (the oracle's view) ───────────

describe('role behaviour is preserved per role, not on average', () => {
  it.each([
    ['library', 99],
    ['service', 96],
    ['application', 96],
    ['adapter-bin', 96],
    ['config-file', 95],
    ['exported-test', 91],
    ['js-config', 88],
  ])('%s enforces exactly %d policies', (role, expected) => {
    expect(countFor(role as string)).toBe(expected as number)
  })

  it('the generated replacement config reproduces each role set EXACTLY', () => {
    // Cardinality is not the property. A generator defect could swap one
    // enabled rule for another and preserve every count, so the sets are
    // compared element by element rather than by size.
    for (const role of GENERATED_ROLES as string[]) {
      expect(new Set(enabledFor(role)), `${role} role set`).toEqual(new Set(expectedFor(role)))
    }
  })

  it('the role sets are genuinely different from one another', () => {
    // Exact equality alone would also hold for seven identical configs if the
    // policy said so. This asserts the projection has real structure.
    const shapes = (GENERATED_ROLES as string[]).map((role) =>
      JSON.stringify([...enabledFor(role)].sort()),
    )
    expect(new Set(shapes).size).toBeGreaterThan(1)
  })

  it('the library replacement config carries the library-only restrictions', () => {
    const library = new Set(enabledFor('library'))
    for (const id of [
      'no-restricted-globals',
      'no-restricted-properties',
      'typescript/explicit-module-boundary-types',
    ]) {
      expect(library, `library must enforce ${id}`).toContain(id)
    }
  })

  it.each(['service', 'application'])(
    'the %s replacement config drops the library-only rules',
    (role) => {
      const enabled = new Set(enabledFor(role))
      for (const id of [
        'no-restricted-globals',
        'no-restricted-properties',
        'typescript/explicit-module-boundary-types',
      ]) {
        expect(enabled, `${role} must not enforce ${id}`).not.toContain(id)
      }
    },
  )

  it('the adapter replacement set is the library set minus exactly three rules', () => {
    const library = new Set(enabledFor('library'))
    const adapter = new Set(enabledFor('adapter-bin'))
    expect([...library].filter((id) => !adapter.has(id)).sort()).toEqual([
      'no-console',
      'no-restricted-globals',
      'no-restricted-properties',
    ])
    expect(
      [...adapter].filter((id) => !library.has(id)),
      'the adapter entry may not gain a rule the library lacks',
    ).toEqual([])
  })

  it('the js-config replacement config enforces no type-aware policy', () => {
    const enabled = new Set(enabledFor('js-config'))
    for (const typed of TYPE_AWARE_REPLACEMENT_RULES) {
      expect(enabled, `js-config must not enforce ${typed}`).not.toContain(typed)
    }
    expect(TYPE_AWARE_REPLACEMENT_RULES.length).toBeGreaterThan(20)
  })

  it('a library restricts process access where a service does not', () => {
    // The single most consequential role difference, as the oracle resolves
    // it; the matrix above proves the same thing on both engines.
    for (const restricted of ['no-restricted-globals', 'no-restricted-properties']) {
      expect(rule(restricted)?.roles, restricted).toContain('library')
      expect(rule(restricted)?.roles, restricted).not.toContain('service')
      expect(rule(restricted)?.roles, restricted).not.toContain('application')
    }
  })

  it('a library states its exported boundary types where a composition root need not', () => {
    const boundary = rule('@typescript-eslint/explicit-module-boundary-types')
    expect(boundary?.roles).toContain('library')
    expect(boundary?.roles).not.toContain('service')
    expect(boundary?.roles).not.toContain('application')
  })

  it('config roles relax the surface rules and keep the correctness rules', () => {
    expect(rule('no-console')?.roles).not.toContain('config-file')
    expect(rule('no-console')?.roles).not.toContain('js-config')
    expect(rule('@typescript-eslint/no-explicit-any')?.roles).toContain('config-file')
  })

  it('type-aware policy does not reach the JavaScript-config role', () => {
    for (const typed of [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/await-thenable',
    ]) {
      expect(rule(typed)?.roles).not.toContain('js-config')
    }
  })

  it('the exported test role relaxes the typed unsafe policies that a single file cannot show', () => {
    for (const relaxed of [
      '@typescript-eslint/no-unsafe-assignment',
      '@typescript-eslint/no-unsafe-argument',
      '@typescript-eslint/no-unsafe-member-access',
    ]) {
      expect(rule(relaxed)?.roles, relaxed).not.toContain('exported-test')
      expect(rule(relaxed)?.roles, relaxed).toContain('library')
    }
    // ...and keeps the ones that catch a test that never runs its assertions.
    expect(rule('@typescript-eslint/no-floating-promises')?.roles).toContain('exported-test')
  })
})

// ── ordinary tests are not the exported test role ───────────────────────────

describe('member-role assignment and the exported test role stay separate (ADV-ROLE-002)', () => {
  it('an ordinary test file resolves to its MEMBER role, by the engine', async () => {
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

  it('the exported role is genuinely more permissive, and applies to nothing', () => {
    expect(countFor('exported-test')).toBeLessThan(countFor('library'))
    for (const relaxed of [
      'no-console',
      'no-restricted-globals',
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/no-unsafe-assignment',
    ]) {
      expect(rule(relaxed)?.roles, `${relaxed} relaxed by the exported role`).not.toContain(
        'exported-test',
      )
      expect(rule(relaxed)?.roles, `${relaxed} still blocks for members`).toContain('library')
    }
  })

  it('offers no bare `test` role that could blur the two', () => {
    expect(rows.flatMap((r) => r.roles)).not.toContain('test')
  })

  it('no member composes the exported test role', () => {
    for (const rel of readMembers()) {
      const config = path.join(REPO_ROOT, rel, 'eslint.config.js')
      if (!existsSync(config)) continue
      expect(readFileSync(config, 'utf8'), rel).not.toMatch(/@secure-home\/eslint-config\/test\b/)
    }
  })
})

// ── the one admitted exception (ADV-ROLE-001) ───────────────────────────────

describe('the coding-adapter process entry cannot broaden', () => {
  const RELAXED = ['no-console', 'no-restricted-globals', 'no-restricted-properties']
  const ADAPTER = path.join(REPO_ROOT, 'agents', 'adapters', 'coding', 'claude-code')

  it('relaxes exactly those three and nothing else, by the oracle', () => {
    const relaxed = rows
      .filter((r) => r.roles.includes('library') && !r.roles.includes('adapter-bin'))
      .map((r) => r.ruleId)
      .sort()
    expect(relaxed).toEqual([...RELAXED].sort())
  })

  it('applies to src/bin.ts and to no other file of the adapter, by the engine', async () => {
    // The PATH half of role/path behaviour: the same member, two files, and
    // only the declared wire entry is relaxed.
    const eslint = new ESLint({ cwd: ADAPTER })
    const bin = await eslint.calculateConfigForFile('src/bin.ts')
    for (const other of ['src/index.ts', 'src/plan.ts', 'src/bin.test.ts', 'src/lib/bin.ts']) {
      const config = await eslint.calculateConfigForFile(other)
      for (const id of RELAXED) {
        expect(severityOf(bin.rules[id]), `${id} at src/bin.ts`).toBe('off')
        expect(severityOf(config.rules[id]), `${id} at ${other}`).toBe('error')
      }
    }
  })

  it('keeps every correctness policy in force at that entry', () => {
    for (const kept of [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/no-explicit-any',
      '@typescript-eslint/explicit-module-boundary-types',
      'eqeqeq',
    ]) {
      expect(rule(kept)?.roles, kept).toContain('adapter-bin')
    }
  })

  it('is exactly one policy short of the library role, three times over', () => {
    expect(countFor('library') - countFor('adapter-bin')).toBe(RELAXED.length)
  })
})

// ── neutrality and formatting (PROP-FMT-001, MUT-FMT-001) ───────────────────

describe('framework neutrality', () => {
  it('no framework-specific rule, mapping, or plugin is enforced anywhere', () => {
    expect(checkFrameworkNeutrality(POLICY, MAPPINGS, GENERATED)).toEqual([])
  })

  it('the generated replacement config enables only the TypeScript plugin', () => {
    for (const role of GENERATED_ROLES as string[]) {
      expect(GENERATED[role].plugins).toEqual(['typescript'])
    }
  })

  it.each([
    [
      'a framework policy row',
      () =>
        checkFrameworkNeutrality(
          { policies: [...POLICY.policies, { id: 'react/jsx-key', roles: ['library'] }] },
          MAPPINGS,
          GENERATED,
        ),
      /policy "react\/jsx-key" is a framework rule/,
    ],
    [
      'a framework mapping',
      () =>
        checkFrameworkNeutrality(
          POLICY,
          {
            mappings: [
              ...MAPPINGS.mappings,
              { policy: 'no-console', engine: 'replacement', ruleId: 'jest/no-focused-tests' },
            ],
          },
          GENERATED,
        ),
      /names framework rule jest\/no-focused-tests/,
    ],
    [
      'a framework plugin in a generated config',
      () =>
        checkFrameworkNeutrality(POLICY, MAPPINGS, {
          library: { ...GENERATED['library'], plugins: ['typescript', 'react'] },
        }),
      /enables the framework plugin "react"/,
    ],
  ])('fails on %s', (_label, mutate, pattern) => {
    expect((mutate() as string[]).join('\n')).toMatch(pattern as RegExp)
  })
})

describe('Prettier remains the sole formatting authority', () => {
  it('no formatting rule appears in policy or in any generated config', () => {
    expect(checkFormattingNeutrality(POLICY, GENERATED)).toEqual([])
  })

  it('the replacement engine is never asked to format', () => {
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-parity.mjs'), 'utf8')
    expect(runner).not.toMatch(/--format\b/)
  })

  it.each([
    [
      'a formatting policy row',
      () =>
        checkFormattingNeutrality(
          { policies: [...POLICY.policies, { id: 'indent', roles: ['library'] }] },
          GENERATED,
        ),
      /policy "indent" is a formatting rule/,
    ],
    [
      'a formatting rule in a generated config',
      () =>
        checkFormattingNeutrality(POLICY, {
          service: {
            ...GENERATED['service'],
            rules: { ...GENERATED['service'].rules, semi: 'error' },
          },
        }),
      /generated service config enables formatting rule semi/,
    ],
    [
      'a stylistic namespace in a generated config',
      () =>
        checkFormattingNeutrality(POLICY, {
          library: {
            ...GENERATED['library'],
            rules: { ...GENERATED['library'].rules, '@stylistic/quotes': 'error' },
          },
        }),
      /enables formatting rule @stylistic\/quotes/,
    ],
  ])('fails on %s (MUT-FMT-001)', (_label, mutate, pattern) => {
    expect((mutate() as string[]).join('\n')).toMatch(pattern as RegExp)
  })
})

// ── the fixture class, across every reader ──────────────────────────────────

const PROJECTION_FILES = [
  'packages/eslint-config/base.js',
  '.prettierignore',
  'packages/lint-config/tsconfig.json',
  'scripts/check-source-imports.mjs',
  'packages/lint-config/src/run-parity.mjs',
]

/** A scratch repository holding only what the projection reads, as committed. */
function projectionRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fixture-projection-'))
  for (const rel of PROJECTION_FILES) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    cpSync(path.join(REPO_ROOT, rel), path.join(root, rel))
  }
  for (const rel of FIXTURE_CLASS as string[]) {
    mkdirSync(path.join(root, 'packages', 'lint-config', rel), { recursive: true })
  }
  return root
}

function mutate(root: string, rel: string, edit: (text: string) => string): void {
  const file = path.join(root, rel)
  const before = readFileSync(file, 'utf8')
  const after = edit(before)
  if (after === before) throw new Error(`the mutation of ${rel} changed nothing`)
  writeFileSync(file, after)
}

describe('the conformance corpus is excluded by four readers and consumed by one', () => {
  it('passes the projection check as committed', () => {
    expect(checkFixtureProjection(REPO_ROOT)).toEqual([])
  })

  it('and as a scratch copy of only the files the projection reads', () => {
    expect(checkFixtureProjection(projectionRoot())).toEqual([])
  })

  it('covers the negative controls and the role fixtures too', () => {
    expect(FIXTURE_CLASS as string[]).toContain('tests/fixtures/_negative-controls')
    for (const rel of FIXTURE_CLASS as string[]) {
      expect(existsSync(path.join(HERE, '..', rel)), rel).toBe(true)
    }
    expect(existsSync(ROLE_FIXTURE_ROOT as string)).toBe(true)
    expect(path.relative(path.join(HERE, '..'), ROLE_FIXTURE_ROOT as string)).toBe(
      'tests/fixtures/roles',
    )
  })

  it.each([
    [
      'lint discovery',
      'packages/eslint-config/base.js',
      (t: string) => t.replace("'**/tests/fixtures/**',", ''),
      /lint discovery no longer excludes the conformance corpus/,
    ],
    [
      'Prettier',
      '.prettierignore',
      (t: string) => t.replace('packages/lint-config/tests/fixtures/', ''),
      /Prettier no longer excludes the conformance corpus/,
    ],
    [
      'the package compiler project',
      'packages/lint-config/tsconfig.json',
      (t: string) => JSON.stringify({ ...JSON.parse(t), exclude: [] }),
      /the package compiler project no longer excludes the conformance corpus/,
    ],
    [
      'source-import scanning',
      'scripts/check-source-imports.mjs',
      (t: string) => t.replaceAll('tests/fixtures', 'tests/corpus'),
      /source-import scanning no longer excludes the conformance corpus/,
    ],
    [
      'the parity harness',
      'packages/lint-config/src/run-parity.mjs',
      (t: string) => t.replace("'tests', 'fixtures'", "'tests', 'corpus'"),
      /the parity harness no longer points at the conformance corpus/,
    ],
  ])('catches %s losing its projection, and only it', (_reader, rel, edit, pattern) => {
    // Each projection is mutated ALONE, so a check that reads one setting for
    // two readers would report the wrong reader -- or the right one twice.
    const root = projectionRoot()
    mutate(root, rel as string, edit as (t: string) => string)
    const problems = checkFixtureProjection(root) as string[]
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(pattern as RegExp)
  })

  it.each(['tests/fixtures/_negative-controls', 'tests/fixtures/roles'])(
    'catches %s leaving the fixture class',
    (rel) => {
      const root = projectionRoot()
      rmSync(path.join(root, 'packages', 'lint-config', rel as string), {
        recursive: true,
        force: true,
      })
      expect(checkFixtureProjection(root)).toEqual([
        `${rel as string} is part of the fixture class but does not exist`,
      ])
    },
  )

  it('catches a reader file disappearing altogether', () => {
    const root = projectionRoot()
    rmSync(path.join(root, '.prettierignore'))
    expect((checkFixtureProjection(root) as string[]).join('\n')).toMatch(
      /Prettier: \.prettierignore is missing, so its exclusion cannot be checked/,
    )
  })
})

// ── helpers ─────────────────────────────────────────────────────────────────

/** Every workspace member, from the checker's own discovery. */
function readMembers(): string[] {
  const found = members(REPO_ROOT) as string[]
  expect(found.length).toBeGreaterThanOrEqual(19)
  return found
}
