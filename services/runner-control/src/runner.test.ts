/**
 * The end-to-end orchestration proof net:
 *
 *  ADV-001     a request naming no profile refuses on the PROFILE, never
 *              on consent, and before any spend
 *  RO-ADV-06   cancellation from an early cancellable state still seals a
 *              FULL bundle, with empty sets where nothing ran
 *  RO-ADV-07   a REQUESTED terminal produces the early-terminal record —
 *              never a bundle with fabricated identities
 *  RO-MUT-05   fabricating a bundle for a REQUESTED terminal is killed
 *  RO-EX-08    the requester recorded is the run request's principal
 *  RO-ADV-08   ... even when a profile was captured BEFORE the fault
 *  D9          events are emitted only at representable moments
 */
import { EarlyTerminationRecord, EvidenceBundle } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import { Runner } from './runner.js'
import {
  CountingAuthoritySource,
  StaticWorkspaceObserver,
  runRequest,
  governedWrites,
  testPorts,
  withoutConsent,
  HangingAdapter,
} from './testing-fixtures.js'

/** Nothing for the first `checks` consultations, then the given signal. */
// CANCELLATION ONLY. `RunSignals.interrupt` no longer admits
// `'timeout'`: the governed wall clock owns that terminal's provenance.
const cancelAfterChecks = (checks: number, signal: 'cancel' = 'cancel') => {
  let seen = 0
  return () => {
    seen += 1
    return seen > checks ? signal : undefined
  }
}

describe('the declared walk reaches COMPLETED with a sealed bundle', () => {
  it('completes, seals exactly one bundle, and emits only representable moments', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('COMPLETED')
    expect(conclusion.produced).toBe('evidence_bundle')

    const writes = governedWrites(ports, 'run-20260812-0001')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.kind).toBe('evidence_bundle')
    expect(EvidenceBundle.safeParse(writes[0]?.payload).success).toBe(true)

    // D9: exactly the moments the closed vocabulary represents. No event
    // is invented for PROFILE_RESOLVED, ELIGIBLE, VERIFYING or
    // EVIDENCE_SEALED — those live in the transition record instead.
    const types = ports.events
      .eventsOf('run-20260812-0001')
      .map((event) => (event as { event_type: string }).event_type)
    expect(types).toEqual([
      'run.started',
      'capability.granted',
      'adapter.started',
      'adapter.completed',
      'run.terminated',
    ])
  })

  it('the whole walk is reconstructable: seven declared transitions', async () => {
    const conclusion = await new Runner(testPorts()).run(runRequest())
    expect(conclusion.transitions).toHaveLength(7)
    expect(conclusion.rejections).toHaveLength(0)
  })
})

describe('ADV-001: a request naming no profile refuses on the profile', () => {
  it('refuses before any spend, and the detail names the profile, not consent', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest({ profile_ref: null }))

    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.detail).toContain('no execution profile')
    expect(conclusion.detail).not.toContain('consent')
    // No spend: nothing was executed and no adapter was invoked.
    expect(ports.execution.requests).toHaveLength(0)
    expect(ports.adapter.requests).toHaveLength(0)
  })

  it('refuses on the profile even with affirmative consent recorded', async () => {
    const conclusion = await new Runner(testPorts()).run(
      runRequest({
        profile_ref: null,
        consent: {
          run_id: 'run-20260812-0001',
          granted: true,
          by: 'human:mike',
          recorded_at: '2026-08-12T12:00:00.000Z',
        },
      }),
    )
    expect(conclusion.detail).toContain('no execution profile')
  })
})

describe('RO-ADV-01: eligibility without consent holds at ELIGIBLE', () => {
  it('does not spend, does not refuse, and records the pending state', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(withoutConsent(runRequest()))

    expect(conclusion.state, 'the machine must not leave ELIGIBLE').toBe('ELIGIBLE')
    expect(conclusion.produced).toBe('none')
    expect(
      conclusion.rejections.length,
      'the held spend must be recorded, not dropped',
    ).toBeGreaterThan(0)
    expect(ports.adapter.requests).toHaveLength(0)
    expect(governedWrites(ports)).toHaveLength(0)
  })
})

describe('RO-ADV-07 / RO-MUT-05: a REQUESTED terminal never fabricates a bundle', () => {
  it('an acquisition fault in REQUESTED produces the early-terminal record', async () => {
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        path_policy: { ok: false, source: { source: 'path_policy' }, failure: 'unreadable' },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(conclusion.produced).toBe('early_termination_record')

    const writes = governedWrites(ports, 'run-20260812-0001')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.kind).toBe('early_termination_record')
    expect(EarlyTerminationRecord.safeParse(writes[0]?.payload).success).toBe(true)
    // The bundle shape is not merely absent — it was never constructible.
    expect(EvidenceBundle.safeParse(writes[0]?.payload).success).toBe(false)
  })

  it('a profile that fails contract validation refuses with a record, not a bundle', async () => {
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        profile: {
          ok: true,
          source: { source: 'profile' },
          bytes: '{"contract_id":"execution-profile"}',
        },
      }),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.produced).toBe('early_termination_record')
  })
})

describe('RO-EX-08 / RO-ADV-08: requester provenance', () => {
  it('the record carries the run request principal, byte-for-byte', async () => {
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        gate_registry: { ok: false, source: { source: 'gate_registry' }, failure: 'unreadable' },
      }),
    })
    const requester = { sub: 'human:mike', acting: { kind: 'actor' as const, sub: 'human:mike' } }
    await new Runner(ports).run(runRequest({ requester }))

    const record = governedWrites(ports, 'run-20260812-0001')[0]?.payload as {
      requester: unknown
    }
    expect(record.requester).toEqual(requester)
  })

  it('a profile captured BEFORE the fault does not supply the requester', async () => {
    // profile and path_policy capture cleanly; the registry read faults
    // afterwards. The captured profile's agent principal is
    // "agent:home-status" — it must appear nowhere in the record.
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        gate_registry: { ok: false, source: { source: 'gate_registry' }, failure: 'unreadable' },
      }),
    })
    await new Runner(ports).run(runRequest())

    const payload = governedWrites(ports, 'run-20260812-0001')[0]?.payload
    expect((payload as { requester: { sub: string } }).requester.sub).toBe('human:mike')
    expect(JSON.stringify(payload)).not.toContain('agent:home-status')
  })
})

describe('RO-ADV-06: cancellation seals a full bundle with empty sets', () => {
  it('cancelling at the earliest cancellable state still produces a complete bundle', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest(), {
      // Fires at the SECOND check. The first is now in REQUESTED, which
      // has no captured identities and can only produce the early
      // record; this proof is about the earliest state that can SEAL,
      // which is PROFILE_RESOLVED. (RO-EX-97 covers the REQUESTED case.)
      interrupt: cancelAfterChecks(1),
    })

    expect(conclusion.state).toBe('CANCELLED')
    expect(conclusion.produced).toBe('evidence_bundle')

    const parsed = EvidenceBundle.safeParse(
      ports.evidence.writesOf('run-20260812-0001')[0]?.payload,
    )
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // Complete identities from the production acquisition...
    expect(parsed.data.identities.profile.name).toBe('home-status-read')
    expect(parsed.data.identities.path_policy.contract_id).toBe('path-policy')
    // ...and empty sets, which is the TRUE record of a run that changed
    // nothing — not a gap, and not a reason to withhold the bundle.
    expect(parsed.data.gate_results).toEqual({})
    expect(parsed.data.artifacts).toEqual([])
    expect(parsed.data.change_sets.observed).toEqual([])
    expect(parsed.data.outcome.terminal_state).toBe('CANCELLED')
    expect(JSON.stringify(parsed.data.outcome)).toContain('cancel')
  })

  // RO-EX-127 — RO-INV-73. Kills RO-MUT-66.
  it('a timeout is the same declared shape, with its own terminal state', async () => {
    const ports = testPorts()
    // Past the REQUESTED check, for the same reason as above: this is
    // about the shape a SEALING state produces, not the pre-authority one.
    // DRIVEN BY THE WALL CLOCK, not by a submitted `'timeout'`.
    // `RunSignals.interrupt` returns cancellation only — a requester
    // that could return `'timeout'` authored the provenance of a
    // terminal the lifecycle contract assigns to the governed deadline.
    // The property asserted is unchanged: a timeout produces the same
    // declared shape as a cancellation, with its own terminal state.
    const conclusion = await new Runner(
      { ...ports, adapter: new HangingAdapter() },
      { deadline_ms: 40 },
    ).run(runRequest())
    expect(conclusion.state).toBe('TIMED_OUT')
    expect(conclusion.produced).toBe('evidence_bundle')
  })

  it('a run is never abandoned in a non-terminal state', async () => {
    // An unreadable workspace mid-run is an operational fault, and the
    // run still reaches a terminal state with evidence.
    const ports = testPorts({
      observer: new StaticWorkspaceObserver({ ok: false, failure: 'workspace vanished' }),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(conclusion.produced).toBe('evidence_bundle')
  })
})

describe('gate scheduling through the run', () => {
  it('the execution port receives identities and registry specs, never caller argv', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest({ gates: ['lint', 'unit-tests'] }))
    expect(ports.execution.requests.map((request) => request.gate_id)).toEqual([
      'lint',
      'unit-tests',
    ])
    expect(ports.execution.requests[0]?.spec.executable).toBe('pnpm')
    expect(ports.execution.requests[0]?.spec.args).toEqual(['lint'])
  })

  it('an unknown gate identity refuses the run rather than skipping quietly', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest({ gates: ['not-a-gate'] }))
    expect(conclusion.state).toBe('REFUSED')
    expect(conclusion.detail).toContain('not-a-gate')
  })
})
