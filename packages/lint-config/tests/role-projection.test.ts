/**
 * Role and path parity, and the fixture-class projection (task 1.11).
 *
 * Rule-level parity is necessary and not sufficient. A migration can preserve
 * all 117 policies and still change the repository's behaviour by applying them
 * to the wrong files: relaxing a service to library rules, letting the exported
 * test role leak onto ordinary tests, or widening the one admitted process-entry
 * exception. None of that is visible in a per-rule fixture.
 *
 * So the roles are proved BEHAVIOURALLY: one fixture, every role, against a
 * matrix of which role must reject it. The committed policy is then used only
 * for what a single file cannot show -- the typed policies' role differences,
 * and the per-role totals.
 *
 * Task 3.4 retired the second engine, and with it the resolved-configuration
 * oracle these role facts used to be read from. The role sets did not move:
 * the per-role totals below are the same seven numbers the oracle produced,
 * now read from the authority that survived it. What changed is that a role
 * fact is no longer cross-checked against a second engine's resolution -- it
 * is checked against the engine that actually runs, one fixture at a time.
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
  configForRole,
  loadAuthorities,
  ROLE_FIXTURE_ROOT,
  roleMatrixProblems,
  roleObservation,
} from '../src/run-parity.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const load = (p: string): any => JSON.parse(readFileSync(path.join(HERE, '..', p), 'utf8'))

/**
 * The roles a policy applies to, and how many apply to a role.
 *
 * These used to be read from the retired engine's resolved configuration --
 * the oracle. `policy.json` states the same facts and produces the same seven
 * totals, so the successor authority is the committed one rather than a second
 * engine nobody runs any more.
 */
const rolesOf = (id: string): string[] | undefined =>
  POLICY.policies.find((p: any) => p.id === id)?.roles
const countFor = (role: string): number =>
  POLICY.policies.filter((p: any) => p.roles.includes(role)).length

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
  observed: Record<string, boolean>
}

/**
 * The harness is untyped `.mjs`; TypeScript infers its parameter list from the
 * destructuring, which makes the optional overrides look required. Widened
 * once, here, at the boundary.
 */
const observeRole = roleObservation as unknown as (input: Record<string, unknown>) => Observation

function observe(entry: Matrix, overrides: Record<string, unknown> = {}): Observation[] {
  return entry.roles.map((role) =>
    observeRole({
      file: path.join(ROLE_FIXTURE_ROOT, entry.file),
      role,
      policyIds: Object.keys(entry.rejects),
      policy: POLICY,
      mappings: MAPPINGS,
      ...overrides,
    }),
  )
}

describe('role behaviour: one fixture, every role (EX-ROLE-001)', () => {
  for (const entry of MATRIX) {
    it(`${entry.file}: each role rejects exactly what the matrix says`, () => {
      const observations = observe(entry)
      expect(roleMatrixProblems(observations, entry.rejects, entry.roles)).toEqual([])
      // The matrix is not vacuous: every provoked policy is rejected somewhere,
      // or is a JavaScript twin whose TypeScript original is.
      for (const [policyId, rejecting] of Object.entries(entry.rejects)) {
        if (rejecting.length === 0) continue
        const hit = observations.find((o) => o.role === rejecting[0])?.observed[policyId]
        expect(hit, `${policyId} under ${rejecting[0]}`).toBe(true)
      }
    })
  }

  it('every member role appears in the matrix, and js-config through the JavaScript twins', () => {
    const covered = new Set(MATRIX.flatMap((m) => m.roles))
    expect([...covered].sort()).toEqual([...(GENERATED_ROLES as string[])].sort())
  })

  it('the typed policies are named, and reach exactly the roles that can run them', () => {
    // This used to read type-awareness out of the retired engine's rule
    // metadata. The shards carry the same fact, and the engine proves it
    // behaviourally in `typed-backend.test.ts`; what belongs HERE is the role
    // consequence -- a typed policy must not be assigned to the one role whose
    // files the typed backend cannot analyse.
    expect(TYPE_AWARE_REPLACEMENT_RULES.length).toBe(24)
    for (const id of TYPE_AWARE_REPLACEMENT_RULES) expect(id).toMatch(/^typescript\//)
    expect(TYPE_AWARE_REPLACEMENT_RULES).toContain('typescript/no-floating-promises')

    const jsConfig = new Set(enabledFor('js-config'))
    const library = new Set(enabledFor('library'))
    for (const id of TYPE_AWARE_REPLACEMENT_RULES) {
      expect(jsConfig, `js-config cannot enforce ${id}`).not.toContain(id)
      expect(library, `library must enforce ${id}`).toContain(id)
    }
  })
})

// ── MUT-ROLE-001: a broadened exception fails the matrix, on either engine ───

describe('the matrix fails when a role stops rejecting what it must (MUT-ROLE-001)', () => {
  const entry = MATRIX[0] as Matrix

  /** Observe one role against a doctored config, the rest as committed. */
  const withMutatedRole = (role: string, replacementConfig: string): string[] => {
    const mutated = observeRole({
      file: path.join(ROLE_FIXTURE_ROOT, entry.file),
      role,
      policyIds: Object.keys(entry.rejects),
      policy: POLICY,
      mappings: MAPPINGS,
      replacementConfig,
    })
    const others = observe(entry).filter((o) => o.role !== role)
    return roleMatrixProblems([mutated, ...others], entry.rejects, entry.roles) as string[]
  }

  /** A generated config with rules removed, written where the engine can read it. */
  const configWithout = (role: string, drop: string[]): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'role-mutation-'))
    const config = load(`generated/oxlintrc.${role}.json`)
    for (const id of drop) delete config.rules[id]
    const target = path.join(dir, `oxlintrc.${role}.json`)
    writeFileSync(target, JSON.stringify(config))
    return target
  }

  it('broadened: the process exception reaching the whole library role', () => {
    // The mutation that matters most. Relaxing these three across the library
    // role turns the admitted single-file exception into a package-wide one,
    // and every per-rule fixture would still pass.
    const problems = withMutatedRole(
      'library',
      configWithout('library', ['no-console', 'no-restricted-globals', 'no-restricted-properties']),
    )
    expect(problems.join('\n')).toMatch(
      /no-console: the replacement engine accepted .* "library" role, which must reject/,
    )
    expect(problems.join('\n')).toMatch(/no-restricted-globals: the replacement engine accepted/)
    expect(problems.join('\n')).toMatch(/no-restricted-properties: the replacement engine accepted/)
  })

  it('leaked: the library restrictions reaching a service', () => {
    // The other direction, and the one that is easy to mistake for rigour: a
    // role that starts rejecting what it must ACCEPT is drift too. A service
    // is a composition root; it is supposed to read the process.
    const problems = withMutatedRole('service', configForRole('library') as string)
    expect(problems.join('\n')).toMatch(
      /no-restricted-globals: the replacement engine rejected .* "service" role, which must accept/,
    )
  })

  it('a missing observation is a problem, never a pass', () => {
    const problems = roleMatrixProblems([], { 'no-console': ['library'] }, ['library']) as string[]
    expect(problems).toEqual(['no-console: no observation for the "library" role'])
  })

  it('a verdict-free observation is a problem, never a pass', () => {
    // The subtler vacuity: an observation exists but says nothing about the
    // policy. Treating that as agreement would let a harness that stopped
    // reporting a rule read as a clean role.
    const problems = roleMatrixProblems(
      [{ file: 'x.ts', role: 'library', observed: {} }],
      { 'no-console': ['library'] },
      ['library'],
    ) as string[]
    expect(problems).toEqual(['no-console: the "library" observation carries no verdict for it'])
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
    // The single most consequential role difference, as the policy states it;
    // the matrix above proves the same thing by running the engine.
    for (const restricted of ['no-restricted-globals', 'no-restricted-properties']) {
      expect(rolesOf(restricted), restricted).toContain('library')
      expect(rolesOf(restricted), restricted).not.toContain('service')
      expect(rolesOf(restricted), restricted).not.toContain('application')
    }
  })

  it('a library states its exported boundary types where a composition root need not', () => {
    const boundary = rolesOf('explicit-module-boundary-types')
    expect(boundary).toContain('library')
    expect(boundary).not.toContain('service')
    expect(boundary).not.toContain('application')
  })

  it('config roles relax the surface rules and keep the correctness rules', () => {
    expect(rolesOf('no-console')).not.toContain('config-file')
    expect(rolesOf('no-console')).not.toContain('js-config')
    expect(rolesOf('no-explicit-any')).toContain('config-file')
  })

  it('type-aware policy does not reach the JavaScript-config role', () => {
    for (const typed of ['no-floating-promises', 'await-thenable']) {
      expect(rolesOf(typed)).not.toContain('js-config')
    }
  })

  it('the exported test role relaxes the typed unsafe policies that a single file cannot show', () => {
    for (const relaxed of [
      'no-unsafe-assignment',
      'no-unsafe-argument',
      'no-unsafe-member-access',
    ]) {
      expect(rolesOf(relaxed), relaxed).not.toContain('exported-test')
      expect(rolesOf(relaxed), relaxed).toContain('library')
    }
    // ...and keeps the ones that catch a test that never runs its assertions.
    expect(rolesOf('no-floating-promises')).toContain('exported-test')
  })
})

// ── ordinary tests are not the exported test role ───────────────────────────

describe('member-role assignment and the exported test role stay separate (ADV-ROLE-002)', () => {
  it('an ordinary test file resolves to its MEMBER role, because nothing else can', () => {
    // The retired engine chose a config PER FILE, so a test file acquiring the
    // relaxed role was a live possibility and had to be probed for. The
    // surviving engine is handed one config per member, and a per-file
    // override would have to be written INTO that config to change it.
    //
    // So the property is now checked where it could actually be broken: no
    // generated config may carry per-file targeting at all. The engine
    // supports it; the policy does not use it, and a role that varied inside a
    // member would put a second, unreviewed contract in the same package.
    for (const role of GENERATED_ROLES as string[]) {
      const keys = Object.keys(GENERATED[role])
      expect(keys, `${role} must not target files`).not.toContain('overrides')
      expect(keys, `${role} must not target files`).not.toContain('files')
    }
  })

  it('the exported role is genuinely more permissive, and applies to nothing', () => {
    expect(countFor('exported-test')).toBeLessThan(countFor('library'))
    for (const relaxed of [
      'no-console',
      'no-restricted-globals',
      'no-explicit-any',
      'no-unsafe-assignment',
    ]) {
      expect(rolesOf(relaxed), `${relaxed} relaxed by the exported role`).not.toContain(
        'exported-test',
      )
      expect(rolesOf(relaxed), `${relaxed} still blocks for members`).toContain('library')
    }
  })

  it('offers no bare `test` role that could blur the two', () => {
    expect(POLICY.policies.flatMap((p: any) => p.roles)).not.toContain('test')
  })

  it('no member ships an engine configuration of its own', () => {
    // Stronger than the check it replaces, and for the same reason. A member
    // used to be able to compose the exported test role in its own
    // `eslint.config.js`; task 3.4 deleted those files, so the guard is now
    // that a member has NO local engine config to compose anything in --
    // whatever the engine, and whatever role it might name.
    for (const rel of readMembers()) {
      for (const name of ['eslint.config.js', 'eslint.config.mjs', '.oxlintrc.json']) {
        expect(existsSync(path.join(REPO_ROOT, rel, name)), `${rel}/${name}`).toBe(false)
      }
    }
  })
})

// ── the one admitted exception (ADV-ROLE-001) ───────────────────────────────

describe('the coding-adapter process entry cannot broaden', () => {
  const RELAXED = ['no-console', 'no-restricted-globals', 'no-restricted-properties']
  const ADAPTER = path.join(REPO_ROOT, 'agents', 'adapters', 'coding', 'claude-code')

  it('relaxes exactly those three and nothing else, by the policy', () => {
    const relaxed = POLICY.policies
      .filter((p: any) => p.roles.includes('library') && !p.roles.includes('adapter-bin'))
      .map((p: any) => p.id)
      .sort()
    expect(relaxed).toEqual([...RELAXED].sort())
  })

  it('and the adapter cannot relax anything for itself', () => {
    // The PATH half used to be a property of the adapter's own config, which
    // named `src/bin.ts` in its own bytes. That file is gone: the bound now
    // lives in the runner, which lints the entry point separately (proved
    // end to end in `lint-wiring.test.ts`). What must hold HERE is that the
    // adapter has no way to widen it -- no local config, and a lint script
    // that goes through the capability rather than the engine.
    expect(existsSync(path.join(ADAPTER, 'eslint.config.js'))).toBe(false)
    expect(existsSync(path.join(ADAPTER, '.oxlintrc.json'))).toBe(false)
    const script = String(
      JSON.parse(readFileSync(path.join(ADAPTER, 'package.json'), 'utf8')).scripts.lint,
    )
    expect(script).toContain('secure-home-lint')
    expect(script).not.toMatch(/\boxlint\b/)
  })

  it('keeps every correctness policy in force at that entry', () => {
    for (const kept of [
      'no-floating-promises',
      'no-explicit-any',
      'explicit-module-boundary-types',
      'eqeqeq',
    ]) {
      expect(rolesOf(kept), kept).toContain('adapter-bin')
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

  it('the replacement engine is never asked to format, and its reporter is pinned', () => {
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-parity.mjs'), 'utf8')
    // The engine's `--format` selects an output REPORTER, not a code formatter:
    // a flag-name collision. Banning the string outright also banned pinning
    // the reporter -- and an unpinned reporter is not inert, because the engine
    // emits a different one when it detects a CI runner. That silently blinded
    // parse-error attribution on every hosted runner while passing locally.
    // So this guards what it always meant, in both directions.
    //
    // Formatting authority: the engine must never rewrite source.
    expect(runner).not.toMatch(/\boxfmt\b/)
    // Reporter: every occurrence must be pinned to a machine-readable value,
    // never left to the environment.
    // Quoted, so this inspects argv literals rather than prose about them.
    const reporters = [...runner.matchAll(/'--format(?:=([a-z]+))?'/g)].map((m) => m[1])
    expect(reporters.length).toBeGreaterThan(0)
    for (const reporter of reporters) expect(reporter).toBe('json')
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
  // Lint discovery is the member's own manifest now: `run-lint.mjs` lints each
  // member in its own directory, so the corpus is out of reach exactly while
  // its owner declines to be linted. See `checkFixtureProjection`.
  'packages/lint-config/package.json',
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
      // The corpus is out of the engine's reach because its OWNER declines to
      // be linted. Give this member a real lint script and every deliberately
      // invalid fixture becomes a build failure.
      'packages/lint-config/package.json',
      (t: string) => {
        const manifest = JSON.parse(t)
        manifest.scripts.lint = 'secure-home-lint src'
        return JSON.stringify(manifest, null, 2)
      },
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
  expect(found.length).toBeGreaterThanOrEqual(18)
  return found
}
