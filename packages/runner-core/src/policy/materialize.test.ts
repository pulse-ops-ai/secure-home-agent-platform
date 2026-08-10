/**
 * The materialization decision table (requirements "Write eligibility
 * derives from captured policy alone", "Paths are decided after
 * normalization, and escapes refuse", "Governing material is never
 * writable by the run", "Security-relevant bounds refuse, never
 * truncate"): ADV-005 + MUT-001 (whole-set protected refusal, nothing
 * dropped; protection outranks the root), RC-ADV-05 (alias escape),
 * ADV-009 + MUT-006 (over-bound refuses with bound and observed value),
 * RC-ADV-06 (exactly at the bound proceeds, deterministically), RC-EX-06
 * + RC-MUT-01 (a rule kind outside the implemented vocabulary refuses
 * the whole policy).
 */
import { describe, expect, it } from 'vitest'
import type { AuthoritativeChangeSet, ObservedChange } from '../workspace/index.js'
import { decideMaterialization } from './materialize.js'
import { capturedPolicy, policyDocument } from '../testing-fixtures.js'

const change = (path: string, bytes = 10, extra: Partial<ObservedChange> = {}): ObservedChange => ({
  path,
  kind: 'modified',
  bytes,
  ...extra,
})

const observed = (...changes: ObservedChange[]): AuthoritativeChangeSet => ({ changes })

describe('write roots and normalization', () => {
  it('a path under an allowed root is eligible', () => {
    const decision = decideMaterialization(capturedPolicy(), observed(change('packages/a.ts')))
    expect(decision.kind).toBe('proceed')
  })

  it('a path outside every root refuses, named and never dropped', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(change('packages/a.ts'), change('services/evil.ts')),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('path_outside_roots')
    expect(decision.violated.element).toBe('services/evil.ts')
  })

  it('traversal refuses with the pre-normalization form recorded', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(change('packages/../schemas/x.json')),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('path_undecidable')
    expect(decision.violated.element).toBe('packages/../schemas/x.json')
  })

  it('an undecidable path refuses and is never eligible', () => {
    for (const bad of ['/absolute/x', 'file:secrets', 'a\\b']) {
      const decision = decideMaterialization(capturedPolicy(), observed(change(bad)))
      expect(decision.kind).toBe('refusal')
    }
  })

  it('RC-ADV-05: an alias whose target escapes its root refuses with both names', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(change('packages/link.ts', 10, { link_target: 'services/outside.ts' })),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('path_outside_roots')
    expect(decision.violated.element).toBe('packages/link.ts')
    expect(decision.violated.observed).toBe('services/outside.ts')
  })
})

describe('protected governing material (ADV-005, MUT-001)', () => {
  it('one protected change refuses the WHOLE set; the path is named; nothing is reported materializable', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(change('packages/a.ts'), change('schemas/evil.json'), change('docs/ok.md')),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('protected_path')
    expect(decision.violated.element).toBe('schemas/evil.json')
    expect(JSON.stringify(decision)).not.toContain('materializable')
  })

  it('protection outranks an allowed write root, and the conflict is recorded', () => {
    const doc = { ...policyDocument(), allowed_write_roots: ['schemas', 'packages'] }
    const decision = decideMaterialization(
      capturedPolicy(doc),
      observed(change('schemas/run-record/1.0.0.json')),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('protected_path')
    expect(decision.detail).toContain('outranks')
  })

  it('a protected write reached through a link refuses too', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(change('packages/innocent.ts', 10, { link_target: '.git/config' })),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('protected_path')
  })

  it('captured authority sources are protected material', () => {
    const decision = decideMaterialization(
      capturedPolicy({ ...policyDocument(), allowed_write_roots: ['profiles', 'packages'] }),
      observed(change('profiles/path-policy.json')),
      ['profiles/path-policy.json'],
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('protected_path')
  })

  it('an unestablishable protected source refuses — protection never lapses silently (review P2)', () => {
    for (const badSource of ['../outside-repo.json', '/abs/authority.json', 'file:authority']) {
      const decision = decideMaterialization(capturedPolicy(), observed(change('packages/a.ts')), [
        badSource,
      ])
      if (decision.kind !== 'refusal') throw new Error('expected refusal')
      expect(decision.code).toBe('path_undecidable')
      expect(decision.violated.element).toBe(badSource)
      expect(decision.detail).toContain('refuses rather than lapsing')
    }
  })
})

describe('bounds refuse, never truncate (ADV-009, RC-ADV-06, MUT-006)', () => {
  it('an over-bound file count refuses with bound and observed value', () => {
    const changes = Array.from({ length: 9 }, (_, index) =>
      change(`packages/f${String(index)}.ts`, 1),
    )
    const decision = decideMaterialization(capturedPolicy(), observed(...changes))
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('over_bound')
    expect(decision.violated.element).toBe('max_files')
    expect(decision.violated.observed).toBe('9')
  })

  it('an over-bound per-file size refuses naming the file bound', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(change('packages/a.ts', 1025)),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.violated.element).toBe('max_file_bytes')
  })

  it('an over-bound total refuses naming the total bound', () => {
    const decision = decideMaterialization(
      capturedPolicy(),
      observed(...[1, 2, 3, 4, 5].map((n) => change(`packages/f${String(n)}.ts`, 1000))),
    )
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.violated.element).toBe('max_total_bytes')
  })

  it('RC-ADV-06: exactly at every bound proceeds, identically on repeat', () => {
    const changes = Array.from({ length: 8 }, (_, index) =>
      change(`packages/f${String(index)}.ts`, 512),
    )
    // 8 files == max_files; 512 <= max_file_bytes; 4096 == max_total_bytes.
    const first = decideMaterialization(capturedPolicy(), observed(...changes))
    const second = decideMaterialization(capturedPolicy(), observed(...changes))
    expect(first.kind).toBe('proceed')
    expect(second).toEqual(first)
  })

  it('one unit over the exact bound refuses — the edge is the declared bound', () => {
    const changes = Array.from({ length: 8 }, (_, index) =>
      change(`packages/f${String(index)}.ts`, index === 0 ? 513 : 512),
    )
    const decision = decideMaterialization(capturedPolicy(), observed(...changes))
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('over_bound')
  })
})

describe('rule vocabulary defense in depth (RC-EX-06, RC-MUT-01)', () => {
  it('a rule kind outside the implemented vocabulary refuses the whole policy', () => {
    const captured = capturedPolicy()
    if (!captured.ok) throw new Error('fixture')
    const forged = {
      ...captured,
      value: {
        ...captured.value,
        prohibited_rules: [{ kind: 'glob', prefix: 'docs' }],
      },
    } as never
    const decision = decideMaterialization(forged, observed(change('packages/a.ts')))
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('unrecognized_rule')
    expect(decision.detail).toContain('skipping')
  })

  it('policy bytes with an unknown kind never capture in the first place', () => {
    const captured = capturedPolicy({
      ...policyDocument(),
      prohibited_rules: [{ kind: 'glob', prefix: 'docs' }],
    })
    expect(captured.ok).toBe(false)
  })

  it('a missing policy refuses materialization — no authority, no decision', () => {
    const decision = decideMaterialization(undefined, observed(change('packages/a.ts')))
    if (decision.kind !== 'refusal') throw new Error('expected refusal')
    expect(decision.code).toBe('missing_authority')
  })
})
