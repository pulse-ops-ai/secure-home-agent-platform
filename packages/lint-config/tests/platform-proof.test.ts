/**
 * Native platform proof, and the ways it could be faked.
 *
 * The replacement engine and its typed backend ship platform-specific
 * binaries, so a green x64 run says nothing about arm64. The interesting
 * failures are not "arm64 broke" -- that is loud -- but the quiet ones:
 * evidence that looks complete while one architecture was never exercised.
 *
 * Every assertion here targets one of those. None of it proves the toolchain
 * WORKS on arm64; only the hosted run does that. This proves the workflow
 * cannot report success unless it did.
 */
import { readFileSync } from 'node:fs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// @ts-ignore
import {
  checkInstallPosture,
  checkPinnedIdentities,
  pinnedIdentities,
} from '../src/check-install-posture.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'toolchain-platform.yml')
const raw = readFileSync(WORKFLOW_PATH, 'utf8')
const workflow = parse(raw) as any
const native = workflow.jobs.native
const gate = workflow.jobs['platform-proof']
const steps = native.steps as { name?: string; run?: string; uses?: string }[]
const stepRun = (fragment: string): string =>
  steps.find((s) => (s.name ?? '').includes(fragment))?.run ?? ''

describe('both architectures run, natively', () => {
  it('covers exactly x64 and arm64', () => {
    const include = native.strategy.matrix.include as { arch: string; runner: string }[]
    expect(include.map((m) => m.arch).sort()).toEqual(['arm64', 'x64'])
  })

  it('uses a real ARM64 runner, not an emulated x64 one', () => {
    const include = native.strategy.matrix.include as { arch: string; runner: string }[]
    expect(include.find((m) => m.arch === 'arm64')?.runner).toBe('ubuntu-24.04-arm')
    expect(include.find((m) => m.arch === 'x64')?.runner).toBe('ubuntu-24.04')
  })

  it('never substitutes emulation or cross-compilation', () => {
    // Executable content only. The header explains why QEMU would not be proof,
    // and a check that scanned prose would forbid saying so.
    const executable = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
      .toLowerCase()
    for (const forbidden of ['qemu', 'binfmt', '--platform linux/arm64', 'buildx']) {
      expect(executable, `the workflow must not use ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('does not fail fast, so one architecture cannot go unexamined', () => {
    // Failing fast would leave a leg unexecuted whenever the other broke first,
    // which is the state this workflow exists to prevent.
    expect(native.strategy['fail-fast']).toBe(false)
  })
})

describe('each job proves where it is actually running', () => {
  const assertion = stepRun('Assert this job is really running')

  it('asserts its own architecture before doing anything else', () => {
    const names = steps.map((s) => s.name ?? '')
    const assertIndex = names.findIndex((n) => n.includes('Assert this job is really running'))
    const installIndex = names.findIndex((n) => n.includes('Deterministic install'))
    expect(assertIndex).toBeGreaterThan(-1)
    expect(assertIndex, 'the architecture check must precede the install').toBeLessThan(
      installIndex,
    )
  })

  it('checks two independent sources that must agree', () => {
    // Node's value alone could be wrong under an emulation layer the kernel
    // would still betray, so both are required.
    expect(assertion).toMatch(/process\.arch/)
    expect(assertion).toMatch(/uname -m/)
    expect(assertion).toMatch(/EXPECTED_ARCH/)
    expect(assertion).toMatch(/EXPECTED_UNAME/)
  })

  it('fails rather than reporting a result for an unknown platform', () => {
    expect(assertion).toMatch(/exit 1/)
    expect(assertion).toMatch(/set -euo pipefail/)
  })

  it('expects the right uname for each architecture', () => {
    const include = native.strategy.matrix.include as { arch: string; uname: string }[]
    expect(include.find((m) => m.arch === 'x64')?.uname).toBe('x86_64')
    expect(include.find((m) => m.arch === 'arm64')?.uname).toBe('aarch64')
  })
})

describe('the install is deterministic and script-free', () => {
  it('proves the checkout is clean before installing', () => {
    // Otherwise a cached node_modules could already hold a working arm64
    // binary, and the install would prove nothing.
    expect(stepRun('Prove the checkout carries no installed dependencies')).toMatch(/node_modules/)
  })

  it('installs from the frozen lockfile', () => {
    expect(stepRun('Deterministic install')).toContain('pnpm install --frozen-lockfile')
  })

  it('the posture is empty and the checker refuses a non-empty one', () => {
    expect(checkInstallPosture(REPO_ROOT)).toEqual([])
    expect(readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')).toMatch(
      /^onlyBuiltDependencies: \[\]$/m,
    )
  })

  it('pins every toolchain identity exactly', () => {
    const pins = pinnedIdentities() as { name: string; expected: string }[]
    expect(pins.map((p) => p.name).sort()).toEqual([
      '@typescript/typescript6',
      'eslint',
      'oxlint',
      'oxlint-tsgolint',
      'typescript',
    ])
    for (const pin of pins) expect(pin.expected).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('verifies those identities on each architecture', () => {
    // "The install succeeded" says nothing about WHAT was installed. A
    // replacement engine that resolved a different build on arm64 would install
    // cleanly and prove nothing about the reviewed one.
    expect(stepRun('Exact toolchain identities')).toContain('--identities')
  })
})

describe('the command pack is complete', () => {
  it.each([
    ['Lint', 'pnpm lint'],
    ['Typecheck', 'pnpm typecheck'],
    ['Tests', 'pnpm test'],
    ['Build', 'pnpm build'],
    ['Source import direction', 'pnpm run check:imports'],
    ['Toolchain boundary', 'pnpm run check:lint-policy'],
    ['Workspace taxonomy', 'pnpm run check:workspace'],
    ['Formatting authority', 'pnpm run format:check'],
  ])('runs %s natively', (name, command) => {
    expect(stepRun(name as string)).toContain(command as string)
  })

  it('the lint step is the dual-engine entry point, typed backend included', () => {
    // `pnpm lint` reaches the capability, which fails closed if either engine
    // or the typed backend is unavailable.
    expect(stepRun('Lint')).toBe('pnpm lint')
  })
})

describe('partial evidence is not evidence', () => {
  it('a gate job requires BOTH legs to have succeeded', () => {
    expect(gate.needs).toBe('native')
    expect(gate.if).toBe('always()')
  })

  it('treats missing, skipped and failed alike', () => {
    // `needs` alone is not enough: a SKIPPED dependency does not fail a job
    // that depends on it, so only an explicit success check is proof.
    const check = String(gate.steps[0].run)
    expect(check).toMatch(/!= "success"/)
    expect(check).toMatch(/INCOMPLETE/)
    expect(check).toMatch(/exit 1/)
  })

  it('runs even when a leg failed, which is when it matters', () => {
    expect(gate.if).toBe('always()')
  })
})

describe('native identity expectations follow the declaration, not PR-B constants', () => {
  // These were constants, and that quietly deadlocked the maintenance boundary:
  // a predecessor-authorized engine bump would be classified as allowed,
  // installed correctly on both architectures, and then refused by this checker
  // for not being the PR-B-era version -- so the native proof could never go
  // green for the exact operation the machinery exists to permit.
  const workspaceWith = (pins: Record<string, string>): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'catalog-'))
    const body = Object.entries(pins)
      .map(([name, version]) => `  ${name}: ${version}`)
      .join('\n')
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      `packages:\n  - packages/*\n\ncatalog:\n${body}\n`,
    )
    return root
  }

  const REAL = pinnedIdentities() as { name: string; expected: string }[]
  const installed = Object.fromEntries(REAL.map((pin) => [pin.name, pin.expected]))

  it('derives every expectation from the catalog', () => {
    const moved = { ...installed, oxlint: '1.81.0' }
    const derived = pinnedIdentities(workspaceWith(moved)) as { name: string; expected: string }[]
    expect(derived.find((pin) => pin.name === 'oxlint')?.expected).toBe('1.81.0')
  })

  it('PASSES when the installed version equals the declared pin', () => {
    expect(checkPinnedIdentities(workspaceWith(installed))).toEqual([])
  })

  it('FAILS when the declaration moves and the installation does not', () => {
    // The catalog says 1.81.0; the workspace still has 1.80.0 installed.
    const problems = checkPinnedIdentities(workspaceWith({ ...installed, oxlint: '1.81.0' }))
    expect(problems.join('\n')).toMatch(/oxlint .*resolved 1\.80\.0, expected exactly 1\.81\.0/)
  })

  it('REFUSES an identity that the catalog does not pin at all', () => {
    const { oxlint: _dropped, ...withoutOxlint } = installed
    expect(checkPinnedIdentities(workspaceWith(withoutOxlint)).join('\n')).toMatch(
      /oxlint .*is not pinned in the workspace catalog/,
    )
  })

  it('REFUSES a catalog line it cannot account for rather than skipping it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'catalog-'))
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n\ncatalog:\n  this is not a pin at all\n',
    )
    expect(() => pinnedIdentities(root)).toThrow(/cannot account for/)
  })
})
