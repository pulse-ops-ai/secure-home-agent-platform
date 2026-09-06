/**
 * That the TYPED backend actually ran.
 *
 * A typed rule with no type information does not give a wrong answer, it gives
 * NO answer. So "the rule did not report" is ambiguous between two very
 * different states: the code was clean, or the analysis never happened. Every
 * typed conformance result is worthless until that ambiguity is closed.
 *
 * The hostile case removes the typed BACKEND while leaving the source
 * perfectly parseable, and requires the harness to fail BECAUSE typed
 * execution disappeared -- not merely because an expected diagnostic went
 * missing.
 *
 * The backend, specifically, and not the type environment. Task 3.4 retired
 * the engine that failed closed on a missing `tsconfig.json`; the surviving
 * engine does not, because it resolves a type environment further up the tree
 * and carries on. Parking the fixture tsconfig therefore proves nothing here.
 * What the surviving engine cannot do without is `tsgolint` -- and without it
 * Oxlint exits 0, which is the precise shape of silent downgrade this file
 * exists to make impossible.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import { resolveTypedBackend } from '../src/run-lint.mjs'
// @ts-ignore
import {
  FIXTURE_TSCONFIG,
  TYPED_SHARDS,
  TypedBackendUnavailable,
  configForRole,
  fixturePath,
  loadAuthorities,
  replacementDiagnostics,
  replacementTypedDiagnostics,
  roleFor,
} from '../src/run-parity.mjs'

const { policy } = loadAuthorities()
const AWAIT_THENABLE = fixturePath('typescript-typed-control/invalid/await-thenable.ts')

/**
 * A place where the typed backend is genuinely unreachable.
 *
 * The engine finds `tsgolint` two ways: by walking UP from its working
 * directory, and on PATH. BOTH have to go. A temp cwd alone passed when this
 * file was run directly and failed under `pnpm test`, because the package
 * manager puts `node_modules/.bin` on PATH and the engine found it there.
 *
 * Removing the backend from its reach rather than moving the binary aside is
 * deliberate: that executable is shared with the typed shards, and parking it
 * races every other test file in the run.
 */
const withoutBackend = <T>(use: (cwd: string, env: NodeJS.ProcessEnv) => T): T => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'no-backend-'))
  const searchPath = (process.env['PATH'] ?? '').split(path.delimiter)
  const reachable = searchPath.filter(
    (entry) => entry !== '' && existsSync(path.join(entry, 'tsgolint')),
  )
  const env = {
    ...process.env,
    PATH: searchPath.filter((entry) => !reachable.includes(entry)).join(path.delimiter),
  }
  try {
    return use(cwd, env)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

describe('the typed shards are identified, not assumed', () => {
  it('covers exactly the two shards that need type information', () => {
    expect([...(TYPED_SHARDS as Set<string>)].sort()).toEqual([
      'typescript-typed-control',
      'typescript-typed-unsafe',
    ])
  })

  it('has a dedicated type environment for the corpus', () => {
    expect(existsSync(FIXTURE_TSCONFIG as string)).toBe(true)
  })

  it('and a typed backend the production resolver can find', () => {
    // The same resolver the runner preflights with, so "the tests found one"
    // and "a lint run would find one" cannot diverge.
    expect(existsSync(resolveTypedBackend() as string)).toBe(true)
  })
})

describe('the typed backend genuinely executes', () => {
  it('decides a policy that is undecidable without types', () => {
    // `await` on a non-thenable is legal syntax. Only type information
    // distinguishes it from awaiting a promise.
    const seen = replacementTypedDiagnostics(AWAIT_THENABLE, configForRole('library'))
    expect(seen.rules).toContain('await-thenable')
  })

  it('and the SAME fixture is silent without types, so the types are doing the work', () => {
    // The other half, and the one that makes the first test mean something.
    // Run the identical file through the identical config with type-aware
    // analysis switched off: nothing is reported. So the diagnostic above
    // cannot be coming from a syntactic pattern that would survive the typed
    // backend's removal.
    const untyped = replacementDiagnostics(AWAIT_THENABLE, configForRole('library'))
    expect(untyped.rules).not.toContain('await-thenable')
  })
})

describe('a missing typed backend FAILS rather than downgrading', () => {
  it('the harness refuses instead of reporting an empty result', () => {
    // The source stays perfectly parseable, and the file is still the real
    // fixture. Only the backend is out of reach.
    withoutBackend((cwd, env) => {
      expect(() =>
        replacementTypedDiagnostics(AWAIT_THENABLE, configForRole('library'), cwd, env),
      ).toThrow(TypedBackendUnavailable as never)
    })
  })

  it('distinguishes "typed run found nothing" from "no typed run happened"', () => {
    // The distinction this whole file exists for. Without the backend the
    // harness must not return a clean result -- which is exactly what a silent
    // downgrade produces, and what would convert 24 typed policies into 24
    // unproven claims while every shard stayed green.
    withoutBackend((cwd, env) => {
      let threw = false
      let result: unknown
      try {
        result = replacementTypedDiagnostics(AWAIT_THENABLE, configForRole('library'), cwd, env)
      } catch (error) {
        threw = error instanceof (TypedBackendUnavailable as never)
      }
      expect(threw, `it returned ${JSON.stringify(result)} instead of failing`).toBe(true)
    })
  })
})

describe('the typed/static partition is a fact about the engine, not a label', () => {
  /**
   * The one typed-shard policy whose fixture is ALSO statically detectable.
   *
   * `explicit-module-boundary-types` is about a missing annotation, which is
   * visible in the syntax tree. The engine still registers it as type-aware,
   * so it belongs to a typed shard -- but its invalid fixture would be caught
   * without the backend too. Named here rather than quietly excluded: the
   * exception is one policy, and if it ever became two the second would have
   * to be argued for.
   */
  const ALSO_STATIC = new Set(['explicit-module-boundary-types'])

  it('every other typed policy is genuinely undecidable without type information', () => {
    // This replaces a check that read type-awareness out of the retired
    // engine's rule metadata. Behaviour is the better source: a policy sitting
    // in a typed shard while being decidable statically would mean the typed
    // backend was carrying less than the partition claims, and no amount of
    // metadata would show that.
    const { policy, mappings } = loadAuthorities() as any
    const replacement = new Map(
      mappings.mappings
        .filter((m: any) => m.engine === 'replacement')
        .map((m: any) => [m.policy, m]),
    )
    const typed = policy.policies.filter((p: any) =>
      (TYPED_SHARDS as Set<string>).has(p.proof.shard),
    )
    expect(typed).toHaveLength(24)

    const decidableWithoutTypes: string[] = []
    for (const row of typed) {
      const ruleId = (replacement.get(row.id) as { ruleId: string }).ruleId
      const bare = ruleId.includes('/') ? ruleId.slice(ruleId.lastIndexOf('/') + 1) : ruleId
      const untyped = replacementDiagnostics(
        fixturePath(row.proof.invalid),
        configForRole(roleFor(row)),
      )
      if (untyped.rules.includes(bare)) decidableWithoutTypes.push(row.id)
    }
    expect(decidableWithoutTypes.sort()).toEqual([...ALSO_STATIC].sort())
  })
})

describe('the typed corpus is bound to the environment', () => {
  it('every typed policy names a fixture inside the type environment', () => {
    const typed = policy.policies.filter((p: any) =>
      (TYPED_SHARDS as Set<string>).has(p.proof.shard),
    )
    expect(typed.length).toBeGreaterThan(0)
    for (const row of typed) {
      expect(existsSync(fixturePath(row.proof.valid))).toBe(true)
      expect(existsSync(fixturePath(row.proof.invalid))).toBe(true)
      expect(row.proof.valid.endsWith('.ts'), 'typed proof must be TypeScript').toBe(true)
    }
  })
})
