/**
 * FRESH D16 FALSIFICATION — the event-domain identity remains load-bearing
 * through staged terminal events and overlapping finalization calls.
 *
 * This file deliberately does not modify the preserved round-15 proof. The
 * controls below use authored RunEvent envelopes so a failure cannot be
 * attributed to an invalid event fixture.
 */
import { RunEvent } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import {
  InMemoryRunLease,
  RecordingEventSink,
  TransactionalFinalization,
} from '../adapters/index.js'
import type {
  CommitOutcome,
  EventSinkPort,
  FenceOutcome,
  FinalizationCommit,
  Staging,
} from '../ports/index.js'
import { CommitLedger } from '../run-state/visibility.js'
import { sharedPorts } from '../testing-fixtures.js'

const T0 = '2026-08-15T12:00:00.000Z'

type EventEnvelope = Record<string, unknown> & {
  readonly event_type: string
  readonly sequence: number
}

const terminalEvent = (run_id: string, sequence: number, detail: string): EventEnvelope => ({
  contract_id: 'run-event',
  contract_version: '1.0.0',
  run_id,
  sequence,
  timestamp: T0,
  adapter: 'adapter',
  event_type: 'run.terminated',
  outcome: { terminal_state: 'CANCELLED', detail },
})

const adapterStartedEvent = (run_id: string, sequence: number): EventEnvelope => ({
  contract_id: 'run-event',
  contract_version: '1.0.0',
  run_id,
  sequence,
  timestamp: T0,
  adapter: 'adapter',
  event_type: 'adapter.started',
})

const commitFor = (
  run_id: string,
  commit_id: string,
  event: EventEnvelope,
  bundle: unknown = {},
): FinalizationCommit => ({
  run_id,
  generation: 1,
  commit_id,
  terminal: 'CANCELLED',
  transitions: [],
  event,
  bundle,
  signal: new AbortController().signal,
})

class CountingEventSink implements EventSinkPort {
  readonly stageRequests: Parameters<EventSinkPort['stageEmit']>[0][] = []

  constructor(readonly inner: RecordingEventSink) {}

  emit(request: Parameters<EventSinkPort['emit']>[0]): Promise<FenceOutcome> {
    return this.inner.emit(request)
  }

  stageEmit(request: Parameters<EventSinkPort['stageEmit']>[0]): Promise<Staging> {
    this.stageRequests.push(request)
    return this.inner.stageEmit(request)
  }
}

class BarrierEventSink implements EventSinkPort {
  readonly stageRequests: Parameters<EventSinkPort['stageEmit']>[0][] = []
  readonly firstStaged: Promise<void>
  readonly secondStaged: Promise<void>
  readonly #firstRelease: Promise<void>
  readonly #firstEntered: () => void
  readonly #secondEntered: () => void
  readonly #releaseFirst: () => void
  #stageCount = 0

  constructor(readonly inner: RecordingEventSink) {
    let firstEntered!: () => void
    let secondEntered!: () => void
    let releaseFirst!: () => void
    this.firstStaged = new Promise((resolve) => {
      firstEntered = resolve
    })
    this.secondStaged = new Promise((resolve) => {
      secondEntered = resolve
    })
    this.#firstRelease = new Promise((resolve) => {
      releaseFirst = resolve
    })
    this.#firstEntered = firstEntered
    this.#secondEntered = secondEntered
    this.#releaseFirst = releaseFirst
  }

  emit(request: Parameters<EventSinkPort['emit']>[0]): Promise<FenceOutcome> {
    return this.inner.emit(request)
  }

  async stageEmit(request: Parameters<EventSinkPort['stageEmit']>[0]): Promise<Staging> {
    this.stageRequests.push(request)
    const result = await this.inner.stageEmit(request)
    this.#stageCount += 1
    if (this.#stageCount === 1) {
      this.#firstEntered()
      await this.#firstRelease
    }
    if (this.#stageCount === 2) this.#secondEntered()
    return result
  }

  releaseFirst(): void {
    this.#releaseFirst()
  }
}

describe('D16 staged event identity is required by the public SPI', () => {
  it('control: a complete terminal envelope has exactly one valid event shape', () => {
    const complete = terminalEvent('run-20260815-round16-a', 0, 'valid')
    const parsed = RunEvent.safeParse(complete)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.sequence).toBe(0)
  })

  it('does not allow a staged terminal event to omit its sequence identity', () => {
    const omittedSequence = {
      contract_id: 'run-event',
      contract_version: '1.0.0',
      run_id: 'run-20260815-round16-a',
      timestamp: T0,
      adapter: 'adapter',
      event_type: 'run.terminated',
      outcome: { terminal_state: 'CANCELLED', detail: 'sequence omitted' },
    }
    const parsed = RunEvent.safeParse(omittedSequence)
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues.map((issue) => issue.path)).toEqual([['sequence']])

    const request = {
      run_id: 'run-20260815-round16-a',
      generation: 1,
      commit_id: 'commit-round16-a',
      sequence: 0,
      event: terminalEvent('run-20260815-round16-a', 0, 'valid'),
    }
    const valid: Parameters<EventSinkPort['stageEmit']>[0] = request
    expect(valid.run_id).toBe('run-20260815-round16-a')

    const omittedIdentity = {
      run_id: 'run-20260815-round16-a',
      generation: 1,
      commit_id: 'commit-round16-a',
      event: omittedSequence,
    }
    // @ts-expect-error D14 requires the staged event-domain identity; sequence is the only omitted field.
    const staged: Parameters<EventSinkPort['stageEmit']>[0] = omittedIdentity
    expect(staged.run_id).toBe('run-20260815-round16-a')
  })
})

describe('D16 exact staged replay is idempotent', () => {
  it('publishes one event for two exact stage requests', async () => {
    const run_id = 'run-20260815-round16-b'
    const commit_id = 'commit-round16-b'
    const visibility = new CommitLedger()
    const recording = new RecordingEventSink(visibility)
    const events = new CountingEventSink(recording)
    const event = terminalEvent(run_id, 0, 'exact replay')
    expect(RunEvent.safeParse(event).success).toBe(true)

    const first = await events.stageEmit({ run_id, generation: 1, commit_id, event })
    const replay = await events.stageEmit({ run_id, generation: 1, commit_id, event })
    expect(events.stageRequests).toHaveLength(2)
    visibility.publish(commit_id)

    expect({
      firstOk: first.ok,
      replayOk: replay.ok,
      visible: recording.eventsOf(run_id),
    }).toEqual({ firstOk: true, replayOk: true, visible: [event] })
  })
})

describe('D16 conflicting staged replay is refused within one commit', () => {
  it('keeps the first staged fact and does not publish the conflicting fact', async () => {
    const run_id = 'run-20260815-round16-c'
    const commit_id = 'commit-round16-c'
    const visibility = new CommitLedger()
    const recording = new RecordingEventSink(visibility)
    const events = new CountingEventSink(recording)
    const firstEvent = adapterStartedEvent(run_id, 0)
    const conflictingEvent = terminalEvent(run_id, 0, 'different fact')
    expect(RunEvent.safeParse(firstEvent).success).toBe(true)
    expect(RunEvent.safeParse(conflictingEvent).success).toBe(true)

    const first = await events.stageEmit({
      run_id,
      generation: 1,
      commit_id,
      event: firstEvent,
    })
    const conflict = await events.stageEmit({
      run_id,
      generation: 1,
      commit_id,
      event: conflictingEvent,
    })
    visibility.publish(commit_id)

    expect({
      calls: events.stageRequests.length,
      firstOk: first.ok,
      conflictOk: conflict.ok,
      conflictReason: conflict.ok ? undefined : conflict.reason,
      visible: recording.eventsOf(run_id),
    }).toEqual({
      calls: 2,
      firstOk: true,
      conflictOk: false,
      conflictReason: 'conflicting_replay',
      visible: [firstEvent],
    })
  })
})

const claimedFinalization = async (run_id: string) => {
  const shared = sharedPorts()
  const lease = new InMemoryRunLease()
  const claim = await lease.claim({
    run_id,
    attempt_id: `round16-${run_id}`,
    signal: new AbortController().signal,
  })
  expect(claim).toMatchObject({ ok: true, generation: 1 })
  return { shared, lease }
}

describe('D16 same-identity finalization is serialized while in flight', () => {
  it('does not allow two different intents with one commit_id to both stage and succeed', async () => {
    const run_id = 'run-20260815-round16-d'
    const { shared, lease } = await claimedFinalization(run_id)
    const events = new BarrierEventSink(shared.events)
    const finalization = new TransactionalFinalization({ ...shared, events, lease })
    const firstEvent = terminalEvent(run_id, 0, 'first intent')
    const secondEvent = terminalEvent(run_id, 0, 'second intent')
    expect(RunEvent.safeParse(firstEvent).success).toBe(true)
    expect(RunEvent.safeParse(secondEvent).success).toBe(true)

    const firstPromise = finalization.commit(commitFor(run_id, 'commit-round16-d', firstEvent))
    await events.firstStaged
    const secondPromise = finalization.commit(commitFor(run_id, 'commit-round16-d', secondEvent))
    await events.secondStaged
    events.releaseFirst()
    const [first, second] = await Promise.all([firstPromise, secondPromise])

    expect({
      stageCalls: events.stageRequests.length,
      successes: [first, second].filter((outcome) => outcome.ok).length,
      visible: shared.events.eventsOf(run_id),
    }).toEqual({
      stageCalls: 2,
      successes: 1,
      visible: [firstEvent],
    })
  })
})

describe('D16 different commit identities cannot finalize one generation twice', () => {
  it('does not allow overlapping commit ids to publish two terminal intents', async () => {
    const run_id = 'run-20260815-round16-e'
    const { shared, lease } = await claimedFinalization(run_id)
    const events = new BarrierEventSink(shared.events)
    const finalization = new TransactionalFinalization({ ...shared, events, lease })
    const firstEvent = terminalEvent(run_id, 0, 'first generation intent')
    const secondEvent = terminalEvent(run_id, 1, 'second generation intent')
    expect(RunEvent.safeParse(firstEvent).success).toBe(true)
    expect(RunEvent.safeParse(secondEvent).success).toBe(true)

    const firstPromise = finalization.commit(commitFor(run_id, 'commit-round16-e1', firstEvent))
    await events.firstStaged
    const secondPromise = finalization.commit(commitFor(run_id, 'commit-round16-e2', secondEvent))
    await events.secondStaged
    events.releaseFirst()
    const [first, second] = await Promise.all([firstPromise, secondPromise])

    const outcomes: CommitOutcome[] = [first, second]
    expect({
      stageCalls: events.stageRequests.length,
      successes: outcomes.filter((outcome) => outcome.ok).length,
      refusalReasons: outcomes
        .filter((outcome): outcome is Extract<CommitOutcome, { readonly ok: false }> => !outcome.ok)
        .map((outcome) => outcome.reason),
      visible: shared.events.eventsOf(run_id),
    }).toMatchObject({ stageCalls: 2, successes: 1, refusalReasons: ['already_committed'] })
    expect(shared.events.eventsOf(run_id)).toHaveLength(1)
    expect([firstEvent, secondEvent]).toContainEqual(shared.events.eventsOf(run_id)[0])
  })
})
