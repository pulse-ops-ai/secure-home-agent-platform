/**
 * EX-001 (INV-001; "Trusted core is extraction-ready"): the workspace
 * direction checks reject a deployable import from this package. The
 * negative case is DEMONSTRATED — a fixture file carrying a
 * `services/*`-member import is written, the real check runs and fails
 * naming it, and the fixture is removed — not merely asserted.
 */
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '../..')
const repoRoot = resolve(packageRoot, '../..')
const fixture = join(packageRoot, 'src', 'ex001-negative-fixture.ts')

afterEach(() => {
  rmSync(fixture, { force: true })
})

const runImportCheck = (): { status: number; output: string } => {
  try {
    const output = execFileSync('node', [join(repoRoot, 'scripts', 'check-source-imports.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    return { status: 0, output }
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string }
    return {
      status: failed.status ?? 1,
      output: `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`,
    }
  }
}

describe('EX-001: dependency direction is mechanically enforced', () => {
  it('the check passes on the clean tree', () => {
    expect(runImportCheck().status).toBe(0)
  })

  it('a deployable import in this package FAILS the real check, naming the edge', () => {
    writeFileSync(fixture, "import '@secure-home/control-plane'\nexport const bad = true\n")
    const result = runImportCheck()
    expect(result.status, 'the direction check must reject a deployable import').not.toBe(0)
    expect(result.output).toContain('runner-core')
  })
})
