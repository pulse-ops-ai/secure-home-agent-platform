/**
 * FRESH D17 FALSIFICATION — event replay equivalence must not share staged
 * resource ownership across transaction identities.
 *
 * The event fact may be an exact replay for a second commit, but the second
 * commit's abandon handle must never be able to delete the first commit's
 * unpublished physical row.
 */
import { RunEvent } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import {
  InMemoryRunLease,
  RecordingEventSink,
  TransactionalFinalization,
} from '../adapters/index.js'
import type { RecordingEvidenceSink } from '../adapters/index.js'
import type {
  EventSinkPort,
  EvidenceSinkPort,
  FinalizationCommit,
  Staging,
} from '../ports/index.js'
import type { TransitionEntry } from '../lifecycle/index.js'
import { CommitLedger } from '../run-state/visibility.js'
import { sharedPorts } from '../testing-fixtures.js'

const T0 = '2026-08-15T12:00:00.000Z'

type EventEnvelope = Record<string, unknown> & {
  readonly event_type: string
  readonly sequence: number
}

const terminalEvent = (run_id: string, detail: string): EventEnvelope => ({
  contract_id: 'run-event',
  contract_version: '1.0.0',
  run_id,
  sequence: 0,
  timestamp: T0,
  adapter: 'adapter',
  event_type: 'run.terminated',
  outcome: { terminal_state: 'CANCELLED', detail },
})

const terminalTransition = (run_id: string): TransitionEntry => ({
  run_id,
  from: 'RUNNING',
  to: 'CANCELLED',
  kind: 'cancel',
  cause: 'round17 terminal publication',
  at: T0,
})

const commitFor = (
  run_id: string,
  commit_id: string,
  event: EventEnvelope,
  bundle: unknown,
  signal: AbortSignal,
  transitions: readonly TransitionEntry[],
): FinalizationCommit => ({
  run_id,
  generation: 1,
  commit_id,
  terminal: 'CANCELLED',
  transitions,
  event,
  bundle,
  signal,
})

class BarrierEventSink implements EventSinkPort {
  readonly stageRequests: Parameters<EventSinkPort['stageEmit']>[0][] = []
  readonly stageResults: Staging[] = []
  readonly firstStaged: Promise<void>
  readonly #firstRelease: Promise<void>
  readonly #firstEntered: () => void
  readonly #releaseFirst: () => void
  #stageCount = 0

  constructor(readonly inner: RecordingEventSink) {
    let firstEntered!: () => void
    let releaseFirst!: () => void
    this.firstStaged = new Promise((resolve) => {
      firstEntered = resolve
    })
    this.#firstRelease = new Promise((resolve) => {
      releaseFirst = resolve
    })
    this.#firstEntered = firstEntered
    this.#releaseFirst = releaseFirst
  }

  emit(request: Parameters<EventSinkPort['emit']>[0]) {
    return this.inner.emit(request)
  }

  async stageEmit(request: Parameters<EventSinkPort['stageEmit']>[0]): Promise<Staging> {
    this.stageRequests.push(request)
    const result = await this.inner.stageEmit(request)
    this.stageResults.push(result)
    this.#stageCount += 1
    if (this.#stageCount === 1) {
      this.#firstEntered()
      await this.#firstRelease
    }
    return result
  }

  releaseFirst(): void {
    this.#releaseFirst()
  }
}

class BarrierEvidenceSink implements EvidenceSinkPort {
  readonly firstStaged: Promise<void>
  readonly #firstRelease: Promise<void>
  readonly #firstEntered: () => void
  readonly #releaseFirst: () => void

  constructor(readonly inner: RecordingEvidenceSink) {
    let firstEntered!: () => void
    let releaseFirst!: () => void
    this.firstStaged = new Promise((resolve) => {
      firstEntered = resolve
    })
    this.#firstRelease = new Promise((resolve) => {
      releaseFirst = resolve
    })
    this.#firstEntered = firstEntered
    this.#releaseFirst = releaseFirst
  }

  write(request: Parameters<EvidenceSinkPort['write']>[0]) {
    return this.inner.write(request)
  }

  async stageWrite(request: Parameters<EvidenceSinkPort['stageWrite']>[0]): Promise<Staging> {
    const result = await this.inner.stageWrite(request)
    this.#firstEntered()
    await this.#firstRelease
    return result
  }

  releaseFirst(): void {
    this.#releaseFirst()
  }
}

const claimedFinalization = async (run_id: string) => {
  const shared = sharedPorts()
  const lease = new InMemoryRunLease()
  const claim = await lease.claim({
    run_id,
    attempt_id: `round17-${run_id}`,
    signal: new AbortController().signal,
  })
  expect(claim).toMatchObject({ ok: true, generation: 1 })
  return { shared, lease }
}

describe('D17 cross-transaction exact staged replay owns cleanup separately', () => {
  it('does not let Y abandon X’s exact staged event row at the generation gate', async () => {
    const run_id = 'run-20260815-round17-primary'
    const commitX = 'commit-round17-x'
    const commitY = 'commit-round17-y'
    const { shared, lease } = await claimedFinalization(run_id)
    const events = new BarrierEventSink(shared.events)
    const finalization = new TransactionalFinalization({ ...shared, events, lease })
    const eventX = terminalEvent(run_id, 'exact canonical terminal A')
    const eventY = terminalEvent(run_id, 'exact canonical terminal A')
    const bundle = { terminal: 'CANCELLED', source: 'round17-primary' }
    const transitions = [terminalTransition(run_id)]
    const signalX = new AbortController().signal

    expect(RunEvent.safeParse(eventX).success).toBe(true)
    expect(RunEvent.safeParse(eventY).success).toBe(true)
    expect(eventY).toEqual(eventX)
    expect(JSON.stringify(eventY)).toBe(JSON.stringify(eventX))

    const xPromise = finalization.commit(
      commitFor(run_id, commitX, eventX, bundle, signalX, transitions),
    )
    await events.firstStaged
    expect(events.stageRequests).toHaveLength(1)
    expect(events.stageResults[0]).toMatchObject({ ok: true })
    expect(shared.visibility.isPublished(commitX)).toBe(false)
    expect(shared.events.eventsOf(run_id)).toEqual([])

    let xSettled = false
    void xPromise.then(() => {
      xSettled = true
    })
    const yPromise = finalization.commit(
      commitFor(run_id, commitY, eventY, bundle, new AbortController().signal, transitions),
    )
    const y = await yPromise

    // Y's exact event replay reached the real RecordingEventSink and was
    // accepted before Y was refused by the generation publication gate.
    expect(events.stageRequests).toHaveLength(2)
    expect(events.stageResults[1]).toMatchObject({
      ok: true,
      staged: { commitId: commitY },
    })
    expect(xSettled).toBe(false)
    expect(shared.visibility.isPublished(commitX)).toBe(false)
    expect(shared.visibility.isPublished(commitY)).toBe(false)
    expect(y).toMatchObject({ ok: false, reason: 'already_committed' })

    events.releaseFirst()
    const x = await xPromise
    const journal = await shared.journal.readCurrentState({ run_id })

    expect({
      xOk: x.ok,
      yOk: y.ok,
      yReason: y.ok ? undefined : y.reason,
      visibleEvents: shared.events.eventsOf(run_id),
      journal,
      evidence: shared.evidence.writesOf(run_id),
    }).toEqual({
      xOk: true,
      yOk: false,
      yReason: 'already_committed',
      visibleEvents: [eventX],
      journal: {
        run_id,
        state: 'CANCELLED',
        transitions,
        rejections: [],
        acquisitions: [],
      },
      evidence: [
        {
          run_id,
          commit_id: commitX,
          kind: 'evidence_bundle',
          payload: bundle,
        },
      ],
    })
  })
})

describe('D17 failed winner cleanup and retry controls', () => {
  it('does not let an exact replay report success without its terminal event after X fails', async () => {
    const run_id = 'run-20260815-round17-failed-winner'
    const commitX = 'commit-round17-failed-x'
    const commitY = 'commit-round17-failed-y'
    const { shared, lease } = await claimedFinalization(run_id)
    const events = new BarrierEventSink(shared.events)
    const evidence = new BarrierEvidenceSink(shared.evidence)
    const finalization = new TransactionalFinalization({ ...shared, events, evidence, lease })
    const eventX = terminalEvent(run_id, 'exact canonical terminal B')
    const eventY = terminalEvent(run_id, 'exact canonical terminal B')
    const bundle = { terminal: 'CANCELLED', source: 'round17-failed-winner' }
    const transitions = [terminalTransition(run_id)]
    const signalX = new AbortController()

    expect(RunEvent.safeParse(eventX).success).toBe(true)
    expect(RunEvent.safeParse(eventY).success).toBe(true)
    expect(eventY).toEqual(eventX)

    const xPromise = finalization.commit(
      commitFor(run_id, commitX, eventX, bundle, signalX.signal, transitions),
    )
    await events.firstStaged
    const yPromise = finalization.commit(
      commitFor(run_id, commitY, eventY, bundle, new AbortController().signal, transitions),
    )
    await evidence.firstStaged
    expect(events.stageResults[0]).toMatchObject({ ok: true })
    expect(events.stageResults[1]).toMatchObject({
      ok: true,
      staged: { commitId: commitY },
    })
    expect(shared.visibility.isPublished(commitX)).toBe(false)

    signalX.abort()
    events.releaseFirst()
    const x = await xPromise
    expect(x.ok).toBe(false)
    expect(shared.visibility.isPublished(commitX)).toBe(false)

    evidence.releaseFirst()
    const y = await yPromise
    const visible = shared.events.eventsOf(run_id)

    // A conforming implementation may let Y take over or may refuse it,
    // but it must not acknowledge success while its event row is missing.
    expect(y.ok && visible.length !== 1).toBe(false)
    if (y.ok) expect(visible).toEqual([eventX])
    else expect(visible).toEqual([])
  })

  it('allows a legitimate same-identity retry after a failed in-flight commit', async () => {
    const run_id = 'run-20260815-round17-retry'
    const commit_id = 'commit-round17-retry'
    const { shared, lease } = await claimedFinalization(run_id)
    const events = new BarrierEventSink(shared.events)
    const finalization = new TransactionalFinalization({ ...shared, events, lease })
    const event = terminalEvent(run_id, 'retry after failed in-flight commit')
    const bundle = { terminal: 'CANCELLED', source: 'round17-retry' }
    const transitions = [terminalTransition(run_id)]
    const signal = new AbortController()

    expect(RunEvent.safeParse(event).success).toBe(true)
    const firstPromise = finalization.commit(
      commitFor(run_id, commit_id, event, bundle, signal.signal, transitions),
    )
    await events.firstStaged
    signal.abort()
    events.releaseFirst()
    const first = await firstPromise
    expect(first.ok).toBe(false)

    const retry = await finalization.commit(
      commitFor(
        run_id,
        commit_id,
        terminalEvent(run_id, 'retry after failed in-flight commit'),
        bundle,
        new AbortController().signal,
        transitions,
      ),
    )

    expect(retry).toEqual({ ok: true })
    expect(shared.events.eventsOf(run_id)).toEqual([event])
    expect(shared.evidence.writesOf(run_id)).toEqual([
      { run_id, commit_id, kind: 'evidence_bundle', payload: bundle },
    ])
  })
})

describe('D17 staged abandon controls', () => {
  it('is harmless when repeated after publication', async () => {
    const run_id = 'run-20260815-round17-abandon'
    const commit_id = 'commit-round17-abandon'
    const visibility = new CommitLedger()
    const recording = new RecordingEventSink(visibility)
    const event = terminalEvent(run_id, 'published event cannot be abandoned')

    expect(RunEvent.safeParse(event).success).toBe(true)
    const result = await recording.stageEmit({
      run_id,
      generation: 1,
      commit_id,
      event,
    })
    expect(result).toMatchObject({ ok: true, staged: { commitId: commit_id } })
    if (!result.ok) return

    visibility.publish(commit_id)
    result.staged.abandon()
    result.staged.abandon()

    expect(recording.eventsOf(run_id)).toEqual([event])
  })
})
