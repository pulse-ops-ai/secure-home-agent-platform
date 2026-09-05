/**
 * Parse-level ATTRIBUTION, not merely rejection.
 *
 * Five policies are realised by both engines' parsers rather than by a rule.
 * The tempting check is "did the file fail to parse", and it is wrong: a
 * fixture whose intended violation was removed and replaced by an unrelated
 * syntax error would still be rejected by both engines and would pass parity
 * while proving nothing at all.
 *
 * So a parser mapping carries the engine's expected diagnostic, and the
 * invalid fixture passes only when THAT diagnostic appears. These tests break
 * the property deliberately, because the shard suite alone cannot distinguish
 * a working check from one that accepts any parse failure.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-ignore
import {
  configForRole,
  fixturePath,
  legacyDiagnostics,
  legacyDiagnosticsForText,
  loadAuthorities,
  matches,
  parityFor,
  parseReplacementReport,
  replacementDiagnostics,
  replacementDiagnosticsForText,
  roleFor,
} from '../src/run-parity.mjs'

const { policy, mappings } = loadAuthorities()
const legacy = new Map(
  mappings.mappings.filter((m: any) => m.engine === 'legacy').map((m: any) => [m.policy, m]),
)
const replacement = new Map(
  mappings.mappings.filter((m: any) => m.engine === 'replacement').map((m: any) => [m.policy, m]),
)
type Mapping = { mechanism: string; diagnosticPattern?: string }
const mappingOf = (source: Map<unknown, unknown>, id: string): Mapping => source.get(id) as Mapping

const PARSER_POLICIES = policy.policies.filter(
  (p: any) => mappingOf(legacy, p.id).mechanism === 'parser',
)

describe('every parser mapping declares an expected diagnostic', () => {
  it('covers every legacy parser policy on both engines', () => {
    // Four, not five. no-delete-var is parser-enforced on the REPLACEMENT only:
    // the repository parses .ts with the TypeScript parser, which accepts
    // `delete localBinding` and lets the rule fire instead. Mechanism is a
    // per-engine fact, and this is the case that proves it.
    expect(PARSER_POLICIES).toHaveLength(4)
    for (const row of PARSER_POLICIES) {
      expect(mappingOf(legacy, row.id).diagnosticPattern, `${row.id} legacy`).toBeTruthy()
      expect(mappingOf(replacement, row.id).diagnosticPattern, `${row.id} replacement`).toBeTruthy()
    }
  })

  it('keeps raw engine text out of the semantic policy', () => {
    for (const row of PARSER_POLICIES) {
      expect(JSON.stringify(row)).not.toMatch(
        /strict mode|Argument name clash|already been declared/,
      )
    }
  })

  it('keeps every policy on the accepted disposition', () => {
    for (const row of PARSER_POLICIES) {
      expect(row.disposition).toBe('MIGRATED_TO_NEW_LINT_ENGINE')
    }
  })
})

describe('an unrelated syntax error must NOT satisfy a parser policy', () => {
  // The crucial case. Both engines still produce parse errors, so a
  // rejection-only check would report parity.
  const UNRELATED = 'export const value = (\n'

  for (const row of PARSER_POLICIES as { id: string; proof: any }[]) {
    it(`${row.id}: a bare syntax error is rejected by both engines yet fails parity`, async () => {
      const extension = path.extname(row.proof.invalid)
      const legacySeen = await legacyDiagnosticsForText(
        UNRELATED,
        `decoy${extension}`,
        undefined,
        undefined,
      )
      const replacementSeen = replacementDiagnosticsForText(
        UNRELATED,
        extension,
        configForRole(roleFor(row)),
      )

      // Precondition: the decoy really does fail to parse under both engines.
      expect(legacySeen.fatalMessages.length, 'ESLint must still reject it').toBeGreaterThan(0)
      expect(replacementSeen.parseErrors.length, 'Oxlint must still reject it').toBeGreaterThan(0)

      // And yet it is not attribution for this policy, on either engine.
      expect(matches(legacySeen.fatalMessages, mappingOf(legacy, row.id).diagnosticPattern)).toBe(
        false,
      )
      expect(
        matches(replacementSeen.parseErrors, mappingOf(replacement, row.id).diagnosticPattern),
      ).toBe(false)
    })
  }
})

describe('one parser policy cannot satisfy another', () => {
  it('no policy diagnostic matches a different policy mapping', async () => {
    for (const row of PARSER_POLICIES as { id: string; proof: any }[]) {
      const seenLegacy = await legacyDiagnostics(
        fixturePath(row.proof.invalid),
        undefined,
        undefined,
      )
      const seenReplacement = replacementDiagnostics(
        fixturePath(row.proof.invalid),
        configForRole(roleFor(row)),
      )
      for (const other of PARSER_POLICIES as { id: string }[]) {
        if (other.id === row.id) continue
        expect(
          matches(seenLegacy.fatalMessages, mappingOf(legacy, other.id).diagnosticPattern),
          `${row.id}'s ESLint diagnostic must not satisfy ${other.id}`,
        ).toBe(false)
        expect(
          matches(seenReplacement.parseErrors, mappingOf(replacement, other.id).diagnosticPattern),
          `${row.id}'s Oxlint diagnostic must not satisfy ${other.id}`,
        ).toBe(false)
      }
    }
  })
})

describe('the matcher itself', () => {
  it('refuses when no pattern is declared, rather than accepting anything', () => {
    // Fail closed: a parser mapping that forgot its pattern must not pass.
    expect(matches(['any parse error at all'], undefined)).toBe(false)
  })

  it('requires the pattern to actually appear', () => {
    expect(matches(["'with' in strict mode"], "'with' in strict mode")).toBe(true)
    expect(matches(['Invalid number'], "'with' in strict mode")).toBe(false)
  })

  it('reports no match against an empty diagnostic list', () => {
    expect(matches([], 'Invalid number')).toBe(false)
  })
})

describe('a decoy fixture fails the real parity check end to end', () => {
  it('substituting an unrelated syntax error breaks parity for no-with', async () => {
    const row = PARSER_POLICIES.find((p: any) => p.id === 'no-with')
    const seen = await legacyDiagnosticsForText(
      'export const value = (\n',
      'no-with-decoy.js',
      undefined,
      undefined,
    )
    expect(seen.fatalMessages.length).toBeGreaterThan(0)
    expect(matches(seen.fatalMessages, mappingOf(legacy, 'no-with').diagnosticPattern)).toBe(false)

    // The real fixture, by contrast, is attributed.
    const real = await parityFor(
      row,
      legacy.get('no-with'),
      replacement.get('no-with'),
      configForRole(roleFor(row)),
    )
    expect(real.legacyRejects).toBe(true)
    expect(real.replacementRejects).toBe(true)
  })
})

describe('the real parity check rejects a decoy end to end', () => {
  // The integration path, not just the matcher. Committed negative controls:
  // each has the intended violation REMOVED and an unrelated syntax error in
  // its place, so both engines still reject the file. Parity must still fail.
  //
  // These exist because a mutation survived without them: dropping the
  // diagnostic check from parityFor left every test green, since the real
  // fixtures produce the right diagnostic and "some parse error" was also true.
  for (const row of PARSER_POLICIES as { id: string; proof: any }[]) {
    it(`${row.id}: a decoy fixture fails parityFor on both engines`, async () => {
      const extension = path.extname(row.proof.invalid)
      const decoy = {
        ...row,
        proof: {
          ...row.proof,
          valid: `_negative-controls/valid/${row.id}${extension}`,
          invalid: `_negative-controls/invalid/${row.id}${extension}`,
        },
      }
      const result = await parityFor(
        decoy,
        legacy.get(row.id),
        replacement.get(row.id),
        configForRole(roleFor(row)),
      )
      expect(result.legacyRejects, 'ESLint must not attribute an unrelated error').toBe(false)
      expect(result.replacementRejects, 'Oxlint must not attribute an unrelated error').toBe(false)
    })
  }
})

// The parity harness once read the replacement engine's human-readable output.
// That output is not stable: the engine emits its `github` reporter on a CI
// runner, which drops the ` error: ` marker the text parser keyed on. Every
// parser-attribution fixture then reported "no parse error" on hosted runners
// while passing locally. These lock the properties that make that impossible.
describe('the replacement report is read structurally, not as prose', () => {
  it('reads a rule violation from its code field', () => {
    const report = parseReplacementReport(
      JSON.stringify({
        diagnostics: [{ code: 'eslint(no-var)', message: 'Unexpected var', severity: 'error' }],
      }),
    )
    expect(report.rules).toEqual(['no-var'])
    expect(report.parseErrors).toEqual([])
  })

  it('reads a parse error from the ABSENCE of a code field', () => {
    // The engine refusing the source carries no rule identity. This is the
    // discriminator that survives a reporter change.
    const report = parseReplacementReport(
      JSON.stringify({
        diagnostics: [{ message: 'Expected `)` but found `EOF`', severity: 'error' }],
      }),
    )
    expect(report.parseErrors).toEqual(['Expected `)` but found `EOF`'])
    expect(report.rules).toEqual([])
  })

  it('REFUSES output it cannot read rather than reporting nothing found', () => {
    // The defect being fixed: "the engine found nothing" and "the harness could
    // not read the engine" looked identical, so a broken harness read as a
    // passing subject. Unreadable output must fail loudly.
    expect(() => parseReplacementReport('oxlint: command not found')).toThrow(/verdict is unknown/)
    expect(() => parseReplacementReport(JSON.stringify({ ok: true }))).toThrow(
      /no diagnostics array/,
    )
  })

  it('does not accept the human-readable reporter as if it were empty', () => {
    // Verbatim bytes of the `github` reporter that the hosted runner produced.
    const githubReporter =
      '::error file=s.js,line=2,endLine=2,col=1,endColumn=1,title=eslint(no-var)::' +
      's.js:2:1: Unexpected var, use let or const instead.'
    expect(() => parseReplacementReport(githubReporter)).toThrow(/verdict is unknown/)
  })
})
