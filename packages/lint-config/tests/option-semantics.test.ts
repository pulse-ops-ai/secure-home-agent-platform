/**
 * The seven policies whose OPTIONS are part of their meaning.
 *
 * Proving an option object appears in generated JSON proves nothing: a config
 * can carry an option the engine ignores, or interprets differently, and still
 * look correct. What must survive the migration is the BEHAVIOUR the option
 * selects.
 *
 * Two shapes of evidence are needed, and reject/accept alone is only the first:
 *
 *   an option that changes WHETHER a diagnostic appears
 *       -> the fixture is accepted without it and rejected with it
 *
 *   an option that changes WHAT THE FIX WRITES
 *       -> both engines must produce the same bytes
 *
 * `consistent-type-imports.fixStyle` is the second kind. Both engines reject
 * the same source whichever style is configured, so rejection parity says
 * nothing at all about whether the repository's chosen style was preserved.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  configForRole,
  fixturePath,
  legacyDiagnosticsForText,
  legacyFixOutput,
  loadAuthorities,
  replacementFixOutput,
} from '../src/run-parity.mjs'

const { policy, mappings } = loadAuthorities()
const legacyOf = (id: string): any =>
  mappings.mappings.find((m: any) => m.policy === id && m.engine === 'legacy')
const policyOf = (id: string): any => policy.policies.find((p: any) => p.id === id)

const OPTION_BEARING = [
  'ban-ts-comment',
  'consistent-type-imports',
  'no-unused-vars',
  'eqeqeq',
  'no-console',
  'no-restricted-globals',
  'no-restricted-properties',
]

describe('the option-bearing set', () => {
  it('is exactly the seven policies authored with options', () => {
    const withOptions = policy.policies
      .filter((p: any) => p.options !== undefined)
      .map((p: any) => p.id)
      .sort()
    expect(withOptions).toEqual([...OPTION_BEARING].sort())
  })

  it('carries the options into the generated replacement config', () => {
    const cfg = JSON.parse(readFileSync(configForRole('library'), 'utf8')) as {
      rules: Record<string, unknown>
    }
    for (const id of ['eqeqeq', 'no-restricted-globals', 'no-restricted-properties']) {
      expect(Array.isArray(cfg.rules[id]), `${id} must carry its options`).toBe(true)
    }
  })
})

describe('options that decide WHETHER a diagnostic appears', () => {
  // Each is accepted when the option is withheld and rejected when it is
  // supplied, so the option is doing the work rather than the rule alone.
  it.each([
    ['no-restricted-globals', 'export const read = (): string => String(process.argv)\n'],
    ['no-restricted-properties', 'export const read = (): string => String(process.env)\n'],
  ])('%s is inert without its options', async (id, source) => {
    const mapping = legacyOf(id)
    const withoutOptions = await legacyDiagnosticsForText(source, 'probe.ts', mapping.ruleId, [])
    expect(withoutOptions.rules, 'the bare rule restricts nothing').not.toContain(mapping.ruleId)

    const withOptions = await legacyDiagnosticsForText(
      source,
      'probe.ts',
      mapping.ruleId,
      policyOf(id).options.values,
    )
    expect(withOptions.rules).toContain(mapping.ruleId)
  })

  it('eqeqeq exempts null comparison, which is the authored choice', async () => {
    const mapping = legacyOf('eqeqeq')
    const options = policyOf('eqeqeq').options.values
    // `always` alone would reject this; the `{ null: 'ignore' }` half is what
    // makes it legal, so its survival is observable.
    const nullCompare = 'export const missing = (v: unknown): boolean => v == null\n'
    const permitted = await legacyDiagnosticsForText(
      nullCompare,
      'probe.ts',
      mapping.ruleId,
      options,
    )
    expect(permitted.rules).not.toContain(mapping.ruleId)

    const strict = await legacyDiagnosticsForText(nullCompare, 'probe.ts', mapping.ruleId, [
      'always',
    ])
    expect(strict.rules, 'without the exemption the same source is rejected').toContain(
      mapping.ruleId,
    )
  })

  it('ban-ts-comment allows a described expect-error and refuses a bare ignore', async () => {
    const mapping = legacyOf('ban-ts-comment')
    const options = policyOf('ban-ts-comment').options.values
    const described =
      '// @ts-expect-error -- deliberately wrong, and this says why\nexport const v: number = 1\n'
    const bare = '// @ts-ignore\nexport const v: number = 1\n'
    expect(
      (await legacyDiagnosticsForText(described, 'probe.ts', mapping.ruleId, options)).rules,
    ).not.toContain(mapping.ruleId)
    expect(
      (await legacyDiagnosticsForText(bare, 'probe.ts', mapping.ruleId, options)).rules,
    ).toContain(mapping.ruleId)
  })

  it('no-unused-vars exempts the underscore escape hatch', async () => {
    const mapping = legacyOf('no-unused-vars')
    const options = policyOf('no-unused-vars').options.values
    const underscored =
      'export function take(_ignored: number, used: number): number {\n  return used\n}\n'
    const plain =
      'export function take(ignored: number, used: number): number {\n  return used\n}\n'
    expect(
      (await legacyDiagnosticsForText(underscored, 'probe.ts', mapping.ruleId, options)).rules,
    ).not.toContain(mapping.ruleId)
    expect(
      (await legacyDiagnosticsForText(plain, 'probe.ts', mapping.ruleId, options)).rules,
    ).toContain(mapping.ruleId)
  })
})

describe('options that decide WHAT THE FIX WRITES', () => {
  const row = policyOf('consistent-type-imports')
  const mapping = legacyOf('consistent-type-imports')
  const source = readFileSync(fixturePath(row.proof.invalid), 'utf8')

  /** The bytes the repository's chosen style must produce. */
  const GOLDEN = "import { type Readable } from 'node:stream'\nexport type Alias = Readable\n"

  it('the legacy engine writes the golden output', async () => {
    expect(await legacyFixOutput(source, 'probe.ts', mapping.ruleId, row.options.values)).toBe(
      GOLDEN,
    )
  })

  it('the replacement engine writes the SAME bytes', () => {
    expect(replacementFixOutput(source, '.ts', configForRole('library'))).toBe(GOLDEN)
  })

  it('the other fixStyle would write different bytes, so the option is load-bearing', async () => {
    // Without this, "both engines produced the golden output" could be true of
    // any configuration, and the option would be proving nothing.
    const separate = await legacyFixOutput(source, 'probe.ts', mapping.ruleId, [
      { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
    ])
    expect(separate).not.toBe(GOLDEN)
    expect(separate).toMatch(/^import type \{ Readable \}/)
  })

  it('both styles REJECT the same source, so rejection alone proves nothing', async () => {
    // The reason fixed-output evidence is required for this policy at all.
    for (const fixStyle of ['inline-type-imports', 'separate-type-imports']) {
      const seen = await legacyDiagnosticsForText(source, 'probe.ts', mapping.ruleId, [
        { prefer: 'type-imports', fixStyle },
      ])
      expect(seen.rules).toContain(mapping.ruleId)
    }
  })
})
