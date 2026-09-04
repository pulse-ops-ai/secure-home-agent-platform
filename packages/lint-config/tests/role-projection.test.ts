/**
 * Role and path parity, and the fixture-class projection.
 *
 * Rule-level parity is necessary and not sufficient. A migration can preserve
 * all 117 policies and still change the repository's behaviour by applying them
 * to the wrong files: relaxing a service to library rules, letting the exported
 * test role leak onto ordinary tests, or widening the one admitted process-entry
 * exception. None of that is visible in a per-rule fixture.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import { checkFixtureProjection, FIXTURE_CLASS } from '../src/check-policy.mjs'
// @ts-ignore
import { GENERATED_ROLES } from '../src/generate-oxlint-config.mjs'
// @ts-ignore
import { extractEffectivePolicy, MEMBER_TEST_PROBE } from '../src/extract-legacy-policy.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const load = (p: string): any => JSON.parse(readFileSync(path.join(HERE, '..', p), 'utf8'))

type Row = { ruleId: string; roles: string[] }
const rows = (await extractEffectivePolicy()) as Row[]
const rule = (id: string): Row | undefined => rows.find((r) => r.ruleId === id)
const countFor = (role: string): number => rows.filter((r) => r.roles.includes(role)).length

// ── the roles differ, and differ specifically ───────────────────────────────

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

  it('the generated replacement config differs per role by the same shape', () => {
    // If every role generated the same config, the counts above would be
    // preserved in policy while being erased in enforcement.
    const sizes = (GENERATED_ROLES as string[]).map(
      (role) => Object.keys(load(`generated/oxlintrc.${role}.json`).rules).length,
    )
    expect(new Set(sizes).size).toBeGreaterThan(1)
  })

  it('a library restricts process access where a service does not', () => {
    // The single most consequential role difference: a library must not read
    // the environment or exit, because that is the composing service's job.
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

  it('type-aware policy does not reach the JavaScript-config role', () => {
    for (const typed of [
      '@typescript-eslint/no-floating-promises',
      '@typescript-eslint/await-thenable',
    ]) {
      expect(rule(typed)?.roles).not.toContain('js-config')
    }
  })

  it('config roles relax the surface rules and keep the correctness rules', () => {
    expect(rule('no-console')?.roles).not.toContain('config-file')
    expect(rule('no-console')?.roles).not.toContain('js-config')
    expect(rule('@typescript-eslint/no-explicit-any')?.roles).toContain('config-file')
  })
})

// ── ordinary tests are not the exported test role ───────────────────────────

describe('member-role assignment and the exported test role stay separate', () => {
  it('an ordinary test file resolves to its MEMBER role', async () => {
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
})

// ── the one admitted exception ──────────────────────────────────────────────

describe('the coding-adapter process entry cannot broaden', () => {
  const RELAXED = ['no-console', 'no-restricted-globals', 'no-restricted-properties']

  it('relaxes exactly those three and nothing else', () => {
    const relaxed = rows
      .filter((r) => r.roles.includes('library') && !r.roles.includes('adapter-bin'))
      .map((r) => r.ruleId)
      .sort()
    expect(relaxed).toEqual([...RELAXED].sort())
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

// ── neutrality and formatting ───────────────────────────────────────────────

describe('framework neutrality', () => {
  it('no framework-specific rule is enforced anywhere', () => {
    // ADR-0003 and ADR-0012 keep framework rules with the issue that introduces
    // the framework. A migration that quietly imported a plugin preset would
    // add policy nobody decided.
    const FRAMEWORKS = /^(react|@next|next|vue|@angular|@nestjs|jest|jsx-a11y|import|n)\//
    const offenders = rows.filter((r) => FRAMEWORKS.test(r.ruleId))
    expect(offenders.map((r) => r.ruleId)).toEqual([])
  })

  it('the generated replacement config enables only known plugins', () => {
    for (const role of GENERATED_ROLES as string[]) {
      const plugins = load(`generated/oxlintrc.${role}.json`).plugins as string[]
      for (const plugin of plugins) expect(['typescript']).toContain(plugin)
    }
  })
})

describe('Prettier remains the sole formatting authority', () => {
  const FORMATTING = [
    'indent',
    'quotes',
    'semi',
    'comma-dangle',
    'max-len',
    'linebreak-style',
    'no-mixed-spaces-and-tabs',
    'space-before-function-paren',
    'object-curly-spacing',
  ]

  it('no formatting rule appears in the policy manifest', () => {
    const policy = load('policy.json')
    for (const id of FORMATTING) {
      expect(policy.policies.map((p: any) => p.id)).not.toContain(id)
    }
  })

  it('no formatting rule is enabled in any generated engine config', () => {
    for (const role of GENERATED_ROLES as string[]) {
      const rules = Object.keys(load(`generated/oxlintrc.${role}.json`).rules)
      for (const id of FORMATTING) expect(rules, `${role}`).not.toContain(id)
    }
  })

  it('the replacement engine is never asked to format', () => {
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-parity.mjs'), 'utf8')
    expect(runner).not.toMatch(/--format\b/)
  })
})

// ── the fixture class, across every reader ──────────────────────────────────

describe('the conformance corpus is excluded by four readers and consumed by one', () => {
  it('passes the projection check as committed', () => {
    expect(checkFixtureProjection(REPO_ROOT)).toEqual([])
  })

  it('covers the negative controls too', () => {
    expect(FIXTURE_CLASS as string[]).toContain('tests/fixtures/_negative-controls')
    for (const rel of FIXTURE_CLASS as string[]) {
      expect(existsSync(path.join(HERE, '..', rel)), rel).toBe(true)
    }
  })

  it.each([
    ['lint discovery', 'packages/eslint-config/base.js', /\*\*\/tests\/fixtures\/\*\*/],
    ['Prettier', '.prettierignore', /packages\/lint-config\/tests\/fixtures\//],
    ['source-import scanning', 'scripts/check-source-imports.mjs', /tests\/fixtures/],
  ])('%s currently excludes the corpus', (_name, file, pattern) => {
    const text = readFileSync(path.join(REPO_ROOT, file as string), 'utf8')
    expect(text).toMatch(pattern as RegExp)
  })

  it('the package compiler project excludes it', () => {
    const parsed = load('tsconfig.json')
    expect(parsed.exclude).toContain('tests/fixtures')
  })

  it('but the parity harness explicitly consumes it', () => {
    // The asymmetry that matters. A corpus nothing reads proves nothing, and
    // the failure would be silent: every parity assertion would still pass.
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-parity.mjs'), 'utf8')
    expect(runner).toMatch(/'tests',\s*'fixtures'/)
  })
})
