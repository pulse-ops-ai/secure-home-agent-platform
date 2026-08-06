/**
 * Tests for the shared TypeScript configurations.
 *
 * These configs are consumed by every member, so a mistake here is a
 * repository-wide mistake. The inheritance graph and the strictness flags are
 * asserted directly, and a real fixture is compiled to prove the settings
 * actually take effect rather than merely being present in JSON.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const PKG = fileURLToPath(new URL('..', import.meta.url))
// Resolved from THIS package's node_modules: pnpm links per package, so there
// is no hoisted binary at the repository root.
const TSC = join(PKG, 'node_modules', '.bin', 'tsc')

const ROLES = ['library', 'service', 'application', 'test'] as const

const read = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(PKG, `${name}.json`), 'utf8')) as Record<string, unknown>

const temps: string[] = []
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shtsconfig-'))
  temps.push(dir)
  return dir
}
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true })
})

/** Compile a fixture against a shared role config; return tsc's output. */
function compile(
  role: string,
  source: string,
  extraOptions: object = {},
): { ok: boolean; out: string } {
  const dir = scratch()
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'index.ts'), source)
  // Every workspace member is ESM. Without this the fixture resolves as
  // CommonJS under NodeNext and verbatimModuleSyntax rejects every export,
  // which would mask the flag actually under test.
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      extends: join(PKG, `${role}.json`),
      compilerOptions: { noEmit: true, ...extraOptions },
      include: [join(dir, 'src')],
    }),
  )
  try {
    execFileSync(TSC, ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' })
    return { ok: true, out: '' }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: string }
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    // A missing compiler would make every "expected to fail" assertion pass
    // vacuously. Surface it instead.
    if (e.code === 'ENOENT' || out.trim() === '') {
      throw new Error(`tsc did not run (${e.code ?? 'no output'}) — check ${TSC}`)
    }
    return { ok: false, out }
  }
}

describe('the exported configs exist and form the intended graph', () => {
  it('base is the single root', () => {
    expect(read('base')['extends']).toBeUndefined()
  })

  it.each(ROLES)('%s extends base directly — a narrow chain', (role) => {
    expect(read(role)['extends']).toBe('./base.json')
  })

  it('every role is reachable through a package export path', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
      exports: Record<string, string>
    }
    for (const role of ['base', ...ROLES]) {
      expect(pkg.exports[`./${role}`]).toBe(`./${role}.json`)
    }
  })

  it('a member extends by package path, not a relative traversal', () => {
    const dir = dirname(fileURLToPath(new URL('../../contracts/tsconfig.json', import.meta.url)))
    for (const file of ['tsconfig.json', 'tsconfig.build.json']) {
      const cfg = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>
      expect(String(cfg['extends'])).toMatch(/^@secure-home\/tsconfig\//)
      expect(String(cfg['extends'])).not.toContain('..')
    }
  })

  it('the build template separates the lint project from the emit project', () => {
    const dir = dirname(fileURLToPath(new URL('../../contracts/tsconfig.json', import.meta.url)))
    const lintProject = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8')) as Record<
      string,
      unknown
    >
    const buildProject = JSON.parse(
      readFileSync(join(dir, 'tsconfig.build.json'), 'utf8'),
    ) as Record<string, unknown>

    // tsconfig.json covers src AND tests and never emits, so lint and editors
    // see test files. tsconfig.build.json covers src only and emits, so a test
    // file can never reach dist/.
    expect(lintProject['extends']).toBe('@secure-home/tsconfig/test')
    expect(buildProject['extends']).toBe('@secure-home/tsconfig/library')
  })
})

describe('an invalid shared-config reference fails', () => {
  it('does not silently fall back to defaults', () => {
    const dir = scratch()
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}\n')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ extends: '@secure-home/tsconfig/does-not-exist', include: ['src'] }),
    )
    let failed = false
    try {
      execFileSync(TSC, ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' })
    } catch {
      failed = true
    }
    expect(failed).toBe(true)
  })
})

describe('strictness flags are active, not merely declared', () => {
  it('strict rejects an implicit any', () => {
    const r = compile('library', 'export function f(x) {\n  return x\n}\n')
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/implicitly has an 'any' type/)
  })

  it('noUncheckedIndexedAccess makes an index read possibly undefined', () => {
    const r = compile('library', 'export function f(a: string[]): string {\n  return a[0]\n}\n')
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/undefined/)
  })

  it('noImplicitReturns rejects a path that falls through', () => {
    // The return type includes `undefined`, so strictNullChecks is satisfied
    // and only noImplicitReturns can reject this. A `: number` return type
    // would be caught by strictNullChecks first (TS2366) and would not test
    // this flag at all.
    const r = compile(
      'library',
      'export function f(x: boolean): number | undefined {\n  if (x) {\n    return 1\n  }\n}\n',
    )
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/not all code paths return a value|TS7030/i)
  })

  it('exactOptionalPropertyTypes rejects assigning undefined to an optional', () => {
    const r = compile(
      'library',
      'interface T {\n  a?: string\n}\nexport const t: T = { a: undefined }\n',
    )
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/exactOptionalPropertyTypes|undefined/)
  })

  it('noPropertyAccessFromIndexSignature requires bracket access on an index signature', () => {
    const r = compile(
      'library',
      'interface T {\n  [k: string]: string\n}\nexport function f(t: T): string | undefined {\n  return t.anything\n}\n',
    )
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/index signature/i)
  })

  it('verbatimModuleSyntax keeps type and value imports distinct', () => {
    // A binding imported with `import type` must not be usable as a value.
    const r = compile(
      'library',
      'import type { readFileSync } from "node:fs"\nexport const v = readFileSync\n',
    )
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/import type|cannot be used as a value/i)
  })

  it('a correct fixture compiles cleanly under every role', () => {
    for (const role of ['library', 'service', 'application'] as const) {
      const r = compile(
        role,
        'export function add(a: number, b: number): number {\n  return a + b\n}\n',
      )
      expect(r.ok, `${role}: ${r.out}`).toBe(true)
    }
  })
})

describe('build output isolation', () => {
  it('base excludes generated directories from every consumer', () => {
    expect(read('base')['exclude']).toEqual(
      expect.arrayContaining(['${configDir}/dist', '${configDir}/node_modules']),
    )
  })

  it('library, service, and application emit into the consuming package', () => {
    for (const role of ['library', 'service', 'application'] as const) {
      const opts = read(role)['compilerOptions'] as Record<string, string>
      expect(opts['outDir']).toBe('${configDir}/dist')
      expect(opts['rootDir']).toBe('${configDir}/src')
    }
  })

  it('test never emits — tests are not build output', () => {
    expect((read('test')['compilerOptions'] as Record<string, unknown>)['noEmit']).toBe(true)
  })

  it('an application emits no declarations; a library does', () => {
    expect((read('application')['compilerOptions'] as Record<string, unknown>)['declaration']).toBe(
      false,
    )
    expect((read('base')['compilerOptions'] as Record<string, unknown>)['declaration']).toBe(true)
  })
})
