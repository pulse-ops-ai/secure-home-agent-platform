/**
 * RO-EX-44…47: finalization is ATOMIC, not compensated.
 *
 * `FinalizationPort` promises that after `commit` returns, either the
 * journal tail, the terminal event, and the sealed bundle are all
 * observable or none of them are. An implementation that writes each in
 * turn and undoes them on failure does not deliver that. It delivers
 * rollback, which is a different guarantee:
 *
 *  - while the commit is in progress, a reader sees a new journal tail
 *    with no terminal event and no bundle — a run that is sealed
 *    according to one participant and unfinished according to the other
 *    two;
 *  - and if the compensating retraction itself fails, the invariant is
 *    not merely at risk, it is broken, with no path back.
 *
 * The fix is not a better rollback. It is that nothing becomes visible
 * until every participant has prepared, at which point one synchronous
 * publication makes all of it visible together. A failure before that
 * point has nothing to undo, so "the rollback failed" stops being a
 * representable state rather than being handled better.
 *
 * These proofs observe the commit FROM INSIDE, because a participant is
 * the only thing that runs during one.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import { RecordingEventSink, RecordingEvidenceSink, InMemoryRunJournal } from '../adapters/index.js'
import { governedWrites, runRequest, testPorts } from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const here = dirname(fileURLToPath(import.meta.url))

interface MidCommitView {
  journalStates: string[]
  terminalEvents: number
  /**
   * How many times the sink was actually asked for the bundle. Every
   * assertion below is about what was observed DURING that call, so a
   * peek that never ran would make all of them pass on an empty record.
   */
  peeked: number
}

/**
 * An evidence sink that looks at the other two participants at the
 * moment it is asked to stage the bundle.
 *
 * This is the whole proof. Under a compensating adapter the journal tail
 * and the terminal event have ALREADY been written by the time the
 * evidence participant runs, so this observes a half-finalized run.
 * Under a staged design it observes nothing, because nothing has been
 * published.
 */
const peekingEvidenceSink = (
  journal: InMemoryRunJournal,
  events: RecordingEventSink,
  seen: MidCommitView,
): RecordingEvidenceSink => {
  const base = new RecordingEvidenceSink()
  const peek = async (kind: string): Promise<void> => {
    // Only the bundle matters: the early-terminal record is not part of
    // a finalization commit at all.
    if (kind !== 'evidence_bundle') return
    seen.peeked += 1
    const state = await journal.readCurrentState({ run_id: RUN })
    seen.journalStates = (state?.transitions ?? []).map((entry) => entry.to)
    seen.terminalEvents = events
      .eventsOf(RUN)
      .filter((event) => (event as { event_type: string }).event_type === 'run.terminated').length
  }
  // Hooks BOTH the compensating contract's method and the staged one, so
  // this proof observes the commit whichever of the two is in force —
  // and therefore reports on the implementation rather than on which
  // method name happens to exist.
  const proxy = {
    write: async (request: { kind: string }) => {
      await peek(request.kind)
      return (base as unknown as { write: (r: unknown) => Promise<unknown> }).write(request)
    },
    stageWrite: async (request: { kind: string }) => {
      await peek(request.kind)
      return (base as unknown as { stageWrite: (r: unknown) => Promise<unknown> }).stageWrite(
        request,
      )
    },
    writesOf: base.writesOf.bind(base),
    get all() {
      return base.all
    },
  }
  return proxy as unknown as RecordingEvidenceSink
}

describe('RO-EX-44: no participant observes a half-finalized run', () => {
  it('the journal tail is not visible while the bundle is still being prepared', async () => {
    const journal = new InMemoryRunJournal()
    const events = new RecordingEventSink()
    const seen: MidCommitView = { journalStates: [], terminalEvents: -1, peeked: 0 }
    const ports = testPorts({
      journal,
      events,
      evidence: peekingEvidenceSink(journal, events, seen),
    })

    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state, 'the run must reach finalization for this to prove anything').toBe(
      'COMPLETED',
    )

    expect(seen.peeked, 'the sink was never asked for the bundle').toBeGreaterThan(0)
    // The terminal transitions are part of the SAME commit as the bundle.
    // Seeing them here means a reader could see a run that has sealed its
    // evidence while no evidence exists.
    expect(seen.journalStates).not.toContain('EVIDENCE_SEALED')
    expect(seen.journalStates).not.toContain('COMPLETED')
  })

  it('the terminal event is not visible while the bundle is still being prepared', async () => {
    const journal = new InMemoryRunJournal()
    const events = new RecordingEventSink()
    const seen: MidCommitView = { journalStates: [], terminalEvents: -1, peeked: 0 }
    const ports = testPorts({
      journal,
      events,
      evidence: peekingEvidenceSink(journal, events, seen),
    })

    await new Runner(ports).run(runRequest())

    expect(seen.peeked, 'the sink was never asked for the bundle').toBeGreaterThan(0)
    // `run.terminated` announces the outcome. Announcing it before the
    // bundle exists is the exact failure the transaction was introduced
    // to remove: an event that is true of an intention, not of a fact.
    expect(seen.terminalEvents).toBe(0)
  })

  it('after commit returns, all three ARE observable', async () => {
    // The other half of atomicity. Without this, a port that published
    // nothing at all would satisfy every assertion above.
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(conclusion.state).toBe('COMPLETED')
    expect(journaled?.transitions.map((entry) => entry.to).slice(-2)).toEqual([
      'EVIDENCE_SEALED',
      'COMPLETED',
    ])
    expect(
      ports.events
        .eventsOf(RUN)
        .filter((event) => (event as { event_type: string }).event_type === 'run.terminated'),
    ).toHaveLength(1)
    expect(governedWrites(ports, RUN)).toHaveLength(1)
  })
})

describe('RO-EX-45: staged writes are invisible until published', () => {
  const fence = { run_id: RUN, generation: 1 }

  it('a staged journal tail does not appear in readCurrentState', async () => {
    const journal = new InMemoryRunJournal()
    const staging = await journal.stageTransitions({
      ...fence,
      transitions: [
        {
          from: 'VERIFYING',
          to: 'EVIDENCE_SEALED',
          kind: 'seal_evidence',
          cause: 'staged',
          at: '2026-01-01T00:00:00.000Z',
        },
      ] as never,
    })
    expect(staging.ok).toBe(true)
    if (!staging.ok) return

    expect(await journal.readCurrentState({ run_id: RUN })).toBeUndefined()
    staging.staged.publish()
    expect((await journal.readCurrentState({ run_id: RUN }))?.transitions).toHaveLength(1)
  })

  it('an abandoned bundle leaves the sink exactly as it was', async () => {
    const evidence = new RecordingEvidenceSink()
    const staging = await evidence.stageWrite({
      ...fence,
      kind: 'evidence_bundle',
      bundle: { a: 1 },
    })
    expect(staging.ok).toBe(true)
    if (!staging.ok) return

    expect(evidence.writesOf(RUN)).toHaveLength(0)
    staging.staged.abandon()
    // Nothing to remove, so nothing that could fail to be removed. This
    // is the whole difference from retraction.
    expect(evidence.writesOf(RUN)).toHaveLength(0)
  })

  it('an abandoned event never enters the stream', async () => {
    const events = new RecordingEventSink()
    const staging = await events.stageEmit({ ...fence, event: { event_type: 'run.terminated' } })
    expect(staging.ok).toBe(true)
    if (!staging.ok) return

    expect(events.eventsOf(RUN)).toHaveLength(0)
    staging.staged.abandon()
    expect(events.eventsOf(RUN)).toHaveLength(0)
  })
})

describe('RO-EX-46: the publication point is synchronous', () => {
  it('publish returns nothing — it cannot be awaited, so nothing can interleave', async () => {
    // A `publish` that returned a promise would let the event loop run
    // between two participants' publications, and a reader scheduled in
    // between would see exactly the partial state this design removes.
    // The guarantee rests on this, so it is asserted rather than assumed.
    const journal = new InMemoryRunJournal()
    const staging = await journal.stageTransitions({
      run_id: RUN,
      generation: 1,
      transitions: [] as never,
    })
    expect(staging.ok).toBe(true)
    if (!staging.ok) return

    expect(staging.staged.publish()).toBeUndefined()
    expect(
      staging.staged.publish.constructor.name,
      'publish must not be an async function',
    ).not.toBe('AsyncFunction')
  })

  it('the commit performs no await after the publication point', () => {
    // A structural guard, because this is an ordering property that no
    // behavioural test can catch reliably: an `await` between the
    // publishes would only surface under a scheduler that happened to
    // interleave. Reading the source is decidable; racing is not.
    const source = readFileSync(join(here, '../adapters/finalization.ts'), 'utf8')
    const marker = source.indexOf('for (const write of staged) write.publish()')
    expect(marker, 'the publication loop must be findable').toBeGreaterThan(0)
    expect(source.slice(marker).includes('await'), 'no await may follow the publication').toBe(
      false,
    )
  })
})

describe('RO-EX-47: the compensating machinery is gone, not merely unused', () => {
  it('no participant exposes retraction any more', () => {
    // Leaving `retractTo` on the surface would let a future commit
    // reach for it and quietly reintroduce the compensating design that
    // could not deliver atomic visibility.
    const journal: object = new InMemoryRunJournal()
    const events: object = new RecordingEventSink()
    const evidence: object = new RecordingEvidenceSink()
    for (const participant of [journal, events, evidence]) {
      expect('retractTo' in participant).toBe(false)
      expect('mark' in participant).toBe(false)
    }
  })

  it('the finalization adapter names no rollback path', () => {
    const source = readFileSync(join(here, '../adapters/finalization.ts'), 'utf8')
    // `abandon` is permitted and is not rollback: it discards state that
    // was never visible. `retractTo` undoes a completed write.
    expect(source.includes('retractTo(')).toBe(false)
  })
})
