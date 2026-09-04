/**
 * That the TYPED backends actually ran.
 *
 * A typed rule with no type information does not give a wrong answer, it gives
 * NO answer. So "the rule did not report" is ambiguous between two very
 * different states: the code was clean, or the analysis never happened. Every
 * typed parity result is worthless until that ambiguity is closed.
 *
 * The hostile case here removes the type environment while leaving the source
 * perfectly parseable, and requires the suite to fail BECAUSE typed execution
 * disappeared -- not merely because an expected diagnostic went missing.
 */
import { existsSync, renameSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

// @ts-ignore
import {
  FIXTURE_TSCONFIG,
  TYPED_SHARDS,
  TypedBackendUnavailable,
  configForRole,
  fixturePath,
  legacyTypedDiagnostics,
  loadAuthorities,
  replacementTypedDiagnostics,
} from '../src/run-parity.mjs'

const { policy } = loadAuthorities()
const AWAIT_THENABLE = fixturePath('typescript-typed-control/invalid/await-thenable.ts')
const parked = `${FIXTURE_TSCONFIG as string}.parked`

afterEach(() => {
  if (existsSync(parked)) renameSync(parked, FIXTURE_TSCONFIG as string)
})

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
})

describe('both backends genuinely execute with types', () => {
  it('the legacy engine decides a policy that is undecidable without types', async () => {
    // `await` on a non-thenable is legal syntax. Only type information
    // distinguishes it from awaiting a promise.
    const seen = await legacyTypedDiagnostics(
      AWAIT_THENABLE,
      '@typescript-eslint/await-thenable',
      undefined,
    )
    expect(seen.rules).toContain('@typescript-eslint/await-thenable')
  })

  it('the replacement engine decides the same policy', () => {
    const seen = replacementTypedDiagnostics(AWAIT_THENABLE, configForRole('library'))
    expect(seen.rules).toContain('await-thenable')
  })
})

describe('a missing type environment FAILS rather than downgrading', () => {
  it('the legacy backend refuses instead of reporting an empty result', async () => {
    // The source stays perfectly parseable. Only the type environment goes.
    renameSync(FIXTURE_TSCONFIG as string, parked)

    await expect(
      legacyTypedDiagnostics(AWAIT_THENABLE, '@typescript-eslint/await-thenable', undefined),
    ).rejects.toThrow(TypedBackendUnavailable as never)
  })

  it('distinguishes "typed run found nothing" from "no typed run happened"', async () => {
    // The distinction this whole file exists for. Without the environment the
    // harness must not return a clean result -- which is exactly what a static
    // fallback would produce, and what would silently convert 24 typed policies
    // into 24 unproven claims.
    renameSync(FIXTURE_TSCONFIG as string, parked)

    let threw = false
    let result: unknown
    try {
      result = await legacyTypedDiagnostics(AWAIT_THENABLE, undefined, undefined)
    } catch (error) {
      threw = error instanceof (TypedBackendUnavailable as never)
    }
    expect(threw, `it returned ${JSON.stringify(result)} instead of failing`).toBe(true)
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
