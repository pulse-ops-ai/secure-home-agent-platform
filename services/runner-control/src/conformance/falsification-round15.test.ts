/**
 * FRESH D14 FALSIFICATION — terminal staging must share event replay
 * identity with ordinary event emission.
 *
 * This proof deliberately leaves falsification-round14.test.ts untouched.
 * Its conflicting-event body is outside the authored RunEvent vocabulary;
 * the valid-event control below proves that a real conflicting replay reaches
 * the sink before exercising the separate terminal-staging seam.
 */
import { RunEvent } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import { RunEventEmitter } from '../events/index.js'
import { InMemoryRunLease, TransactionalFinalization } from '../adapters/index.js'
import type {
  ClockPort,
  EventSinkPort,
  FenceOutcome,
  CommitOutcome,
  FinalizationCommit,
  Staging,
} from '../ports/index.js'
import { sharedPorts } from '../testing-fixtures.js'

const RUN = 'run-20260815-round15'
const T0 = '2026-08-15T12:00:00.000Z'
const COMMIT = 'commit-round15-terminal-conflict'
const clock: ClockPort = { now: () => T0 }
const fence = { run_id: RUN, generation: 1 }

class StageRecordingEventSink implements EventSinkPort {
  readonly stageRequests: Parameters<EventSinkPort['stageEmit']>[0][] = []

  constructor(readonly inner: EventSinkPort) {}

  emit(request: Parameters<EventSinkPort['emit']>[0]): Promise<FenceOutcome> {
    return this.inner.emit(request)
  }

  stageEmit(request: Parameters<EventSinkPort['stageEmit']>[0]): Promise<Staging> {
    this.stageRequests.push(request)
    return this.inner.stageEmit(request)
  }
}

describe('D14 terminal staging shares event identity replay authority', () => {
  it('control: valid conflicting event replay reaches the sink and follows the authored next-identity rule', async () => {
    const shared = sharedPorts()
    const first = new RunEventEmitter({ ...fence, adapter: 'adapter' }, shared.events, clock)
    const firstOutcome = await first.emit({ event_type: 'adapter.started' })
    expect(firstOutcome.ok).toBe(true)

    const retryRequests: Parameters<EventSinkPort['emit']>[0][] = []
    const retryOutcomes: FenceOutcome[] = []
    const retrySink: EventSinkPort = {
      emit: async (request) => {
        retryRequests.push(request)
        const outcome = await shared.events.emit(request)
        retryOutcomes.push(outcome)
        return outcome
      },
      stageEmit: (request) => shared.events.stageEmit(request),
    }
    const retry = new RunEventEmitter({ ...fence, adapter: 'adapter' }, retrySink, clock)
    const next = await retry.emit({ event_type: 'adapter.completed' })

    expect(retryRequests[0]?.sequence).toBe(0)
    expect(retryRequests[0]?.event).toMatchObject({ event_type: 'adapter.completed' })
    expect(retryOutcomes[0]).toMatchObject({ ok: false, reason: 'conflicting_replay' })
    expect(next.ok).toBe(true)
    expect(next.ok && next.event.sequence).toBe(1)
    expect(shared.events.eventsOf(RUN)).toHaveLength(2)
  })

  it('terminal staging refuses a different durable event already occupying the sequence', async () => {
    const shared = sharedPorts()
    const lease = new InMemoryRunLease()
    const claim = await lease.claim({
      run_id: RUN,
      attempt_id: 'round15-terminal-conflict',
      signal: new AbortController().signal,
    })
    expect(claim).toMatchObject({ ok: true, generation: 1 })

    const ordinaryEmitter = new RunEventEmitter(
      { ...fence, adapter: 'adapter' },
      shared.events,
      clock,
    )
    const ordinary = await ordinaryEmitter.emit({ event_type: 'adapter.started' })
    expect(ordinary.ok).toBe(true)
    if (!ordinary.ok) return

    const terminal = new RunEventEmitter(
      { ...fence, adapter: 'adapter' },
      shared.events,
      clock,
    ).envelope({
      event_type: 'run.terminated',
      outcome: { terminal_state: 'CANCELLED', detail: 'round-15 conflict probe' },
    })
    expect(
      RunEvent.safeParse(terminal).success,
      'the staged terminal event is contract-valid',
    ).toBe(true)

    const events = new StageRecordingEventSink(shared.events)
    const finalization = new TransactionalFinalization({ ...shared, events, lease })
    const commit: FinalizationCommit = {
      ...fence,
      commit_id: COMMIT,
      terminal: 'CANCELLED',
      transitions: [],
      event: terminal,
      bundle: {},
      signal: new AbortController().signal,
    }

    const outcome = await finalization.commit(commit)
    expect(events.stageRequests).toHaveLength(1)
    expect(events.stageRequests[0]?.event).toEqual(terminal)

    // A conforming terminal stage must use the same identity/replay authority
    // as ordinary emit: refuse the conflicting event before publication, keep
    // the first event, and report a conflict rather than stale ownership.
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.reason).toBe('conflicting_replay')
      expect(typeof outcome.detail).toBe('string')
    }
    expect(shared.visibility.isPublished(COMMIT)).toBe(false)
    expect(shared.events.eventsOf(RUN)).toEqual([ordinary.event])
    expect(await shared.journal.readCurrentState({ run_id: RUN })).toBeUndefined()
    expect(shared.evidence.writesOf(RUN)).toEqual([])
  })
})

describe('D14 staging result must represent a conflicting replay', () => {
  it('allows staging to represent a conflicting replay refusal', () => {
    const refusal: Staging = {
      ok: false,
      reason: 'conflicting_replay',
      detail: 'same event identity, different terminal event',
    }
    if (refusal.ok) throw new Error('the refusal must be a failed staging result')
    expect(refusal.reason).toBe('conflicting_replay')
  })
})

describe('D14 finalization outcome must propagate a conflicting replay', () => {
  it('allows CommitOutcome to represent a conflicting replay refusal', () => {
    const outcome: CommitOutcome = {
      ok: false,
      reason: 'conflicting_replay',
      detail: 'terminal event sequence is already occupied',
    }
    if (outcome.ok) throw new Error('the outcome must be a failed commit result')
    expect(outcome.reason).toBe('conflicting_replay')
  })
})

describe('RO-EX-169 corrected compiler proof: finalization identity is caller-owned', () => {
  const completeRequest = {
    run_id: RUN,
    generation: 1,
    terminal: 'CANCELLED' as const,
    transitions: [],
    event: { event_type: 'run.terminated', sequence: 0 },
    bundle: {},
    signal: new AbortController().signal,
    commit_id: 'caller-owned-commit',
  } satisfies FinalizationCommit

  it('control: every field other than commit_id is assignable', () => {
    expect(completeRequest.commit_id).toBe('caller-owned-commit')
  })

  it('requires commit_id when the otherwise-valid request omits it', () => {
    const omitted = {
      run_id: RUN,
      generation: 1,
      terminal: 'CANCELLED' as const,
      transitions: [],
      event: { event_type: 'run.terminated', sequence: 0 },
      bundle: {},
      signal: new AbortController().signal,
    }
    // @ts-expect-error D14 requires caller-owned logical commit identity; this is the only omitted field
    const request: FinalizationCommit = omitted
    expect(request.run_id).toBe(RUN)
  })
})
