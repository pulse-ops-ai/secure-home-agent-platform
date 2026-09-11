/**
 * The seven policies whose OPTIONS are part of their meaning.
 *
 * Proving an option object appears in generated JSON proves nothing: a config
 * can carry an option the engine ignores, or interprets differently, and still
 * look correct. What must survive is the BEHAVIOUR the option selects.
 *
 * Two shapes of evidence are needed, and reject/accept alone is only the first:
 *
 *   an option that changes WHETHER a diagnostic appears
 *       -> the fixture is accepted without it and rejected with it
 *
 *   an option that changes WHAT THE FIX WRITES
 *       -> the written bytes must be the authored ones
 *
 * `consistent-type-imports.fixStyle` is the second kind. The source is
 * rejected whichever style is configured, so rejection says nothing at all
 * about whether the repository's chosen style was preserved.
 *
 * Every "without it" half runs through an ad-hoc single-rule config
 * (`replacementRuleDiagnostics`). A generated per-role config cannot supply
 * that half: it contains only the option that was chosen.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  configForRole,
  fixturePath,
  loadAuthorities,
  replacementFixOutput,
  replacementRuleDiagnostics,
  replacementRuleFixOutput,
} from '../src/run-parity.mjs'

const { policy, mappings } = loadAuthorities()
const ruleOf = (id: string): string =>
  mappings.mappings.find((m: any) => m.policy === id && m.engine === 'replacement').ruleId
/** The engine reports the bare rule name, unprefixed by its plugin. */
const bareOf = (id: string): string => {
  const ruleId = ruleOf(id)
  return ruleId.includes('/') ? ruleId.slice(ruleId.lastIndexOf('/') + 1) : ruleId
}
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
  ])('%s is inert without its options', (id, source) => {
    const withoutOptions = replacementRuleDiagnostics(source, '.ts', ruleOf(id), [])
    expect(withoutOptions.rules, 'the bare rule restricts nothing').not.toContain(bareOf(id))

    const withOptions = replacementRuleDiagnostics(
      source,
      '.ts',
      ruleOf(id),
      policyOf(id).options.values,
    )
    expect(withOptions.rules).toContain(bareOf(id))
  })

  it('eqeqeq exempts null comparison, which is the authored choice', () => {
    const options = policyOf('eqeqeq').options.values
    // `always` alone would reject this; the `{ null: 'ignore' }` half is what
    // makes it legal, so its survival is observable.
    const nullCompare = 'export const missing = (v: unknown): boolean => v == null\n'
    const permitted = replacementRuleDiagnostics(nullCompare, '.ts', ruleOf('eqeqeq'), options)
    expect(permitted.rules).not.toContain(bareOf('eqeqeq'))

    const strict = replacementRuleDiagnostics(nullCompare, '.ts', ruleOf('eqeqeq'), ['always'])
    expect(strict.rules, 'without the exemption the same source is rejected').toContain(
      bareOf('eqeqeq'),
    )
  })

  it('ban-ts-comment allows a described expect-error and refuses a bare ignore', () => {
    const options = policyOf('ban-ts-comment').options.values
    const described =
      '// @ts-expect-error -- deliberately wrong, and this says why\nexport const v: number = 1\n'
    const bare = '// @ts-ignore\nexport const v: number = 1\n'
    expect(
      replacementRuleDiagnostics(described, '.ts', ruleOf('ban-ts-comment'), options).rules,
    ).not.toContain(bareOf('ban-ts-comment'))
    expect(
      replacementRuleDiagnostics(bare, '.ts', ruleOf('ban-ts-comment'), options).rules,
    ).toContain(bareOf('ban-ts-comment'))
  })

  it('no-unused-vars exempts the underscore escape hatch', () => {
    const options = policyOf('no-unused-vars').options.values
    const underscored =
      'export function take(_ignored: number, used: number): number {\n  return used\n}\n'
    const plain =
      'export function take(ignored: number, used: number): number {\n  return used\n}\n'
    expect(
      replacementRuleDiagnostics(underscored, '.ts', ruleOf('no-unused-vars'), options).rules,
    ).not.toContain(bareOf('no-unused-vars'))
    expect(
      replacementRuleDiagnostics(plain, '.ts', ruleOf('no-unused-vars'), options).rules,
    ).toContain(bareOf('no-unused-vars'))
  })
})

describe('options that decide WHAT THE FIX WRITES', () => {
  const row = policyOf('consistent-type-imports')
  const ruleId = ruleOf('consistent-type-imports')
  const source = readFileSync(fixturePath(row.proof.invalid), 'utf8')

  /** The bytes the repository's chosen style must produce. */
  const GOLDEN = "import { type Readable } from 'node:stream'\nexport type Alias = Readable\n"

  it('the generated config writes the golden output', () => {
    expect(replacementFixOutput(source, '.ts', configForRole('library'))).toBe(GOLDEN)
  })

  it("the engine's own default writes different bytes, so the option is not decoration", () => {
    // The strongest of the three. If the authored fixStyle were dropped
    // entirely, the engine would still fix the file and still exit clean -- it
    // would simply write a style nobody chose. This is what makes that
    // visible.
    const byDefault = replacementRuleFixOutput(source, '.ts', ruleId, undefined)
    expect(byDefault).not.toBe(GOLDEN)
    expect(byDefault).toMatch(/^import type \{ Readable \}/)
  })

  it('the other fixStyle would write different bytes, so the option is load-bearing', () => {
    // Without this, "the engine produced the golden output" could be true of
    // any configuration, and the option would be proving nothing.
    const separate = replacementRuleFixOutput(source, '.ts', ruleId, [
      { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
    ])
    expect(separate).not.toBe(GOLDEN)
    expect(separate).toMatch(/^import type \{ Readable \}/)
  })

  it('both styles REJECT the same source, so rejection alone proves nothing', () => {
    // The reason fixed-output evidence is required for this policy at all.
    for (const fixStyle of ['inline-type-imports', 'separate-type-imports']) {
      const seen = replacementRuleDiagnostics(source, '.ts', ruleId, [
        { prefer: 'type-imports', fixStyle },
      ])
      expect(seen.rules).toContain(bareOf('consistent-type-imports'))
    }
  })
})
