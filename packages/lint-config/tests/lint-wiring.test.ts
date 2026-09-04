/**
 * The production dual-engine entry point.
 *
 * Up to 1.11 the replacement engine was evidence. This is the wiring that makes
 * it part of merge admission, so the failure that matters is not "a rule
 * misfired" but "an engine did not run and nobody noticed" -- because an engine
 * that does not run reports no violations, and at every layer above that is
 * indistinguishable from clean code.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
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
import {
  LintEngineFailure,
  lintMember,
  resolveTypedBackend,
  roleForMember,
  typedAnalysisRan,
  typedBackendEnv,
} from '../src/run-lint.mjs'

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
    expect(runner).toMatch(/'--tsconfig',\s*\n?\s*project/)
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

describe('a missing typed backend fails lint closed', () => {
  // The seam this closes: measured on this workspace, Oxlint with an absent
  // tsgolint prints NOTHING and exits 0. A runner that trusts the exit code
  // enforces the static half of the contract and reports success, and the only
  // signal would be 24 type-aware policies quietly no longer being checked.
  const SUBJECT = path.join(HERE, 'lint-subject')

  it('the engine really does exit 0 with no output when the backend is gone', () => {
    // Asserted rather than assumed, because the whole defence is built on it.
    const oxlint = path.join(HERE, '..', 'node_modules', '.bin', 'oxlint')
    const nodeDir = path.dirname(process.execPath)
    const result = spawnSync(
      oxlint,
      [
        '--type-aware',
        '--tsconfig',
        'tsconfig.json',
        '--config',
        path.join(HERE, '..', 'generated', 'oxlintrc.library.json'),
        'src',
      ],
      { cwd: SUBJECT, encoding: 'utf8', env: { PATH: `${nodeDir}:/usr/bin:/bin` } },
    )
    expect(result.status, 'the engine exits cleanly without its backend').toBe(0)
  })

  it('the capability refuses when its own tsgolint is missing', () => {
    const absent = path.join(HERE, 'lint-subject')
    expect(() => resolveTypedBackend(absent)).toThrow(LintEngineFailure as never)
    expect(() => resolveTypedBackend(absent)).toThrow(/typed backend is missing/)
  })

  it('resolves the backend the CAPABILITY owns, not an ambient copy', () => {
    // A member-owned or PATH-supplied backend would let the subject supply the
    // toolchain that judges it.
    const backend = resolveTypedBackend() as string
    expect(backend).toBe(path.join(HERE, '..', 'node_modules', '.bin', 'tsgolint'))
  })

  it('lintMember refuses before invoking the engine at all', () => {
    // Preflight, not post-hoc: there is no output to inspect afterwards.
    const runner = readFileSync(path.join(HERE, '..', 'src', 'run-lint.mjs'), 'utf8')
    const preflight = runner.indexOf('resolveTypedBackend()')
    const invocation = runner.indexOf('--type-aware')
    expect(preflight).toBeGreaterThan(0)
    expect(preflight, 'the backend check must precede the engine call').toBeLessThan(invocation)
  })
})

describe('a silently-lost typed backend is refused even on exit 0', () => {
  it('output reporting a missing backend is a FAILURE whatever the exit code', () => {
    // The nastier case: a process that announces the failure and exits
    // successfully. The exit code is exactly what proved untrustworthy, so the
    // classifier does not consult it.
    expect(typedAnalysisRan('Failed to find tsgolint executable')).toBe(false)
    expect(typedAnalysisRan('warning: tsgolint not found')).toBe(false)
    expect(typedAnalysisRan('could not start tsgolint')).toBe(false)
  })

  it('ordinary output is not mistaken for a backend failure', () => {
    expect(typedAnalysisRan('')).toBe(true)
    expect(typedAnalysisRan('src/x.ts:1:1: error typescript(no-explicit-any): ...')).toBe(true)
  })

  it('a fake engine printing the failure and exiting 0 still fails the run', () => {
    // End to end through the real classifier, with a stand-in process that
    // behaves exactly as the hostile case describes.
    const fake = path.join(mkdtempSync(path.join(tmpdir(), 'fake-engine-')), 'oxlint')
    writeFileSync(fake, '#!/bin/sh\necho "Failed to find tsgolint executable"\nexit 0\n')
    chmodSync(fake, 0o755)

    const result = spawnSync(fake, [], { encoding: 'utf8' })
    expect(result.status, 'the stand-in exits successfully').toBe(0)
    expect(typedAnalysisRan(result.stdout), 'yet the run must be judged a failure').toBe(false)
  })
})

describe('the fail-closed path, driven end to end', () => {
  const SUBJECT = path.join(HERE, 'lint-subject')

  /** A stand-in engine pair whose replacement announces a dead backend. */
  const deadBackend = (command: string): { ok: boolean; output: string } =>
    command.includes('oxlint')
      ? { ok: true, output: 'Failed to find tsgolint executable' }
      : { ok: true, output: '' }

  it('a replacement that exits 0 with a dead backend fails the whole run', () => {
    // Both stand-ins "succeed". Only the output betrays that the type-aware
    // half never ran, and the run must still fail.
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: deadBackend,
    }) as { ok: boolean; replacement: { ok: boolean; output: string } }

    expect(result.replacement.ok, 'the replacement result must be a failure').toBe(false)
    expect(result.ok, 'and the member must fail lint').toBe(false)
    expect(result.replacement.output).toMatch(/typed backend did not start/)
  })

  it('the same stand-ins pass when the replacement says nothing', () => {
    // The control. Without it the test above would also pass if lintMember
    // simply failed everything.
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: () => ({ ok: true, output: '' }),
    }) as { ok: boolean }
    expect(result.ok).toBe(true)
  })

  it('a legacy failure alone still fails the run', () => {
    const result = lintMember({
      memberDir: SUBJECT,
      rel: 'packages/contracts',
      paths: ['src'],
      execute: (command: string) =>
        command.includes('oxlint')
          ? { ok: true, output: '' }
          : { ok: false, output: 'legacy violation' },
    }) as { ok: boolean }
    expect(result.ok).toBe(false)
  })
})
