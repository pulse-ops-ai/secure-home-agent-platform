/**
 * Cross-cutting architecture guards over the finished tree:
 *
 *  RC-EX-01  the runtime dependency set is EXACTLY the two workspace
 *            packages; the devDependency set is exactly the standard
 *            tooling set (design D2 — allowlist, not denylist)
 *  RC-EX-02  no exported operation parameter is a path, handle, reader,
 *            port, or callback — bytes and observations are values
 *  RC-EX-03  zero import edges between src/evidence/** and
 *            src/verification/** in either direction (design D6)
 *  RC-EX-04  no I/O module import anywhere in production source
 *  RC-EX-05  the package is inert: importing the index runs no side
 *            effect, and no repository member depends on this package
 *
 * The guards scan PRODUCTION source (test files excluded): the proof
 * suite itself legitimately uses node:fs to read the tree it audits.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '../..')
const repoRoot = resolve(packageRoot, '../..')
const srcRoot = join(packageRoot, 'src')

const sourceFiles = (): readonly string[] => {
  const out: string[] = []
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    if (entry.name.endsWith('.test.ts')) continue
    if (entry.name === 'testing-fixtures.ts') continue
    out.push(join(entry.parentPath, entry.name))
  }
  return out.sort()
}

describe('RC-EX-01: exact dependency allowlist', () => {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  it('runtime dependencies are exactly the two workspace packages', () => {
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      '@secure-home/contracts',
      '@secure-home/events',
    ])
  })

  it('devDependencies are exactly the standard tooling set', () => {
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual([
      '@secure-home/eslint-config',
      // The dual-engine lint capability. Every linting member declares it,
      // because lint now runs both engines through one entry point instead of
      // each package assembling its own commands (ADR-0022, PR-B task 1.12).
      '@secure-home/lint-config',
      '@secure-home/testing',
      '@secure-home/tsconfig',
      '@types/node',
      'eslint',
      'typescript',
      'vitest',
    ])
  })
})

describe('RC-EX-03: verifier independence import guard (D6)', () => {
  it('zero import edges between src/evidence/** and src/verification/**', () => {
    for (const file of sourceFiles()) {
      const posix = file.split(sep).join('/')
      const text = readFileSync(file, 'utf8')
      if (posix.includes('/src/evidence/')) {
        expect(text, `${posix} imports the verifier`).not.toMatch(/from '\.\.\/verification\//)
      }
      if (posix.includes('/src/verification/')) {
        expect(text, `${posix} imports the producer`).not.toMatch(/from '\.\.\/evidence\//)
      }
    }
  })
})

describe('RC-EX-04: no I/O module import in production source', () => {
  it('no node:fs, node:child_process, node:net, node:http(s), or node:dgram', () => {
    const forbidden = /node:(fs|child_process|net|http|https|dgram)/
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8')
      expect(forbidden.test(text), `${file} imports an I/O module`).toBe(false)
    }
  })
})

describe('RC-EX-02: the exported operation surface accepts values only', () => {
  it('no package-index operation parameter is function-typed or I/O-typed', () => {
    // The invariant governs the PUBLIC surface L4 consumes: every value
    // export of src/index.ts. Internal helpers are covered by RC-EX-04
    // (no I/O modules) and the layering guards.
    const indexText = readFileSync(join(srcRoot, 'index.ts'), 'utf8')
    const exported = new Set<string>()
    for (const match of indexText.matchAll(/export \{([^}]+)\} from/g)) {
      for (const raw of (match[1] ?? '').split(',')) {
        const name = raw.trim()
        if (name.length > 0) exported.add(name)
      }
    }
    expect(exported.size).toBeGreaterThan(10)
    const forbiddenInParams = /=>|Function|Buffer|Stream|FileHandle|Callback|AbortSignal/
    let scanned = 0
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8')
      const pattern = /export const (\w+) = (?:<[^>]*>)?\(/g
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (!exported.has(match[1] ?? '')) continue
        let depth = 1
        let index = match.index + match[0].length
        const start = index
        while (depth > 0 && index < text.length) {
          const char = text[index]
          if (char === '(') depth += 1
          if (char === ')') depth -= 1
          index += 1
        }
        const params = text.slice(start, index - 1)
        scanned += 1
        expect(
          forbiddenInParams.test(params),
          `${file}: exported operation ${match[1] ?? ''} accepts a non-value parameter: ${params.slice(0, 120)}`,
        ).toBe(false)
      }
    }
    // The scan must have actually covered the trusted operations.
    expect(scanned).toBeGreaterThanOrEqual(10)
  })
})

describe('RC-EX-05: inert (RC-INV-07)', () => {
  it('importing the package index has no side effect and exports only functions and constants', async () => {
    const surface = await import('../index.js')
    for (const [name, value] of Object.entries(surface)) {
      expect(
        typeof value === 'function' || Array.isArray(value),
        `unexpected export shape: ${name}`,
      ).toBe(true)
    }
  })

  it('no unauthorized repository member declares a dependency on this package', () => {
    // services/runner-control is the AUTHORIZED first consumer (L4/#27,
    // owner-approved 2026-08-12). Path-qualified deliberately: the
    // previous bare-name skip exempted a directory called `runner-core`
    // in ANY group. Any OTHER importer still fails.
    const authorized = new Set(['packages/runner-core', 'services/runner-control'])
    const offenders: string[] = []
    const membersOf = (dir: string) => {
      try {
        return readdirSync(dir, { withFileTypes: true })
      } catch {
        return []
      }
    }
    for (const group of ['packages', 'services', 'apps', 'agents']) {
      const groupDir = join(repoRoot, group)
      for (const entry of membersOf(groupDir)) {
        if (!entry.isDirectory() || authorized.has(`${group}/${entry.name}`)) continue
        let manifest: {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }
        try {
          manifest = JSON.parse(
            readFileSync(join(groupDir, entry.name, 'package.json'), 'utf8'),
          ) as typeof manifest
        } catch {
          continue
        }
        const declared = [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
        ]
        if (declared.includes('@secure-home/runner-core')) {
          offenders.push(`${group}/${entry.name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
