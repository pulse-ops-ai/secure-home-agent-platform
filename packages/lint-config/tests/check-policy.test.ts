/**
 * Repository-wide member-role assignment.
 *
 * The conformance corpus establishes what a ROLE means, one policy at a time,
 * and is blind to who consumes it. A package could move from `library` to
 * `service`, silently dropping the process restrictions, and every fixture
 * would still pass. These tests drive the assignment check against throwaway
 * workspaces, so a passing result means drift is detectable and not merely
 * absent today.
 *
 * Task 3.4 changed what a member can get WRONG. A member used to declare its
 * role by composing one in its own `eslint.config.js`, so composing the wrong
 * one was the drift to catch. With those files gone the role is derived from
 * the member's path and nothing else -- there is no second place to write it,
 * so miscomposition is not merely caught but unrepresentable. What remains
 * representable is a member that opts out, invents its own engine command, or
 * sits outside the taxonomy altogether.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore -- dependency-free .mjs checker, deliberately untyped
import {
  ADAPTER_BIN_OVERRIDE,
  LINT_CAPABILITY,
  checkAdmittedException,
  checkMemberRoles,
  checkRoleProjectionTable,
  expectedRoleFor,
  loadGeneratedConfigs,
  members,
} from '../src/check-policy.mjs'

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..')
const problems = (root: string): string[] => checkMemberRoles(root) as string[]
const load = (p: string): any =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, '..', p), 'utf8'))

const CAPABILITY = `${LINT_CAPABILITY as string} src`

function member(root: string, rel: string, { lint = CAPABILITY }: { lint?: string } = {}): void {
  const dir = path.join(root, rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, scripts: { lint } }))
}

// ── the live repository ─────────────────────────────────────────────────────

describe('the real workspace', () => {
  it('discovers every member and finds no assignment drift', () => {
    expect((members() as string[]).length).toBeGreaterThanOrEqual(18)
    expect(problems(REPO_ROOT)).toEqual([])
  })
})

// ── drift the per-policy fixtures cannot see ────────────────────────────────

describe('member assignment drift', () => {
  it('accepts each member sitting on its projected role', () => {
    const root = makeRoot()
    member(root, 'packages/contracts')
    member(root, 'services/control-plane')
    member(root, 'apps/web')
    member(root, 'agents/adapters/coding/claude-code')
    expect(problems(root)).toEqual([])
  })

  it('refuses a member that opts out of lint without being declared non-linting', () => {
    const root = makeRoot()
    member(root, 'packages/mystery', { lint: 'echo "no lint here"' })
    expect(problems(root).join('\n')).toMatch(
      /packages\/mystery: opts out of lint without being a declared non-linting member/,
    )
  })

  it('refuses a member with no lint script at all', () => {
    const root = makeRoot()
    const dir = path.join(root, 'packages/silent')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'silent' }))
    expect(problems(root).join('\n')).toMatch(/packages\/silent: has no lint script/)
  })

  it('refuses a member that assembles its own engine command', () => {
    // The drift that replaced composing a role. A member running the engine
    // directly picks its own config, its own rules and its own severity, and
    // owns lint semantics the policy is supposed to own.
    const root = makeRoot()
    member(root, 'packages/contracts', { lint: 'oxlint --config ./mine.json src' })
    expect(problems(root).join('\n')).toMatch(
      /packages\/contracts: its lint script does not go through secure-home-lint/,
    )
  })

  it('refuses a member outside every taxonomy prefix', () => {
    const root = makeRoot()
    member(root, 'agents/rogue')
    expect(problems(root).join('\n')).toMatch(
      /agents\/rogue: outside every taxonomy prefix, so no role can be projected/,
    )
  })
})

describe('members that run no engine', () => {
  it('refuses a declared non-linting member whose script does not say so', () => {
    const root = makeRoot()
    member(root, 'packages/tsconfig')
    expect(problems(root).join('\n')).toMatch(/its lint script does not say so/)
  })

  it('accepts a declared non-linting member that says so out loud', () => {
    const root = makeRoot()
    member(root, 'packages/tsconfig', { lint: 'node -e "console.log(\'no lint: JSON-only\')"' })
    expect(problems(root)).toEqual([])
  })
})

// ── ADV-ROLE-002 ────────────────────────────────────────────────────────────

describe('the exported test role is consumed by no member', () => {
  it('accepts the committed projection table', () => {
    expect(checkRoleProjectionTable()).toEqual([])
  })

  it('refuses a projection entry that hands a member the exported test role', () => {
    // Driven against a doctored table rather than a doctored member: the table
    // is the only place this could happen, because a member's role comes from
    // nowhere else.
    expect(
      (
        checkRoleProjectionTable([
          { prefix: 'packages/', role: 'exported-test', why: 'a smuggled relaxation' },
        ]) as string[]
      ).join('\n'),
    ).toMatch(/maps "packages\/" onto the exported test role\. No member consumes it/)
  })

  it('does not mistake an ordinary member role for it', () => {
    expect(
      checkRoleProjectionTable([{ prefix: 'packages/', role: 'library', why: 'a library' }]),
    ).toEqual([])
  })
})

// ── ADV-ROLE-001 ────────────────────────────────────────────────────────────

describe('the admitted process-entry exception', () => {
  const POLICY = load('policy.json')
  const MAPPINGS = load('engine-mappings.json')
  const generated = (): Record<string, any> => loadGeneratedConfigs() as Record<string, any>
  const check = (g: Record<string, any>): string[] =>
    checkAdmittedException(POLICY, MAPPINGS, g) as string[]

  it('the committed configs realise exactly the declared relaxation', () => {
    expect(ADAPTER_BIN_OVERRIDE.relaxes).toEqual([
      'no-console',
      'no-restricted-globals',
      'no-restricted-properties',
    ])
    expect(check(generated())).toEqual([])
  })

  it('refuses a fourth rule quietly relaxed at the entry point', () => {
    const g = generated()
    delete g['adapter-bin'].rules['eqeqeq']
    expect(check(g).join('\n')).toMatch(/relaxes eqeqeq, .* but the admitted exception declares/)
  })

  it('refuses a declared relaxation that stopped happening', () => {
    // The other direction, and the one that looks like nothing: the exception
    // still says three, the config only does two, and the entry point starts
    // failing on a rule the exception was written to permit.
    const g = generated()
    g['adapter-bin'].rules['no-console'] = ['error', {}]
    expect(check(g).join('\n')).toMatch(/relaxes no-restricted-globals, no-restricted-properties/)
  })

  it('refuses the exempt role enforcing something the member role does not', () => {
    // An exception may only relax. A rule that exists ONLY at the entry point
    // is a second policy nobody reviewed.
    const g = generated()
    g['adapter-bin'].rules['no-alert'] = 'error'
    expect(check(g).join('\n')).toMatch(
      /the "adapter-bin" role enforces no-alert, which "library" does not\. An exception may only relax/,
    )
  })

  it('refuses a declaration naming something that is not a policy', () => {
    const doctored = JSON.parse(JSON.stringify(POLICY))
    doctored.policies = doctored.policies.filter((p: any) => p.id !== 'no-console')
    expect(
      (checkAdmittedException(doctored, MAPPINGS, generated()) as string[]).join('\n'),
    ).toMatch(/relaxes "no-console", which is not a policy/)
  })
})

describe('the projection is a rule, not a list', () => {
  it.each([
    ['packages/brand-new', 'library'],
    ['services/brand-new', 'service'],
    ['apps/brand-new', 'application'],
    ['agents/adapters/coding/brand-new', 'library'],
  ])('covers %s the day it appears', (rel, role) => {
    expect((expectedRoleFor(rel) as { role: string }).role).toBe(role)
  })
})

// ── fixture roots ───────────────────────────────────────────────────────────

let counter = 0
function makeRoot(): string {
  const root = path.join(tmpdir(), `role-check-${process.pid}-${counter++}`)
  mkdirSync(root, { recursive: true })
  return root
}
