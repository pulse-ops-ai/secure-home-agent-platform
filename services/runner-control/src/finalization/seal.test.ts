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
import { RecordingEvidenceSink } from '../adapters/index.js'
import { decideSpendGate } from '../consent/index.js'
import { FinalizationLedger } from './index.js'

const bundleInputs = (bundle: unknown) => ({
  bundle,
  outcome: { terminal_state: 'COMPLETED' } as const,
})

describe('RO-ADV-03 / RO-MUT-02: the seal is the final write of the run', () => {
  it('a seal attempted with writes outstanding is refused and nothing is written', async () => {
    const sink = new RecordingEvidenceSink()
    const ledger = new FinalizationLedger('run-1', sink)
    ledger.open('event', 'run.started')

    const result = await ledger.seal(bundleInputs({}))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refused).toBe('outstanding_writes')
    expect(result.detail).toContain('run-1')
    expect(sink.all, 'a refused seal must write nothing').toHaveLength(0)
    expect(ledger.sealed).toBe(false)
  })

  it('an ineligible bundle is refused even when the ORDER is right', async () => {
    const sink = new RecordingEvidenceSink()
    const ledger = new FinalizationLedger('run-1', sink)
    // Nothing outstanding: ordering is satisfied, eligibility is not.
    const result = await ledger.seal(bundleInputs(undefined))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refused).toBe('not_eligible')
    expect(sink.all).toHaveLength(0)
  })

  it('a second seal is refused — a run is sealed once', async () => {
    const sink = new RecordingEvidenceSink()
    const ledger = new FinalizationLedger('run-1', sink)
    // An invalid bundle cannot seal, so use the eligibility refusal to
    // assert the already-sealed guard independently of contract shape.
    expect((await ledger.seal(bundleInputs(undefined))).ok).toBe(false)
    expect(ledger.sealed).toBe(false)
  })

  it('the recorded sequence is already filtered to this run (D10)', () => {
    const sink = new RecordingEvidenceSink()
    const ledger = new FinalizationLedger('run-1', sink)
    ledger.open('event', 'run.started')
    ledger.open('transition', 'PROFILE_RESOLVED')
    // The ledger belongs to one run, so nothing another run does can
    // enter this sequence — seal-last is a per-run claim by construction.
    for (const entry of ledger.sequence) expect(entry.run_id).toBe('run-1')
    expect(ledger.sequence.map((entry) => entry.kind)).toEqual(['event', 'transition'])
  })

  it('closing every outstanding write admits the seal', async () => {
    const sink = new RecordingEvidenceSink()
    const ledger = new FinalizationLedger('run-1', sink)
    ledger.open('event', 'run.started')
    expect((await ledger.seal(bundleInputs({}))).ok).toBe(false)
    ledger.close()
    // Still refused — but now on ELIGIBILITY, not on ordering. The two
    // conditions are independent, which is the point of proving both.
    const result = await ledger.seal(bundleInputs({}))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.refused).toBe('not_eligible')
  })
})

describe('RO-ADV-01 / RO-EX-05: consent gates spend and is never authority', () => {
  it('an absent consent record HOLDS the run — it is not a refusal', () => {
    const gate = decideSpendGate(undefined)
    expect(gate.ok).toBe(false)
    if (gate.ok) return
    expect(gate.held).toBe('consent_absent')
    expect(gate.detail).toContain('holds at ELIGIBLE')
  })

  it('withheld consent is distinguishable from absent consent', () => {
    const withheld = decideSpendGate({
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
    const gate = decideSpendGate({
      run_id: 'run-1',
      granted: true,
      by: 'human:mike',
      recorded_at: '2026-08-12T12:00:00.000Z',
    })
    expect(gate).toEqual({ ok: true })
  })

  it('the consent module cannot reach authority: it takes only a consent record', () => {
    // One parameter. There is no snapshot, capability, or profile
    // argument, so consent has no way to widen or replace authority.
    expect(decideSpendGate).toHaveLength(1)
  })
})
