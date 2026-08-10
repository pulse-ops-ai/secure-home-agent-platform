/**
 * Authoritative derivation (INV-006 interface half): the derivation
 * accepts the host observation ONLY; RC-ADV-12 (empty-but-readable is an
 * empty, VALID authoritative set) versus RC-ADV-03 (a reported
 * unreadable workspace is an operational failure with NO authoritative
 * set, and no refusal code) — the two never collapse.
 */
import { describe, expect, it } from 'vitest'
import { deriveAuthoritativeChangeSet } from './derive.js'

describe('authoritative change-set derivation', () => {
  it('derives exactly the observed changes, canonically ordered', () => {
    const decision = deriveAuthoritativeChangeSet({
      ok: true,
      changes: [
        { path: 'z/last.ts', kind: 'modified', bytes: 1 },
        { path: 'a/first.ts', kind: 'created', bytes: 2 },
      ],
    })
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    expect(decision.value.changes.map((change) => change.path)).toEqual(['a/first.ts', 'z/last.ts'])
  })

  it('RC-ADV-12: an empty observation from a readable workspace is empty and valid', () => {
    const decision = deriveAuthoritativeChangeSet({ ok: true, changes: [] })
    if (decision.kind !== 'proceed') throw new Error('expected proceed')
    expect(decision.value.changes).toEqual([])
  })

  it('RC-ADV-03: an unreadable workspace is operational failure — no set, no refusal code', () => {
    const decision = deriveAuthoritativeChangeSet({ ok: false, failure: 'EIO' })
    expect(decision.kind).toBe('operational_failure')
    expect(JSON.stringify(decision)).not.toContain('"code"')
    expect(JSON.stringify(decision)).not.toContain('"changes"')
  })

  it('an unnormalizable observed path refuses rather than deriving', () => {
    const decision = deriveAuthoritativeChangeSet({
      ok: true,
      changes: [{ path: '../escape.ts', kind: 'modified', bytes: 1 }],
    })
    expect(decision.kind).toBe('refusal')
  })
})
