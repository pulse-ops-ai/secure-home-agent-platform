/**
 * FRESH R18 FALSIFICATION — an ordinary exact replay must not become a
 * second durable row while an equivalent staged transaction remains
 * publishable.
 *
 * The acknowledgement choice for the exact staged-versus-ordinary cell is
 * intentionally not asserted here. Every conforming choice must still
 * preserve one durable event fact for one (run_id, sequence) identity.
 */
import { RunEvent } from '@secure-home/events'
import { describe, expect, it } from 'vitest'
import { RecordingEventSink } from '../adapters/index.js'
import { CommitLedger } from '../run-state/visibility.js'

const T0 = '2026-08-15T12:00:00.000Z'

type EventEnvelope = Record<string, unknown> & {
  readonly event_type: string
  readonly sequence: number
}

const terminalEvent = (run_id: string, detail: string, sequence = 0): EventEnvelope => ({
  contract_id: 'run-event',
  contract_version: '1.0.0',
  run_id,
  sequence,
  timestamp: T0,
  adapter: 'adapter',
  event_type: 'run.terminated',
  outcome: { terminal_state: 'CANCELLED', detail },
})

const stage = async (
  sink: RecordingEventSink,
  run_id: string,
  commit_id: string,
  event: EventEnvelope,
) =>
  sink.stageEmit({
    run_id,
    generation: 1,
    commit_id,
    event,
  })

const assertContractValid = (event: EventEnvelope): void => {
  expect(RunEvent.safeParse(event).success).toBe(true)
}

describe('R18 event-domain identity versus staged transaction ownership', () => {
  it('does not expose two durable rows for exact staged versus ordinary replay', async () => {
    const run_id = 'run-20260816-round18-exact-boundary'
    const commit_id = 'commit-round18-staged'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'canonical A')
    assertContractValid(eventA)

    const staged = await stage(sink, run_id, commit_id, eventA)
    expect(staged).toMatchObject({ ok: true, staged: { commitId: commit_id } })
    expect(sink.eventsOf(run_id)).toEqual([])

    // The exact acknowledgement behavior is not selected by the current
    // owner contract. The durable identity invariant is selected: after
    // the staged transaction publishes, one identity has one visible fact.
    await sink.emit({
      run_id,
      generation: 1,
      sequence: eventA.sequence,
      event: eventA,
    })

    visibility.publish(commit_id)

    expect(sink.eventsOf(run_id)).toEqual([eventA])
  })

  it('keeps an acknowledged ordinary replay durable if the staged sibling abandons', async () => {
    const run_id = 'run-20260816-round18-acknowledgement-control'
    const commit_id = 'commit-round18-acknowledgement-stage'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'ordinary acknowledgement A')
    assertContractValid(eventA)

    const staged = await stage(sink, run_id, commit_id, eventA)
    expect(staged).toMatchObject({ ok: true, staged: { commitId: commit_id } })
    if (!staged.ok) return

    const ordinary = await sink.emit({
      run_id,
      generation: 1,
      sequence: eventA.sequence,
      event: eventA,
    })

    staged.staged.abandon()

    if (ordinary.ok) {
      expect(sink.eventsOf(run_id)).toEqual([eventA])
    } else {
      expect(sink.eventsOf(run_id)).toEqual([])
    }
  })

  it('keeps an ordinary exact replay single-fact when no staged row exists', async () => {
    const run_id = 'run-20260816-round18-ordinary-control'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'ordinary A')
    assertContractValid(eventA)

    const first = await sink.emit({
      run_id,
      generation: 1,
      sequence: eventA.sequence,
      event: eventA,
    })
    const replay = await sink.emit({
      run_id,
      generation: 1,
      sequence: eventA.sequence,
      event: eventA,
    })

    expect(first).toMatchObject({ ok: true })
    expect(replay).toMatchObject({ ok: true })
    expect(sink.eventsOf(run_id)).toEqual([eventA])
  })

  it('leaves exactly the published sibling when the other stage abandons', async () => {
    const run_id = 'run-20260816-round18-sibling-abandon'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'shared A')
    assertContractValid(eventA)

    const x = await stage(sink, run_id, 'commit-round18-x', eventA)
    const y = await stage(sink, run_id, 'commit-round18-y', eventA)
    expect(x).toMatchObject({ ok: true, staged: { commitId: 'commit-round18-x' } })
    expect(y).toMatchObject({ ok: true, staged: { commitId: 'commit-round18-y' } })
    if (!x.ok || !y.ok) return

    visibility.publish('commit-round18-x')
    expect(sink.eventsOf(run_id)).toEqual([eventA])
    y.staged.abandon()
    y.staged.abandon()
    x.staged.abandon()
    expect(sink.eventsOf(run_id)).toEqual([eventA])
  })

  it('does not add a row when a later exact stage replays a published event', async () => {
    const run_id = 'run-20260816-round18-published-replay'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'published A')
    assertContractValid(eventA)

    const x = await stage(sink, run_id, 'commit-round18-published-x', eventA)
    expect(x).toMatchObject({ ok: true })
    visibility.publish('commit-round18-published-x')

    const y = await stage(sink, run_id, 'commit-round18-published-y', eventA)
    expect(y).toMatchObject({ ok: true, staged: { commitId: 'commit-round18-published-y' } })
    if (y.ok) {
      visibility.publish('commit-round18-published-y')
      y.staged.abandon()
    }

    expect(sink.eventsOf(run_id)).toEqual([eventA])
  })

  it('refuses a different canonical after a sibling publishes', async () => {
    const run_id = 'run-20260816-round18-published-conflict'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'published A')
    const eventB = terminalEvent(run_id, 'conflicting B')
    assertContractValid(eventA)
    assertContractValid(eventB)

    const x = await stage(sink, run_id, 'commit-round18-conflict-x', eventA)
    expect(x).toMatchObject({ ok: true })
    visibility.publish('commit-round18-conflict-x')

    const conflict = await stage(sink, run_id, 'commit-round18-conflict-y', eventB)
    expect(conflict).toMatchObject({ ok: false, reason: 'conflicting_replay' })
    expect(sink.eventsOf(run_id)).toEqual([eventA])
  })

  it('releases an abandoned last stage so a new canonical can claim the identity', async () => {
    const run_id = 'run-20260816-round18-release'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'abandoned A')
    const eventB = terminalEvent(run_id, 'new B')
    assertContractValid(eventA)
    assertContractValid(eventB)

    const x = await stage(sink, run_id, 'commit-round18-release-x', eventA)
    expect(x).toMatchObject({ ok: true })
    if (!x.ok) return
    x.staged.abandon()
    x.staged.abandon()
    expect(sink.eventsOf(run_id)).toEqual([])

    const y = await stage(sink, run_id, 'commit-round18-release-y', eventB)
    expect(y).toMatchObject({ ok: true, staged: { commitId: 'commit-round18-release-y' } })
    visibility.publish('commit-round18-release-y')
    expect(sink.eventsOf(run_id)).toEqual([eventB])
  })

  it('cannot let a stale handle remove a later stage at the reused identity', async () => {
    const run_id = 'run-20260816-round18-stale-handle'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'stale A')
    const eventB = terminalEvent(run_id, 'reused B')
    assertContractValid(eventA)
    assertContractValid(eventB)

    const stale = await stage(sink, run_id, 'commit-round18-stale-x', eventA)
    expect(stale).toMatchObject({ ok: true })
    if (!stale.ok) return
    stale.staged.abandon()

    const current = await stage(sink, run_id, 'commit-round18-stale-y', eventB)
    expect(current).toMatchObject({ ok: true, staged: { commitId: 'commit-round18-stale-y' } })
    stale.staged.abandon()
    stale.staged.abandon()
    expect(sink.eventsOf(run_id)).toEqual([])

    visibility.publish('commit-round18-stale-y')
    expect(sink.eventsOf(run_id)).toEqual([eventB])
  })

  it('keeps the canonical reservation consistent through public calls', async () => {
    const run_id = 'run-20260816-round18-canonical'
    const visibility = new CommitLedger()
    const sink = new RecordingEventSink(visibility)
    const eventA = terminalEvent(run_id, 'canonical A')
    const eventB = terminalEvent(run_id, 'canonical B')
    assertContractValid(eventA)
    assertContractValid(eventB)

    const first = await stage(sink, run_id, 'commit-round18-canonical-x', eventA)
    const conflict = await stage(sink, run_id, 'commit-round18-canonical-y', eventB)
    expect(first).toMatchObject({ ok: true })
    expect(conflict).toMatchObject({ ok: false, reason: 'conflicting_replay' })
    visibility.publish('commit-round18-canonical-x')
    expect(sink.eventsOf(run_id)).toEqual([eventA])
  })
})
