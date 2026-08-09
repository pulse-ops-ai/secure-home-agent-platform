/**
 * C-EX-003: strict posture survives generation — every object schema in
 * the published corpus that declares `properties` also declares
 * `additionalProperties: false`.
 */
import { describe, expect, it } from 'vitest'
import { committedSchemas } from './helpers.js'

describe('strictness survives generation (C-EX-003)', () => {
  it('every object with properties is strict, at every depth', () => {
    const assertStrict = (node: unknown, where: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => assertStrict(item, `${where}[${index}]`))
        return
      }
      if (node === null || typeof node !== 'object') return
      const record = node as Record<string, unknown>
      if (record['type'] === 'object' && record['properties'] !== undefined) {
        expect(record['additionalProperties'], `${where} is not strict`).toBe(false)
      }
      for (const [key, value] of Object.entries(record)) {
        // Record-typed maps (propertyNames) legitimately allow additional
        // properties; they carry no `properties` block and are skipped by
        // the guard above.
        assertStrict(value, `${where}.${key}`)
      }
    }
    for (const [relPath, content] of committedSchemas()) {
      assertStrict(JSON.parse(content), `schemas/${relPath}`)
    }
  })
})
