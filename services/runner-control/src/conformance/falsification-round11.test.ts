/**
 * FALSIFICATION ROUND 11 — effects that happen before their acknowledgements.
 *
 * These proofs attack the remaining distinction between a durable effect and
 * the promise that acknowledges it, and the paths that conclude without the
 * full durable walk.
 */
import { describe, expect, it, vi } from 'vitest'
import type {
  AdapterInvocationRequest,
  AdapterReport,
  EventSinkPort,
  FinalizationCommit,
  FinalizationPort,
  RunJournalPort,
} from '../ports/index.js'
import { InMemoryRunLease, TransactionalFinalization } from '../adapters/index.js'
import { Runner } from '../runner.js'
import {
  CountingAuthoritySource,
  governedWrites,
  ObservingAdapter,
  runRequest,
  sharedPorts,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const T0 = '2026-08-14T00:00:00.000Z'

const invalidProfile = {
  ok: true as const,
  source: { source: 'profile' },
  bytes: '{}',
}

const journalDelegating = (shared: ReturnType<typeof sharedPorts>): RunJournalPort => ({
  stageTransitions: shared.journal.stageTransitions.bind(shared.journal),
  appendTransition: shared.journal.appendTransition.bind(shared.journal),
  appendRejection: shared.journal.appendRejection.bind(shared.journal),
  appendAcquisition: shared.journal.appendAcquisition.bind(shared.journal),
  appendHold: shared.journal.appendHold.bind(shared.journal),
  readCurrentState: shared.journal.readCurrentState.bind(shared.journal),
})

describe('RO-EX-157: an early terminal cannot claim a complete durable walk', () => {
  it('a durable refusal record does not make a permanently pending acquisition durable', async () => {
    const shared = sharedPorts()
    const authority = new CountingAuthoritySource({ profile: invalidProfile })
    const journal: RunJournalPort = {
      ...journalDelegating(shared),
      appendAcquisition: () => Promise.reject(new Error('journal permanently unavailable')),
    }
    const ports = testPorts({ ...shared, authority, journal })

    const conclusion = await new Runner(ports).run(runRequest())

    // The profile read and the refusal record prove that this reached the
    // early-terminal path; this is not a test of an unused failing double.
    expect(authority.readsFor(RUN, 'profile')).toHaveLength(1)
    expect(
      governedWrites(ports, RUN).filter((write) => write.kind === 'early_termination_record'),
    ).toHaveLength(1)
    const journaled = await journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.acquisitions ?? [],
      'the acquisition acknowledgement never landed',
    ).toHaveLength(0)

    expect(
      conclusion.kind,
      'a caller must not be told that a terminal is durable while its acquisition fact is missing',
    ).toBe('settlement_failed')
    expect(conclusion.produced).toBe('none')
  })

  it('a refusal with a healthy journal is the control', async () => {
    const authority = new CountingAuthoritySource({ profile: invalidProfile })
    const ports = testPorts({ authority })

    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.kind).toBe('terminal')
    expect(conclusion.produced).toBe('early_termination_record')
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.acquisitions).toHaveLength(1)
  })
})

const adapterReport = {
  outcome: 'observed' as const,
  observation: {
    calls: [{ tool: 'household.read', disposition: 'permitted' as const }],
    claims: [],
    events: [],
    terminal: { exit_code: 0 },
    usage: [],
  },
}

class HangingAdapter {
  readonly requests: AdapterInvocationRequest[] = []

  invoke(request: AdapterInvocationRequest): Promise<AdapterReport> {
    this.requests.push(request)
    return new Promise<AdapterReport>(() => {})
  }
}

describe('RO-EX-158: a durable call event is evidence even when its acknowledgement is late', () => {
  it('does not drop the adapter operation when call.attempted landed before its ack was rejected', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      let attemptedLanded = false
      const shared = sharedPorts()
      const events: EventSinkPort = {
        emit: (request) => {
          const event = request.event as { readonly event_type?: string }
          if (event.event_type === 'call.attempted') {
            attemptedLanded = true
            // RecordingEventSink mutates before returning its acknowledgement.
            void shared.events.emit(request)
            return new Promise<never>(() => {})
          }
          return shared.events.emit(request)
        },
        stageEmit: shared.events.stageEmit.bind(shared.events),
      }
      const adapter = new ObservingAdapter(adapterReport.observation)
      const ports = testPorts({
        ...shared,
        events,
        adapter,
      })

      const pending = new Runner(ports, { deadline_ms: 200 }).run(runRequest(), {
        interrupt: () => (attemptedLanded ? 'cancel' : undefined),
      })
      await vi.advanceTimersByTimeAsync(10)
      const conclusion = await pending

      expect(
        shared.events
          .eventsOf(RUN)
          .some(
            (event) => (event as { readonly event_type?: string }).event_type === 'call.attempted',
          ),
        'the attempted event must have landed before the acknowledgement was rejected',
      ).toBe(true)
      expect(adapter.invocations).toHaveLength(1)
      const bundle = governedWrites(ports, RUN).find((write) => write.kind === 'evidence_bundle')
        ?.payload as { readonly operations: { readonly attempted: readonly unknown[] } } | undefined
      expect(conclusion.state).toBe('CANCELLED')
      expect(
        bundle?.operations.attempted,
        'a durable call.attempted event cannot coexist with an evidence bundle omitting the call',
      ).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('records the operation when the same event sink acknowledges normally', async () => {
    const ports = testPorts({
      adapter: new (class {
        invoke() {
          return Promise.resolve(adapterReport)
        }
      })(),
    })

    const conclusion = await new Runner(ports).run(runRequest())
    const bundle = governedWrites(ports, RUN).find((write) => write.kind === 'evidence_bundle')
      ?.payload as { readonly operations: { readonly attempted: readonly unknown[] } } | undefined

    expect(conclusion.state).toBe('COMPLETED')
    expect(bundle?.operations.attempted).toHaveLength(1)
  })
})

describe('RO-EX-159: settlement expiry keeps cancellation provenance', () => {
  it('does not turn a CANCELLED publication that missed settlement into TIMED_OUT', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const adapter = new HangingAdapter()
      const ports = testPorts({ adapter })
      let finalizationSawCancelled = false
      const original = ports.finalization
      const finalization = {
        commit: async (commit: Parameters<typeof original.commit>[0]) => {
          if (commit.terminal === 'CANCELLED') {
            finalizationSawCancelled = true
            vi.setSystemTime(new Date(Date.now() + 11_000))
          }
          return original.commit(commit)
        },
      }

      const pending = new Runner({ ...ports, finalization }, { deadline_ms: 5_000 }).run(
        runRequest(),
        {
          interrupt: () => (adapter.requests.length > 0 ? 'cancel' : undefined),
        },
      )
      await vi.advanceTimersByTimeAsync(10)
      const conclusion = await pending

      expect(adapter.requests).toHaveLength(1)
      expect(finalizationSawCancelled).toBe(true)
      expect(
        conclusion.state,
        'a settlement-window expiry is not the governed lifecycle timeout',
      ).toBe('CANCELLED')
      expect(conclusion.kind).toBe('settlement_failed')
      if (conclusion.kind === 'settlement_failed') {
        expect(conclusion.intended_terminal).toBe('CANCELLED')
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the normal cancellation control when settlement publication is in time', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const adapter = new HangingAdapter()
      const ports = testPorts({ adapter })
      const pending = new Runner(ports, { deadline_ms: 5_000 }).run(runRequest(), {
        interrupt: () => (adapter.requests.length > 0 ? 'cancel' : undefined),
      })
      await vi.advanceTimersByTimeAsync(10)
      const conclusion = await pending

      expect(conclusion.state).toBe('CANCELLED')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RO-EX-160: a lost finalization acknowledgement is reconciliable', () => {
  const commitFor = (generation: number): FinalizationCommit => ({
    run_id: RUN,
    generation,
    terminal: 'COMPLETED',
    transitions: [],
    event: { event_type: 'run.terminated', outcome: 'success' },
    bundle: { terminal: 'COMPLETED' },
    signal: new AbortController().signal,
  })

  it('retrying after a durable commit acknowledgement is lost does not publish a second terminal', async () => {
    const shared = sharedPorts()
    const lease = new InMemoryRunLease()
    const claim = await lease.claim({
      run_id: RUN,
      attempt_id: 'finalization-retry',
      signal: new AbortController().signal,
    })
    expect(claim.ok).toBe(true)
    if (!claim.ok) return

    const inner = new TransactionalFinalization({
      journal: shared.journal,
      events: shared.events,
      evidence: shared.evidence,
      visibility: shared.visibility,
      lease,
    })
    let lost = true
    const unreliable: FinalizationPort = {
      commit: async (commit) => {
        const outcome = await inner.commit(commit)
        if (lost) {
          lost = false
          throw new Error('acknowledgement lost after publication')
        }
        return outcome
      },
    }
    const commit = commitFor(claim.generation)

    await expect(unreliable.commit(commit)).rejects.toThrow('acknowledgement lost')
    expect(
      shared.evidence.all,
      'the first attempt really published before its acknowledgement was lost',
    ).toHaveLength(1)

    const retry = await unreliable.commit(commit)
    expect(retry.ok).toBe(true)
    expect(
      shared.evidence.all,
      'the caller has no stable commit identity or reconciliation API, so retrying duplicates the terminal',
    ).toHaveLength(1)
  })

  it('a single acknowledged commit is the control', async () => {
    const shared = sharedPorts()
    const lease = new InMemoryRunLease()
    const claim = await lease.claim({
      run_id: RUN,
      attempt_id: 'finalization-control',
      signal: new AbortController().signal,
    })
    expect(claim.ok).toBe(true)
    if (!claim.ok) return

    const finalization = new TransactionalFinalization({
      journal: shared.journal,
      events: shared.events,
      evidence: shared.evidence,
      visibility: shared.visibility,
      lease,
    })
    const outcome = await finalization.commit(commitFor(claim.generation))

    expect(outcome.ok).toBe(true)
    expect(shared.evidence.all).toHaveLength(1)
  })
})

describe('RO-EX-161: a durable journal append cannot be treated as discardable', () => {
  it('does not append an acquisition twice when its first acknowledgement is late', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const shared = sharedPorts()
      const authority = new CountingAuthoritySource({ profile: invalidProfile })
      let acquisitionLanded = false
      let firstAppend = true
      const journal: RunJournalPort = {
        ...journalDelegating(shared),
        appendAcquisition: (request) => {
          if (firstAppend) {
            firstAppend = false
            acquisitionLanded = true
            // InMemoryRunJournal mutates before returning its acknowledgement.
            void shared.journal.appendAcquisition(request)
            return new Promise<never>(() => {})
          }
          return shared.journal.appendAcquisition(request)
        },
      }
      const ports = testPorts({ ...shared, authority, journal })
      const pending = new Runner(ports, { deadline_ms: 200 }).run(runRequest(), {
        interrupt: () => (acquisitionLanded ? 'cancel' : undefined),
      })
      await vi.advanceTimersByTimeAsync(10)
      const conclusion = await pending

      expect(authority.readsFor(RUN, 'profile')).toHaveLength(1)
      expect(conclusion.state).toBe('CANCELLED')
      const journaled = await journal.readCurrentState({ run_id: RUN })
      expect(
        journaled?.acquisitions.filter((entry) => entry.source === 'profile'),
        'one physical acquisition cannot become two durable facts because its first ack was late',
      ).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('records one acquisition when the journal acknowledges normally', async () => {
    const authority = new CountingAuthoritySource({ profile: invalidProfile })
    const ports = testPorts({ authority })

    const conclusion = await new Runner(ports).run(runRequest())
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })

    expect(conclusion.kind).toBe('terminal')
    expect(journaled?.acquisitions.filter((entry) => entry.source === 'profile')).toHaveLength(1)
  })
})
