/**
 * The production dual-engine entry point.
 *
 * Up to 1.11 the replacement engine was evidence. This is the wiring that makes
 * it part of merge admission, so the failure that matters is not "a rule
 * misfired" but "an engine did not run and nobody noticed" -- because an engine
 * that does not run reports no violations, and at every layer above that is
 * indistinguishable from clean code.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  ENGINE_BINARIES,
  LINT_CAPABILITY,
  LINT_PREREQUISITES,
  NON_LINTING_MEMBERS,
  checkLintWiring,
  members,
} from '../src/check-policy.mjs'
// @ts-ignore
import { LintEngineFailure, lintMember, roleForMember, typedBackendEnv } from '../src/run-lint.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const manifest = (rel: string): any =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, rel, 'package.json'), 'utf8'))
const lintScript = (rel: string): string => String(manifest(rel).scripts?.lint ?? '')

describe('every member reaches both engines through the capability', () => {
  it('passes the wiring check as committed', () => {
    expect(checkLintWiring(REPO_ROOT)).toEqual([])
  })

  it('covers every linting member', () => {
    const linting = (members(REPO_ROOT) as string[]).filter(
      (rel) => !(NON_LINTING_MEMBERS as Set<string>).has(rel),
    )
    expect(linting.length).toBe(17)
    for (const rel of linting) {
      expect(lintScript(rel), rel).toContain(LINT_CAPABILITY as string)
    }
  })

  it('no member assembles its own engine commands', () => {
    for (const rel of members(REPO_ROOT) as string[]) {
      const script = lintScript(rel)
      for (const engine of ENGINE_BINARIES as string[]) {
        expect(
          new RegExp(`(^|[\\s&|])${engine}([\\s]|$)`).test(script),
          `${rel} invokes ${engine} directly`,
        ).toBe(false)
      }
    }
  })

  it('preserves each member-specific prerequisite', () => {
    for (const [rel, prerequisite] of LINT_PREREQUISITES as Map<string, string>) {
      expect(lintScript(rel), rel).toContain(prerequisite)
    }
  })

  it('keeps the JSON-only packages linting nothing', () => {
    for (const rel of NON_LINTING_MEMBERS as Set<string>) {
      expect(lintScript(rel)).toMatch(/no lint/)
      expect(lintScript(rel)).not.toContain(LINT_CAPABILITY as string)
    }
  })
})

describe('role selection comes from the existing authority', () => {
  it('projects each member onto the role 1.11 proved', () => {
    expect(roleForMember('packages/contracts')).toBe('library')
    expect(roleForMember('services/runner-control')).toBe('service')
    expect(roleForMember('apps/web')).toBe('application')
    expect(roleForMember('agents/adapters/coding/claude-code')).toBe('library')
  })

  it('declines to lint a member declared non-linting', () => {
    expect(roleForMember('packages/tsconfig')).toBeUndefined()
  })

  it('refuses rather than guessing for an unplaced member', () => {
    expect(() => roleForMember('somewhere/else')).toThrow(LintEngineFailure as never)
  })

  it('holds no second member-to-role table of its own', () => {
    // A copy here would agree today and diverge the first time a member moved,
    // and the runner's copy is the one that would silently win.
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')
    expect(runner).toMatch(/expectedRoleFor/)
    expect(runner).not.toMatch(/services\/.*:.*'service'/)
  })
})

describe('production typed lint is really typed', () => {
  const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')

  it('passes --type-aware to the replacement engine', () => {
    expect(runner).toMatch(/'--type-aware'/)
  })

  it('points the engine at the MEMBER tsconfig, not the fixture corpus', () => {
    expect(runner).toMatch(/'--tsconfig', project/)
    expect(runner).not.toMatch(/FIXTURE_TSCONFIG/)
  })

  it('refuses a member with no TypeScript project', () => {
    // Without a project the typed policies do not run and the engine exits 0,
    // enforcing a fraction of the contract while looking identical to enforcing
    // all of it.
    expect(runner).toMatch(/has no tsconfig\.json, so typed policies cannot execute/)
  })

  it('puts the typed backend on PATH, since the engine shells out to it', () => {
    const env = typedBackendEnv({ PATH: '/usr/bin' }) as { PATH: string }
    expect(env.PATH).toMatch(/lint-config\/node_modules\/\.bin/)
    expect(env.PATH).toMatch(/\/usr\/bin$/)
  })
})

describe('neither engine can mask the other', () => {
  const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')

  it('evaluates both before returning a verdict', () => {
    // Short-circuiting on the legacy result would leave a replacement failure
    // unreported whenever ESLint happened to fail first.
    expect(runner).toMatch(/ok: legacy\.ok && replacement\.ok/)
  })

  it('treats a missing binary as fatal rather than as a skip', () => {
    expect(runner).toMatch(/the dual-engine contract cannot run/)
    expect(runner).not.toMatch(/if-present|catch\s*\{\s*\}/)
  })
})

describe('lint does not absorb the other authorities', () => {
  const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')

  it('does not typecheck', () => {
    expect(runner).not.toMatch(/\btsc\b|--noEmit/)
  })

  it('does not check import direction', () => {
    expect(runner).not.toMatch(/check-source-imports|check-workspace/)
  })

  it('leaves those commands independently declared at the root', () => {
    const root = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
    expect(root.scripts.typecheck).toBeTruthy()
    expect(root.scripts['check:imports']).toBeTruthy()
    expect(root.scripts.lint).not.toMatch(/typecheck|check:imports/)
  })
})

describe('both engines actually execute', () => {
  // Source inspection cannot see an engine that was removed and replaced with a
  // hardcoded pass. Only running the thing can, so this lints a member that
  // really violates policy and requires BOTH engines to have said so.
  // A member-shaped subject that belongs to no workspace glob. Writing the
  // violation into a real member mutates state other members' suites scan
  // while they run in parallel -- which it did, surfacing as phantom
  // import-direction failures in runner-core.
  const SUBJECT = path.join(HERE, 'lint-subject')
  const VIOLATION = path.join(SUBJECT, 'src', 'violation.ts')

  it('a real violation is reported by the legacy AND the replacement engine', () => {
    writeFileSync(VIOLATION, 'export const take = (v: any): any => v\n')
    try {
      const result = lintMember({
        memberDir: SUBJECT,
        rel: 'packages/contracts',
        paths: ['src'],
      }) as {
        ok: boolean
        legacy: { ok: boolean; output: string }
        replacement: { ok: boolean; output: string }
      }

      expect(result.ok, 'lint must fail').toBe(false)
      expect(result.legacy.ok, 'the legacy engine must have run and objected').toBe(false)
      expect(result.replacement.ok, 'the replacement engine must have run and objected').toBe(false)
      expect(result.legacy.output).toMatch(/no-explicit-any/)
      expect(result.replacement.output).toMatch(/no-explicit-any/)
    } finally {
      rmSync(VIOLATION, { force: true })
    }
  })

  it('the same member passes once the violation is gone', () => {
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
    }) as { ok: boolean }
    expect(result.ok).toBe(true)
  })

  it('a typed-only violation is caught, proving typed execution in production', () => {
    // `no-floating-promises` is undecidable without type information. If the
    // production run were untyped this would pass silently.
    writeFileSync(VIOLATION, 'export function run(p: Promise<void>): void {\n  p\n}\n')
    try {
      const result = lintMember({
        memberDir: SUBJECT,
        rel: 'packages/contracts',
        paths: ['src'],
      }) as { ok: boolean; replacement: { output: string } }
      expect(result.ok).toBe(false)
      expect(result.replacement.output).toMatch(/no-floating-promises/)
    } finally {
      rmSync(VIOLATION, { force: true })
    }
  })
})
