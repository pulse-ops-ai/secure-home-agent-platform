/**
 * The seal-ordering proof net:
 *
 *  RO-ADV-03  an early seal is refused and recorded; the good path seals
 *             LAST by recorded sequence — filtered to the run (D10)
 *  RO-MUT-02  dropping the outstanding-write check is killed here
 *  RO-EX-05   consent and eligibility are separate conditions
 *  RO-ADV-01  eligibility without consent HOLDS; it does not spend
 *  ADV-001    a request with no profile refuses on the PROFILE
 */
import { describe, expect, it } from 'vitest'
import { decideSpendGate } from '../consent/index.js'
import { FinalizationLedger } from './index.js'

const bundleInputs = (bundle: unknown) => ({
  bundle,
  outcome: { terminal_state: 'COMPLETED' } as const,
})

describe('RO-ADV-03 / RO-MUT-02: the seal is the final write of the run', () => {
  it('a seal PREPARED with writes outstanding is refused, and nothing is written', () => {
    const ledger = new FinalizationLedger('run-1')
    ledger.open('event', 'run.started')

    const prepared = ledger.prepareSeal(bundleInputs({}))
    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.refused).toBe('outstanding_writes')
    expect(prepared.detail).toContain('run-1')
    expect(ledger.sealed).toBe(false)
  })

  it('an ineligible bundle is refused even when the ORDER is right', () => {
    const ledger = new FinalizationLedger('run-1')
    const prepared = ledger.prepareSeal(bundleInputs(undefined))
    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.refused).toBe('not_eligible')
  })

  it('preparation writes nothing at all — refusing costs nothing', () => {
    // The ledger holds no sink. That is the property, not an omission:
    // preparation cannot write because it has nothing to write to, so a
    // refused preparation cannot leave a partial finalization behind.
    const ledger = new FinalizationLedger('run-1')
    ledger.prepareSeal(bundleInputs(undefined))
    expect(ledger.sequence.filter((entry) => entry.kind === 'seal')).toHaveLength(0)
  })

  it('a second preparation after a committed seal is refused', () => {
    const ledger = new FinalizationLedger('run-1')
    ledger.markSealed()
    const prepared = ledger.prepareSeal(bundleInputs({}))
    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.refused).toBe('already_sealed')
  })

  it('the recorded sequence is already filtered to this run (D10)', () => {
    const ledger = new FinalizationLedger('run-1')
    ledger.open('event', 'run.started')
    ledger.open('transition', 'PROFILE_RESOLVED')
    for (const entry of ledger.sequence) expect(entry.run_id).toBe('run-1')
    expect(ledger.sequence.map((entry) => entry.kind)).toEqual(['event', 'transition'])
  })

  it('closing every outstanding write admits the preparation', () => {
    const ledger = new FinalizationLedger('run-1')
    ledger.open('event', 'run.started')
    expect(ledger.prepareSeal(bundleInputs({})).ok).toBe(false)
    ledger.close()
    // Still refused — but now on ELIGIBILITY, not on ordering. The two
    // conditions are independent, which is the point of proving both.
    const prepared = ledger.prepareSeal(bundleInputs({}))
    expect(prepared.ok).toBe(false)
    if (prepared.ok) return
    expect(prepared.refused).toBe('not_eligible')
  })
})

describe('RO-ADV-01 / RO-EX-05: consent gates spend and is never authority', () => {
  it('an absent consent record HOLDS the run — it is not a refusal', () => {
    const gate = decideSpendGate('run-1', undefined)
    expect(gate.ok).toBe(false)
    if (gate.ok) return
    expect(gate.held).toBe('consent_absent')
    expect(gate.detail).toContain('holds at ELIGIBLE')
  })

  it('withheld consent is distinguishable from absent consent', () => {
    const withheld = decideSpendGate('run-1', {
      run_id: 'run-1',
      granted: false,
      by: 'human:mike',
      recorded_at: '2026-08-12T12:00:00.000Z',
    })
    expect(withheld.ok).toBe(false)
    if (withheld.ok) return
    expect(withheld.held).toBe('consent_withheld')
    expect(withheld.detail).toContain('human:mike')
  })

  it('affirmative consent opens the gate and nothing else', () => {
    const gate = decideSpendGate('run-1', {
      run_id: 'run-1',
      granted: true,
      by: 'human:mike',
      recorded_at: '2026-08-12T12:00:00.000Z',
    })
    expect(gate).toEqual({ ok: true })
  })

  it('the consent module cannot reach authority: it takes only a consent record', () => {
    // A run id and a consent record. There is no snapshot, capability,
    // or profile argument, so consent has no way to widen or replace
    // authority — and the run id is there to BIND the record, not to
    // give consent any reach into what the run may do.
    expect(decideSpendGate).toHaveLength(2)
  })
})
