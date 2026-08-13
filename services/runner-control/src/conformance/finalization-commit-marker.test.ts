/**
 * RO-EX-82…84: ONE visibility mutation, not three.
 *
 * Staging removed the compensating design, and that was the right move.
 * It did not finish the job. A loop of three synchronous publications
 *
 *     for (const write of staged) write.publish()
 *
 * is safe against the EVENT LOOP — no `await`, so no other task is
 * scheduled between them — and that is all it is safe against. Two holes
 * survive, and neither is about scheduling:
 *
 *  1. `publish(): void` cannot express "does not throw". TypeScript has
 *     no such type. The first publication can succeed and the second
 *     throw, landing on `journal visible / event absent / bundle absent`
 *     with no compensation by design.
 *
 *  2. Synchronous does not mean unobserved. A publication that
 *     synchronously reads another participant — directly, or through any
 *     callback it triggers — observes the system between two mutations.
 *     Nothing needs to be scheduled for this; it is a plain call.
 *
 * The fix is that participant publication stops existing. Each staged
 * record carries a commit id, readers ignore records whose commit is
 * unpublished, and the whole finalization becomes ONE mutation of a
 * shared visibility marker. The stores stay separate; only visibility is
 * shared, which is exactly the thing a durable transaction replaces.
 *
 * These proofs were written against the three-publish implementation and
 * verified to fail against it: an observer inside the sequence saw
 * `{terminalEvents: 1, bundles: 0}`, a failing publication left
 * `{sealedInJournal: true, terminalEvents: 0, bundles: 0}`, and a lease
 * moved after the last staging check still reached COMPLETED.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import { InMemoryRunLease } from '../adapters/index.js'
import type {
  InMemoryRunJournal,
  RecordingEventSink,
  RecordingEvidenceSink,
} from '../adapters/index.js'
import { governedWrites, runRequest, sharedPorts, testPorts } from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

const terminalEventCount = (events: RecordingEventSink): number =>
  events
    .eventsOf(RUN)
    .filter((event) => (event as { event_type: string }).event_type === 'run.terminated').length

const sealedCount = (states: readonly string[]): number =>
  states.filter((state) => state === 'EVIDENCE_SEALED').length

/** What one observation of the whole system saw. */
interface Snapshot {
  readonly sealedInJournal: boolean
  readonly terminalEvents: number
  readonly bundles: number
}

const observe = async (
  journal: InMemoryRunJournal,
  events: RecordingEventSink,
  evidence: RecordingEvidenceSink,
): Promise<Snapshot> => {
  const state = await journal.readCurrentState({ run_id: RUN })
  return {
    sealedInJournal: sealedCount((state?.transitions ?? []).map((entry) => entry.to)) > 0,
    terminalEvents: terminalEventCount(events),
    bundles: evidence.writesOf(RUN).filter((write) => write.kind === 'evidence_bundle').length,
  }
}

/** All three present, or all three absent. Anything else is a torn read. */
const isWhole = (snapshot: Snapshot): boolean => {
  const parts = [snapshot.sealedInJournal, snapshot.terminalEvents > 0, snapshot.bundles > 0]
  return parts.every(Boolean) || !parts.some(Boolean)
}

describe('RO-EX-82: no observer sees the finalization torn, even synchronously', () => {
  it('an observer running INSIDE the commit sees all three or none', async () => {
    const shared = sharedPorts()
    const { journal, events, evidence } = shared
    const snapshots: Snapshot[] = []

    // Observes at the LAST staging call — after the journal tail and the
    // terminal event have already been recorded in their own stores.
    // Under the previous three-publish design an observer at the
    // equivalent point saw the journal published and the bundle absent.
    // Here the records exist but their commit is unpublished, so the
    // observation is whole: storage and visibility are different
    // questions, and only visibility is observable.
    const observing = {
      ...evidence,
      write: evidence.write.bind(evidence),
      writesOf: evidence.writesOf.bind(evidence),
      stageWrite: async (request: Parameters<typeof evidence.stageWrite>[0]) => {
        snapshots.push(await observe(journal, events, evidence))
        return evidence.stageWrite(request)
      },
      get all() {
        return evidence.all
      },
    }

    const conclusion = await new Runner(
      testPorts({
        journal,
        events,
        evidence: observing,
        visibility: shared.visibility,
      }),
    ).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')

    expect(snapshots.length, 'the observer must have run').toBeGreaterThan(0)
    for (const snapshot of snapshots) {
      expect(
        isWhole(snapshot),
        `torn read from inside the commit: ${JSON.stringify(snapshot)}`,
      ).toBe(true)
    }
  })

  it('the terminal tail exists in the journal store but is unreadable until the marker', async () => {
    // The sharpest statement of the model. The rows are THERE from the
    // moment they are staged — that is what makes publication a single
    // set insertion rather than three writes — and no reader can tell.
    const shared = sharedPorts()
    const staging = await shared.journal.stageTransitions({
      run_id: RUN,
      generation: 1,
      commit_id: 'c-visible',
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

    expect(await shared.journal.readCurrentState({ run_id: RUN })).toBeUndefined()
    shared.visibility.publish('c-visible')
    expect((await shared.journal.readCurrentState({ run_id: RUN }))?.transitions).toHaveLength(1)
  })
})

describe('RO-EX-83: publication is not a fallible phase', () => {
  it('a participant has no publication step that could fail halfway', async () => {
    // The previous design could fail here: the second participant's
    // `publish()` throwing left the first one's mutation visible with no
    // compensation. There is no such step now — a participant's only
    // fallible work is staging, which happens while it is invisible.
    const shared = sharedPorts()
    const staging = await shared.events.stageEmit({
      run_id: RUN,
      generation: 1,
      commit_id: 'c-nofail',
      event: { event_type: 'run.terminated' },
    })
    expect(staging.ok).toBe(true)
    if (!staging.ok) return

    expect('publish' in staging.staged).toBe(false)
    expect(Object.keys(staging.staged).sort()).toEqual(['abandon', 'commitId'])
  })

  it('a staging failure leaves every participant whole', async () => {
    const shared = sharedPorts()
    const failing = {
      ...shared.evidence,
      write: shared.evidence.write.bind(shared.evidence),
      writesOf: shared.evidence.writesOf.bind(shared.evidence),
      stageWrite: () => Promise.reject(new Error('participant died while staging')),
      get all() {
        return shared.evidence.all
      },
    }

    const ports = testPorts({
      journal: shared.journal,
      events: shared.events,
      evidence: failing,
      visibility: shared.visibility,
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    const snapshot = await observe(shared.journal, shared.events, shared.evidence)
    expect(isWhole(snapshot), `torn finalization: ${JSON.stringify(snapshot)}`).toBe(true)
    // Nothing published at all: the commit marker was never reached.
    expect(shared.visibility.publishedCount).toBe(0)
  })
})

describe('RO-EX-84: ownership is re-established at the commit marker', () => {
  it('a lease lost AFTER staging publishes nothing', async () => {
    const shared = sharedPorts()
    const { journal, events, evidence } = shared
    const lease = new InMemoryRunLease()

    // All three fence checks happen during the asynchronous staging
    // phase. Ownership moving after the LAST of them is a window the
    // per-resource fence cannot close on its own: the ledger only learns
    // of a newer generation when that generation reaches it, and here it
    // never does. The commit marker is the one place left to check.
    const usurping = {
      ...evidence,
      write: evidence.write.bind(evidence),
      writesOf: evidence.writesOf.bind(evidence),
      stageWrite: async (request: Parameters<typeof evidence.stageWrite>[0]) => {
        const staging = await evidence.stageWrite(request)
        // The bundle is staged LAST, so this is after every fence check.
        lease.steal(RUN)
        return staging
      },
      get all() {
        return evidence.all
      },
    }

    const ports = testPorts({
      journal,
      events,
      evidence: usurping,
      lease,
      visibility: shared.visibility,
    })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(governedWrites(ports, RUN), 'a dispossessed run must not seal').toHaveLength(0)
    expect(terminalEventCount(events)).toBe(0)
  })
})
