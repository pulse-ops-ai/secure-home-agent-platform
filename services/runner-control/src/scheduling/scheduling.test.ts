/**
 * The gate-scheduling proof net:
 *
 *  ADV-006 / MUT-004  argv widening is unexpressible: the plan comes only
 *                     from the captured registry
 *  ADV-017            a duplicate disposition fails closed; the first
 *                     disposition is preserved
 *  ADV-015 / PROP-007 SKIP_ENV is fixed at the recording boundary and is
 *                     never renormalized
 *  ADV-016            a truncated gate is a FAIL carrying its reason
 *  RO-PROP-02         any report sequence with duplicates, skips and
 *                     truncations yields one disposition per identity
 */
import { GateRegistry, type GateRegistryT } from '@secure-home/contracts'
import { describe, expect, it } from 'vitest'
import type { GateReport } from '../ports/index.js'
import { registryDocument } from '../testing-fixtures.js'
import { DispositionRecorder, toDisposition } from './dispositions.js'
import { buildPlan } from './plan.js'

const registry = (): GateRegistryT => {
  const parsed = GateRegistry.safeParse(registryDocument())
  if (!parsed.success) throw new Error('fixture registry must be valid')
  return parsed.data
}

describe('ADV-006 / MUT-004: the plan comes only from the captured registry', () => {
  it('a planned gate carries the registry spec verbatim', () => {
    const source = registry()
    const plan = buildPlan(source, ['lint'])
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan[0]?.spec).toEqual(source.gates['lint'])
  })

  it('the scheduling interface has no parameter through which argv could arrive', () => {
    // buildPlan takes a registry and identities. There is no third
    // parameter, so a caller cannot supply an executable or an argument
    // — widening is unexpressible rather than validated-and-rejected.
    expect(buildPlan).toHaveLength(2)
  })

  it('an identity the registry does not declare is an error, never a silent skip', () => {
    const plan = buildPlan(registry(), ['lint', 'not-a-gate'])
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.unknown_gates).toEqual(['not-a-gate'])
  })
})

describe('the report → disposition mapping is fixed at the boundary', () => {
  it('ADV-015: an unavailable toolchain becomes SKIP_ENV, carrying the reason', () => {
    const outcome = toDisposition({ outcome: 'toolchain_unavailable', reason: 'pnpm not on PATH' })
    expect(outcome).toEqual({
      disposition: 'SKIP_ENV',
      truncated: false,
      reason: 'pnpm not on PATH',
    })
  })

  it('a declared skip and an environmental skip are DIFFERENT dispositions', () => {
    const declared = toDisposition({ outcome: 'declared_skip', reason: 'not applicable' })
    const environmental = toDisposition({ outcome: 'toolchain_unavailable', reason: 'absent' })
    expect(declared?.disposition).toBe('SKIP_OK')
    expect(environmental?.disposition).toBe('SKIP_ENV')
    expect(declared?.disposition).not.toBe(environmental?.disposition)
  })

  it('ADV-016: a truncated gate is a FAIL carrying its reason, never a pass', () => {
    const outcome = toDisposition({
      outcome: 'failed',
      reason: 'output exceeded bound',
      truncated: true,
    })
    expect(outcome).toEqual({
      disposition: 'FAIL',
      truncated: true,
      reason: 'output exceeded bound',
    })
  })

  it('an environmental fault is NOT a disposition — a gate that could not run has not passed', () => {
    expect(
      toDisposition({ outcome: 'environmental_fault', detail: 'sandbox died' }),
    ).toBeUndefined()
  })
})

describe('ADV-017: one terminal disposition per identity', () => {
  it('a second disposition fails closed and PRESERVES the first', () => {
    const recorder = new DispositionRecorder(['lint'])
    expect(
      recorder.record('lint', { disposition: 'FAIL', truncated: false, reason: 'real failure' }).ok,
    ).toBe(true)
    const second = recorder.record('lint', { disposition: 'PASS', truncated: false })
    expect(second.ok, 'last-write-wins would let a retry erase a failure').toBe(false)
    if (second.ok) return
    expect(second.error.kind).toBe('duplicate_disposition')
    expect(second.error.gate_id).toBe('lint')
    expect(recorder.results()['lint']?.disposition).toBe('FAIL')
  })

  it('an unscheduled identity is never recorded', () => {
    const recorder = new DispositionRecorder(['lint'])
    const result = recorder.record('unit-tests', { disposition: 'PASS', truncated: false })
    expect(result.ok).toBe(false)
    expect(Object.keys(recorder.results())).toEqual([])
  })

  it('outstanding names exactly the identities with no disposition yet', () => {
    const recorder = new DispositionRecorder(['lint', 'unit-tests'])
    expect(recorder.outstanding).toEqual(['lint', 'unit-tests'])
    recorder.record('lint', { disposition: 'PASS', truncated: false })
    expect(recorder.outstanding).toEqual(['unit-tests'])
  })
})

describe('RO-PROP-02: any report sequence yields one disposition per identity', () => {
  const REPORTS: readonly GateReport[] = [
    { outcome: 'passed' },
    { outcome: 'failed', reason: 'assertion', truncated: false },
    { outcome: 'failed', reason: 'truncated output', truncated: true },
    { outcome: 'declared_skip', reason: 'not applicable' },
    { outcome: 'toolchain_unavailable', reason: 'absent' },
  ]

  it('holds for every ordered pair of reports against one identity', () => {
    let checked = 0
    for (const first of REPORTS) {
      for (const second of REPORTS) {
        const recorder = new DispositionRecorder(['lint'])
        const a = toDisposition(first)
        const b = toDisposition(second)
        if (a === undefined || b === undefined) continue
        expect(recorder.record('lint', a).ok).toBe(true)
        expect(recorder.record('lint', b).ok, 'the second must always fail closed').toBe(false)
        // Exactly one result, and it is the FIRST report's meaning —
        // preserved through the duplicate, not renormalized by it.
        expect(Object.keys(recorder.results())).toHaveLength(1)
        expect(recorder.results()['lint']).toEqual(a)
        checked += 1
      }
    }
    expect(checked).toBe(REPORTS.length * REPORTS.length)
  })

  it('PROP-007: SKIP_ENV survives to the result set unchanged', () => {
    const recorder = new DispositionRecorder(['lint', 'unit-tests'])
    const skipEnv = toDisposition({ outcome: 'toolchain_unavailable', reason: 'absent' })
    const pass = toDisposition({ outcome: 'passed' })
    if (skipEnv === undefined || pass === undefined) throw new Error('mapping must be total here')
    recorder.record('lint', skipEnv)
    recorder.record('unit-tests', pass)
    // The result set is what evidence carries. SKIP_ENV must still be
    // SKIP_ENV here — there is no aggregation step that could soften it.
    expect(recorder.results()['lint']?.disposition).toBe('SKIP_ENV')
    expect(recorder.results()['unit-tests']?.disposition).toBe('PASS')
  })
})
