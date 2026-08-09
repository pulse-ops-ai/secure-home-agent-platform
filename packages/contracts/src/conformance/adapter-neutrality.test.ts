/**
 * C-EX-002 / C-ADV-005: no provider, framework, or runtime name occupies
 * a structural position anywhere in the published corpus — property
 * names, $defs, enum members, and const values are all scanned.
 */
import { describe, expect, it } from 'vitest'
import { committedSchemas, FORBIDDEN_STRUCTURAL_NAMES, structuralStrings } from './helpers.js'

describe('corpus neutrality (C-EX-002, C-ADV-005)', () => {
  it('no provider, framework, or runtime name in a structural position', () => {
    for (const [relPath, content] of committedSchemas()) {
      const names: string[] = []
      structuralStrings(JSON.parse(content), names)
      for (const name of names) {
        // Token equality, not raw substring: "truncated" must not trip
        // "runc". Structural names are snake_case/dotted, so tokens are
        // the meaningful unit.
        const tokens = name.toLowerCase().split(/[^a-z0-9]+/)
        for (const forbidden of FORBIDDEN_STRUCTURAL_NAMES) {
          expect(
            tokens.includes(forbidden),
            `schemas/${relPath}: "${name}" contains token "${forbidden}"`,
          ).toBe(false)
        }
      }
    }
  })
})
