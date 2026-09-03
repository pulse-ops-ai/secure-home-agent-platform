/**
 * Repository-wide member-role assignment.
 *
 * The oracle resolves ONE representative file per role, which establishes what
 * a role means and is blind to who consumes it. A package could switch from
 * `library` to `service`, silently dropping the process restrictions, and every
 * representative probe would still pass. These tests drive the assignment check
 * against throwaway workspaces, so a passing result means drift is detectable
 * and not merely absent today.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore -- dependency-free .mjs checker, deliberately untyped
import { checkMemberRoles, expectedRoleFor, members } from '../src/check-policy.mjs'

const problems = (root: string): string[] => checkMemberRoles(root) as string[]

function member(
  root: string,
  rel: string,
  { config, lint = 'eslint .' }: { config?: string; lint?: string },
): void {
  const dir = path.join(root, rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, scripts: { lint } }))
  if (config !== undefined) writeFileSync(path.join(dir, 'eslint.config.js'), config)
}

const composes = (role: string): string =>
  `import config from '@secure-home/eslint-config/${role}'\nexport default config\n`

// ── the live repository ─────────────────────────────────────────────────────

describe('the real workspace', () => {
  it('discovers every member and finds no assignment drift', () => {
    expect((members() as string[]).length).toBeGreaterThanOrEqual(19)
    expect(problems(path.join(import.meta.dirname, '..', '..', '..'))).toEqual([])
  })
})

// ── drift the representative probes cannot see ──────────────────────────────

describe('role assignment drift', () => {
  it('catches a package composing the service role', () => {
    const root = makeRoot()
    member(root, 'packages/contracts', { config: composes('service') })
    expect(problems(root).join('\n')).toMatch(
      /packages\/contracts: composes the "service" role but the projection says "library"/,
    )
  })

  it('catches a service composing the library role', () => {
    const root = makeRoot()
    member(root, 'services/control-plane', { config: composes('library') })
    expect(problems(root).join('\n')).toMatch(/the projection says "service"/)
  })

  it('catches an application composing the library role', () => {
    const root = makeRoot()
    member(root, 'apps/web', { config: composes('library') })
    expect(problems(root).join('\n')).toMatch(/the projection says "application"/)
  })

  it('accepts each member sitting on its projected role', () => {
    const root = makeRoot()
    member(root, 'packages/contracts', { config: composes('library') })
    member(root, 'services/control-plane', { config: composes('service') })
    member(root, 'apps/web', { config: composes('application') })
    expect(problems(root)).toEqual([])
  })
})

describe('members that run no engine', () => {
  it('refuses a member with no config that is not declared non-linting', () => {
    const root = makeRoot()
    member(root, 'packages/mystery', { lint: 'eslint .' })
    expect(problems(root).join('\n')).toMatch(
      /packages\/mystery: no eslint\.config\.js, and it is not a declared non-linting member/,
    )
  })

  it('refuses a declared non-linting member whose script does not say so', () => {
    const root = makeRoot()
    member(root, 'packages/tsconfig', { lint: 'eslint .' })
    expect(problems(root).join('\n')).toMatch(/its lint script does not say so/)
  })

  it('accepts a declared non-linting member that says so out loud', () => {
    const root = makeRoot()
    member(root, 'packages/tsconfig', { lint: 'node -e "console.log(\'no lint: JSON-only\')"' })
    expect(problems(root)).toEqual([])
  })

  it('refuses a declared non-linting member that ships a config anyway', () => {
    const root = makeRoot()
    member(root, 'packages/tsconfig', {
      config: composes('library'),
      lint: 'node -e "console.log(\'no lint\')"',
    })
    expect(problems(root).join('\n')).toMatch(
      /declared non-linting but ships an eslint\.config\.js/,
    )
  })
})

describe('the self-linting engine package', () => {
  it('accepts it linting itself with what it exports', () => {
    const root = makeRoot()
    member(root, 'packages/eslint-config', {
      config: "import config from './index.js'\nexport default config\n",
    })
    expect(problems(root)).toEqual([])
  })

  it('refuses it consuming a published role instead, which would be circular', () => {
    const root = makeRoot()
    member(root, 'packages/eslint-config', { config: composes('library') })
    expect(problems(root).join('\n')).toMatch(/must lint itself with what it exports/)
  })
})

describe('local overrides', () => {
  it('admits the one coding-adapter process entry', () => {
    const root = makeRoot()
    member(root, 'agents/adapters/coding/claude-code', {
      config: `${composes('library')}export const extra = [{ files: ['src/bin.ts'], rules: {} }]\n`,
    })
    expect(problems(root)).toEqual([])
  })

  it('refuses any other local override, wherever it appears', () => {
    const root = makeRoot()
    member(root, 'packages/contracts', {
      config: `${composes('library')}export const extra = [{ files: ['src/**'], rules: {} }]\n`,
    })
    expect(problems(root).join('\n')).toMatch(
      /carries a local override for .*Policy is repository-wide/s,
    )
  })

  it('refuses an adapter override aimed at something other than the bin entry', () => {
    const root = makeRoot()
    member(root, 'agents/adapters/coding/claude-code', {
      config: `${composes('library')}export const extra = [{ files: ['src/plan.ts'], rules: {} }]\n`,
    })
    expect(problems(root).join('\n')).toMatch(/carries a local override/)
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
