/**
 * The bounded TypeScript 6 API compatibility seam.
 *
 * The architecture gate needs a PARSER, not compiler authority. While it
 * imported `typescript`, the two were the same object: a compiler cutover would
 * silently change how architecture is parsed, and the gate would move with the
 * compiler whether or not anyone intended it.
 *
 * The seam separates them, and its failure modes are both silent. Widening it
 * turns a parsing surface into a general compiler dependency. Reverting it
 * erases the boundary entirely while everything still passes, because the
 * traditional API and the current compiler agree today -- the coupling only
 * reappears at the cutover, when the boundary that was meant to absorb it is
 * gone.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  COMPATIBILITY_PACKAGE,
  NORMAL_COMPILER,
  checkCompatibilitySeam,
  checkNormalCompilerAuthority,
  members,
} from '../src/check-policy.mjs'

const HERE = import.meta.dirname
const REPO_ROOT = path.join(HERE, '..', '..', '..')
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8')
const json = (rel: string): any => JSON.parse(read(rel))
const BOUNDARIES = json('scripts/toolchain-boundaries.json')

describe('the seam exists and is a singleton', () => {
  it('passes both guards as committed', () => {
    expect(checkCompatibilitySeam(REPO_ROOT)).toEqual([])
    expect(checkNormalCompilerAuthority(REPO_ROOT)).toEqual([])
  })

  it('admits exactly one consumer', () => {
    expect(BOUNDARIES.compatibilityConsumers).toEqual(['scripts/check-source-imports.mjs'])
  })

  it('the admitted consumer really imports the seam', () => {
    // Presence, not just narrowness. An allowlist naming a file that no longer
    // imports the seam describes a boundary that does not exist.
    expect(read('scripts/check-source-imports.mjs')).toMatch(
      new RegExp(`from '${COMPATIBILITY_PACKAGE}'`),
    )
  })

  it('no other script imports it', () => {
    const offenders = (
      readFileSync(path.join(REPO_ROOT, 'scripts', 'check-source-imports.mjs'), 'utf8') ? [] : []
    ) as string[]
    void offenders
    // Derived from the tree by the guard itself; asserted here as a fact.
    expect(checkCompatibilitySeam(REPO_ROOT)).toEqual([])
  })

  it('the allowlist names a file, never a glob', () => {
    for (const entry of BOUNDARIES.compatibilityConsumers as string[]) {
      expect(entry).not.toMatch(/\*/)
    }
  })
})

describe('the seam is not a compiler', () => {
  it('the normal compiler is still declared and still pinned', () => {
    const root = json('package.json')
    expect(root.devDependencies[NORMAL_COMPILER as string]).toBe('catalog:')
    expect(root.devDependencies[COMPATIBILITY_PACKAGE as string]).toBe('catalog:')
  })

  it('the authoritative compiler pin is unchanged', () => {
    expect(read('pnpm-workspace.yaml')).toMatch(/^ {2}typescript: 6\.0\.3$/m)
  })

  it('no guarded entry point reaches the compatibility API', () => {
    const guarded = BOUNDARIES.normalCompilerEntryPoints as string[]
    expect(guarded).toContain('typecheck')
    expect(guarded).toContain('build')

    for (const rel of [
      'package.json',
      ...(members(REPO_ROOT) as string[]).map((m) => `${m}/package.json`),
    ]) {
      const scripts = (json(rel).scripts ?? {}) as Record<string, string>
      for (const [name, script] of Object.entries(scripts)) {
        if (!guarded.some((entry) => name === entry || name.startsWith(`${entry}:`))) continue
        expect(script, `${rel} ${name}`).not.toMatch(/tsc6|typescript6/)
      }
    }
  })

  it('every member typechecks with the normal compiler', () => {
    for (const rel of members(REPO_ROOT) as string[]) {
      const script = String((json(`${rel}/package.json`).scripts ?? {}).typecheck ?? '')
      if (script === '') continue
      // Some members run a manifest prerequisite first; what matters is that
      // the compiler invoked is `tsc`, never a compatibility shim.
      expect(script, rel).toMatch(/(^|&&\s*)tsc\b/)
      expect(script, rel).not.toMatch(/tsc6|typescript6/)
    }
  })

  it('no member depends on the compatibility package', () => {
    // Only the root may, because only the root hosts the admitted consumer.
    for (const rel of members(REPO_ROOT) as string[]) {
      const pkg = json(`${rel}/package.json`)
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        expect(pkg[field]?.[COMPATIBILITY_PACKAGE as string], `${rel} ${field}`).toBeUndefined()
      }
    }
  })
})

describe('behaviour is unchanged by the seam', () => {
  it('the gate still reports the traditional API version it parsed with', () => {
    // 6.0.2 of the compatibility package presents traditional API 6.0.3, which
    // is the identity the accepted audit records.
    expect(read('scripts/check-source-imports.mjs')).toMatch(/ts\.version/)
  })

  it('the seam and the compiler agree on the API surface the gate uses', async () => {
    const seam = (await import(COMPATIBILITY_PACKAGE as string)).default as Record<string, unknown>
    const compiler = (await import(NORMAL_COMPILER as string)).default as Record<string, unknown>
    const used = [
      'createSourceFile',
      'flattenDiagnosticMessageText',
      'forEachChild',
      'isCallExpression',
      'isExportDeclaration',
      'isExternalModuleReference',
      'isIdentifier',
      'isImportDeclaration',
      'isImportEqualsDeclaration',
      'isImportTypeNode',
      'isLiteralTypeNode',
      'isStringLiteral',
      'ScriptKind',
      'ScriptTarget',
      'SyntaxKind',
    ]
    for (const api of used) {
      expect(seam[api], `the seam must expose ${api}`).toBeDefined()
      expect(compiler[api], `the compiler exposes ${api} too, today`).toBeDefined()
    }
    // They agree NOW. That agreement is exactly why reverting the seam is
    // invisible, and why its presence is asserted rather than inferred.
    expect(seam['version']).toBe(compiler['version'])
  })
})

describe('the seam is bounded to one FILE, not to one directory', () => {
  // The scan read only `scripts/*.mjs`. A second consumer there was caught, but
  // the same import in any workspace package was caught by nothing at all --
  // not this check, not the architecture import gate, not the workspace gate.
  // The allowlist is a claim about the whole repository, so the scan must be
  // too, and that difference is invisible unless the consumer is placed outside
  // `scripts/`.
  const elsewhere = [
    'packages/lint-config/src/regression-second-consumer.mjs',
    'packages/contracts/src/regression-second-consumer.ts',
    'services/runner-control/src/regression-second-consumer.ts',
  ]

  it.each(elsewhere)('REFUSES an unadmitted consumer at %s', (rel) => {
    const absolute = path.join(REPO_ROOT, rel)
    mkdirSync(path.dirname(absolute), { recursive: true })
    writeFileSync(
      absolute,
      `import ts from '${COMPATIBILITY_PACKAGE}'\nexport const v = ts.version\n`,
    )
    try {
      const problems = checkCompatibilitySeam(REPO_ROOT)
      expect(problems.join('\n')).toContain(rel)
      expect(problems.join('\n')).toMatch(/not an admitted consumer/)
    } finally {
      rmSync(absolute, { force: true })
    }
  })

  it('still reports a clean tree once the intruder is gone', () => {
    expect(checkCompatibilitySeam(REPO_ROOT)).toEqual([])
  })
})

describe('a lint engine is not a compiler authority', () => {
  // The check looked only for the compatibility API, so a guarded entry point
  // could be repointed at the lint engine's type-aware mode and pass. That
  // retires the compiler authority without any decision being recorded: the
  // engine reads types to answer lint questions, it does not own whether the
  // repository compiles.
  const manifest = path.join(REPO_ROOT, 'package.json')

  it.each([
    ['typecheck', 'oxlint --type-aware'],
    ['build', 'eslint --fix'],
  ])('REFUSES "%s" resolving a lint engine', (entry, script) => {
    const original = readFileSync(manifest, 'utf8')
    const pkg = JSON.parse(original) as { scripts: Record<string, string> }
    pkg.scripts[entry] = script
    writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`)
    try {
      expect(checkNormalCompilerAuthority(REPO_ROOT).join('\n')).toMatch(
        /is not a compiler authority/,
      )
    } finally {
      writeFileSync(manifest, original)
    }
  })

  it('accepts the committed entry points, which resolve the normal compiler', () => {
    expect(checkNormalCompilerAuthority(REPO_ROOT)).toEqual([])
  })
})
