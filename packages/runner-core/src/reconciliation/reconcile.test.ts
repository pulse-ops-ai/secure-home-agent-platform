/**
 * ADV-002 + RC-MUT-02 (a claim absent from observation loses; nothing
 * merges into the authoritative set), RC-ADV-01 (a claim naming a
 * protected path never enters the authoritative set and invents no
 * protected-path refusal), RC-ADV-09 (claims absent records as absent —
 * never agreement), claim-parse refusal for malformed claims, divergent
 * kinds, and RC-PROP-02 (order-independence; authoritative equals
 * observed exactly) across generated pairs.
 */
import { describe, expect, it } from 'vitest'
import { deriveAuthoritativeChangeSet } from '../workspace/index.js'
import { decideMaterialization } from '../policy/index.js'
import { reconcileClaims } from './reconcile.js'
import { capturedPolicy, mulberry32 } from '../testing-fixtures.js'

const authoritativeOf = (
  paths: readonly { path: string; kind: 'created' | 'modified' | 'deleted' }[],
) => {
  const decision = deriveAuthoritativeChangeSet({
    ok: true,
    changes: paths.map((entry) => ({ ...entry, bytes: 10 })),
  })
  if (decision.kind !== 'proceed') throw new Error('fixture derivation failed')
  return decision.value
}

describe('claims never alter the authoritative set (ADV-002)', () => {
  it('a claimed-but-unobserved path loses; the disagreement is recorded', () => {
    const authoritative = authoritativeOf([{ path: 'packages/a.ts', kind: 'modified' }])
    const result = reconcileClaims(authoritative, [
      { path: 'packages/a.ts', kind: 'modified' },
      { path: 'packages/ghost.ts', kind: 'created' },
    ])
    expect(result.agreement).toBe(false)
    expect(authoritative.changes.map((change) => change.path)).toEqual(['packages/a.ts'])
    expect(result.disagreements).toEqual([
      { path: 'packages/ghost.ts', detail: 'claimed but not observed' },
    ])
  })

  it('an observed-but-unclaimed path is recorded; observation stays authoritative', () => {
    const authoritative = authoritativeOf([
      { path: 'packages/a.ts', kind: 'modified' },
      { path: 'packages/b.ts', kind: 'created' },
    ])
    const result = reconcileClaims(authoritative, [{ path: 'packages/a.ts', kind: 'modified' }])
    expect(result.agreement).toBe(false)
    expect(result.disagreements).toEqual([
      { path: 'packages/b.ts', detail: 'observed but not claimed' },
    ])
  })

  it('a divergent kind is one disagreement naming both kinds; observed wins', () => {
    const authoritative = authoritativeOf([{ path: 'packages/a.ts', kind: 'modified' }])
    const result = reconcileClaims(authoritative, [{ path: 'packages/a.ts', kind: 'deleted' }])
    expect(result.agreement).toBe(false)
    expect(result.disagreements).toHaveLength(1)
    expect(result.disagreements[0]?.detail).toContain('claimed "deleted"')
    expect(result.disagreements[0]?.detail).toContain('observed "modified"')
  })

  it('RC-ADV-01: a claim naming a protected path invents no refusal and never enters the set', () => {
    const authoritative = authoritativeOf([{ path: 'packages/a.ts', kind: 'modified' }])
    const result = reconcileClaims(authoritative, [
      { path: 'packages/a.ts', kind: 'modified' },
      { path: 'schemas/identity-ledger.json', kind: 'modified' },
    ])
    expect(result.agreement).toBe(false)
    expect(authoritative.changes.map((change) => change.path)).toEqual(['packages/a.ts'])
    // Materialization over the OBSERVED set proceeds: the claimed
    // protected path produced a recorded disagreement, not a refusal.
    const materialization = decideMaterialization(capturedPolicy(), authoritative)
    expect(materialization.kind).toBe('proceed')
  })
})

describe('claim-set presence (RC-ADV-09)', () => {
  it('absent claims record as absent — never agreement', () => {
    const result = reconcileClaims(authoritativeOf([]), undefined)
    expect(result.claims).toBe('absent')
    expect(result.agreement).toBe(false)
    expect(result.claimed).toEqual([])
  })

  it('malformed claims record a claim-parse condition; observation authoritative', () => {
    for (const malformed of ['not an array', [{ path: 1 }], [{ path: 'x', kind: 'renamed' }]]) {
      const result = reconcileClaims(
        authoritativeOf([{ path: 'packages/a.ts', kind: 'modified' }]),
        malformed,
      )
      expect(result.claims).toBe('malformed')
      expect(result.agreement).toBe(false)
    }
  })
})

describe('RC-PROP-02: order-independent exact agreement', () => {
  it('holds across 200 generated observed/claimed pairs', () => {
    const random = mulberry32(53)
    const kinds = ['created', 'modified', 'deleted'] as const
    for (let index = 0; index < 200; index += 1) {
      const size = 1 + Math.floor(random() * 12)
      const entries = Array.from({ length: size }, (_, n) => ({
        path: `packages/f${String(n)}.ts`,
        kind: kinds[Math.floor(random() * 3)] ?? 'modified',
      }))
      const authoritative = authoritativeOf(entries)
      const shuffled = [...entries].sort(() => random() - 0.5)
      const agree = reconcileClaims(authoritative, shuffled)
      expect(agree.agreement).toBe(true)
      expect(agree.disagreements).toEqual([])
      // The authoritative set equals the observed set exactly.
      expect(authoritative.changes.map((change) => `${change.path}:${change.kind}`).sort()).toEqual(
        entries.map((entry) => `${entry.path}:${entry.kind}`).sort(),
      )
      // One divergence breaks agreement regardless of order.
      const mutated = [...shuffled]
      const target = mutated[0]
      if (target === undefined) throw new Error('generated set is non-empty')
      mutated[0] = { ...target, kind: target.kind === 'deleted' ? 'created' : 'deleted' }
      expect(reconcileClaims(authoritative, mutated).agreement).toBe(false)
    }
  })
})
