/**
 * C-ADV-002: no designated credential-value slot exists anywhere in the
 * published corpus — the only secret-adjacent name is the launch
 * assertion's `contains_secret_values`, which admits only `false`.
 */
import { describe, expect, it } from 'vitest'
import { committedSchemas, structuralStrings } from './helpers.js'

describe('credential slots (C-ADV-002)', () => {
  it('no designated credential-value slot exists anywhere in the corpus', () => {
    for (const [relPath, content] of committedSchemas()) {
      const names: string[] = []
      structuralStrings(JSON.parse(content), names)
      for (const name of names) {
        if (name === 'contains_secret_values') continue
        expect(
          /(^|_)(secret|token|password|credential_value|api_key)(_|$)?/.test(name),
          `schemas/${relPath}: suspicious slot "${name}"`,
        ).toBe(false)
      }
    }
  })
})
