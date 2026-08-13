/**
 * RO-EX-64…71: the failure paths.
 *
 * The happy path and the ordinary phase boundary were fixed; the paths
 * that run when something has already gone wrong were not. Every one of
 * these is a case where the orchestration keeps acting after it has lost
 * the right to.
 *
 * One of them is worth calling out as a lesson rather than a bug: the
 * seal-last violation was INVISIBLE to the existing proofs because the
 * test helper filtered out the very write that violated it. A helper
 * that excludes a write from "the run's writes" is deciding what the
 * property means, and it decided wrongly.
 */
import { describe, expect, it } from 'vitest'
import {
  InMemoryRunJournal,
  InMemoryRunLease,
  RecordingEventSink,
  RecordingEvidenceSink,
} from '../adapters/index.js'
import { TRANSITIONS, type ProgressState, type TransitionKind } from '../lifecycle/index.js'
import { Runner } from '../runner.js'
import {
  HangingAdapter,
  RecordingSession,
  evidenceSinkFailing,
  journalFailing,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

const withoutTransition = (from: ProgressState, kind: TransitionKind): typeof TRANSITIONS => {
  const row = { ...TRANSITIONS[from] }
  delete row[kind]
  return { ...TRANSITIONS, [from]: row }
}

describe('RO-EX-64: the seal really is the last write of the run', () => {
  it('NO write of any kind follows the sealed bundle', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest())

    // Deliberately unfiltered. The previous proof asked only about
    // "governed" writes, which excluded the transition record — the
    // write that came after the seal. A helper that filters the run's
    // writes is deciding what seal-last means.
    const kinds = ports.evidence.all.filter((write) => write.run_id === RUN).map((w) => w.kind)
    expect(kinds.at(-1), 'the seal must be the final evidence-sink write').toBe('evidence_bundle')
  })
})

describe('RO-EX-65: a partial commit is fully retracted', () => {
  it('a journal that fails PART WAY through the tail leaves no tail behind', async () => {
    // The first terminal entry appends, the second fails. Registering
    // retraction only after the whole loop succeeded left the first one
    // observable.
    let appended = 0
    const journal = journalFailing((transition) => {
      // EVIDENCE_SEALED lands; COMPLETED — the second entry of the same
      // tail — fails. That is the partial-tail case.
      if (transition.to === 'EVIDENCE_SEALED') {
        appended += 1
        return false
      }
      return transition.to === 'COMPLETED'
    })
    const ports = testPorts({ journal })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(appended, 'the first tail entry must have been attempted').toBeGreaterThan(0)
    expect(conclusion.state).not.toBe('COMPLETED')
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'a half-written tail is a partial finalization',
    ).not.toContain('EVIDENCE_SEALED')
  })

  it('an evidence write that fails AFTER landing is retracted', async () => {
    // The sink accepts the write and then reports failure. Evidence
    // retraction was never registered at all, so the bundle stayed.
    const ports = testPorts({
      evidence: evidenceSinkFailing(
        (request) => request.kind === 'evidence_bundle',
        new RecordingEvidenceSink(),
        // LANDS, then reports failure. A sink that rejects BEFORE
        // writing leaves nothing to retract, so a proof built on one
        // cannot tell whether rollback works — which is exactly why the
        // first version of this proof passed with evidence retraction
        // missing from the commit entirely.
        true,
      ),
    })
    await new Runner(ports).run(runRequest())
    expect(ports.evidence.all.filter((write) => write.kind === 'evidence_bundle')).toHaveLength(0)
  })
})

describe('RO-EX-66: a run that lost its lease writes nothing more', () => {
  it('losing ownership mid-walk produces no further write of any kind', async () => {
    const lease = new InMemoryRunLease()
    const ports = testPorts({ lease })
    const runner = new Runner(ports)

    const conclusion = await runner.run(runRequest(), {
      interrupt: () => {
        // Steal the lease; the next phase boundary must stop the run.
        lease.steal(RUN)
        return undefined
      },
    })

    expect(conclusion.detail).toContain('lease')
    const after = ports.evidence.all.filter((write) => write.run_id === RUN)
    expect(after, 'a non-owner performs no write').toHaveLength(0)
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.transitions.some((entry) => entry.to === 'OPERATIONAL_FAILURE')).toBe(false)
  })
})

describe('RO-EX-67: a rejected journal append is not lost', () => {
  it('an append that fails is retried, not dropped from the record', async () => {
    let failures = 0
    const journal = journalFailing((transition) => {
      // Fail the FIRST append of PROFILE_RESOLVED only.
      if (transition.to === 'PROFILE_RESOLVED' && failures === 0) {
        failures += 1
        return true
      }
      return false
    })
    const ports = testPorts({ journal })
    await new Runner(ports).run(runRequest())

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(failures).toBe(1)
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'a rejected append must stay in the retry set, not vanish',
    ).toContain('PROFILE_RESOLVED')
  })
})

describe('RO-EX-68: every terminal transition is checked, including on failure paths', () => {
  it('a table that forbids operational_fault does not keep writing', async () => {
    // failClosed() advanced without checking. With the transition
    // undeclared the machine rejects it, and the orchestration used to
    // carry on and seal anyway.
    const table = withoutTransition('VERIFYING', 'operational_fault')
    const ports = testPorts({
      artifacts: {
        observe: () => Promise.resolve({ ok: false as const, failure: 'unreadable' }),
      },
    })
    const conclusion = await new Runner(ports).run(runRequest(), { transitions: table })

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(ports.evidence.all.filter((write) => write.kind === 'evidence_bundle')).toHaveLength(0)
  })

  it('a table that forbids refuse from REQUESTED writes no early record', async () => {
    const table = withoutTransition('REQUESTED', 'refuse')
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest({ profile_ref: null }), {
      transitions: table,
    })

    expect(conclusion.state).toBe('REQUESTED')
    expect(
      ports.evidence.all,
      'a refusal the machine did not authorize must not be recorded as one',
    ).toHaveLength(0)
  })
})

describe('RO-EX-69: a session is never leaked', () => {
  it('a start() that THROWS still closes nothing and leaks nothing', async () => {
    const session = new RecordingSession()
    const throwing = {
      prepare: session.prepare.bind(session),
      start: () => {
        session.calls.push('start')
        throw new Error('start exploded')
      },
      interrupt: session.interrupt.bind(session),
      close: session.close.bind(session),
    }
    const conclusion = await new Runner(testPorts({ session: throwing })).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(session.calls, 'a prepared session must be closed even when start throws').toContain(
      'close',
    )
  })

  it('an interrupt() that THROWS still closes the session', async () => {
    const session = new RecordingSession()
    const throwing = {
      prepare: session.prepare.bind(session),
      start: session.start.bind(session),
      interrupt: () => {
        session.calls.push('interrupt')
        return Promise.reject(new Error('interrupt exploded'))
      },
      close: session.close.bind(session),
    }
    // A hung adapter, so the cancellation fires while work is in flight
    // rather than after the run has already finished.
    const conclusion = await new Runner(
      testPorts({ session: throwing, adapter: new HangingAdapter() }),
    ).run(runRequest(), { cancelAfterMs: 10 })

    expect(session.calls).toContain('close')
    expect(conclusion.state).not.toBe('COMPLETED')
  })
})

describe('RO-EX-70: lease faults do not escape the run boundary', () => {
  it('a claim() that throws resolves with a conclusion, not a rejection', async () => {
    const ports = testPorts({
      lease: {
        claim: () => {
          throw new Error('lease store down')
        },
        renew: () => Promise.resolve(true),
        release: () => Promise.resolve(),
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.produced).toBe('none')
    expect(ports.evidence.all).toHaveLength(0)
  })

  it('a release() that throws does not replace a successful run', async () => {
    const base = new InMemoryRunLease()
    const ports = testPorts({
      lease: {
        claim: base.claim.bind(base),
        renew: base.renew.bind(base),
        release: () => Promise.reject(new Error('release exploded')),
      },
    })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(
      conclusion.state,
      'a failed release must not turn a completed run into a rejection',
    ).toBe('COMPLETED')
  })
})

describe('RO-EX-71: retraction is scoped to the attempt, not the run', () => {
  it('a failed later attempt does not erase an earlier committed terminal', async () => {
    const sink = new RecordingEvidenceSink()
    const journal = new InMemoryRunJournal()
    const events = new RecordingEventSink()
    const lease = new InMemoryRunLease()

    const first = await new Runner(testPorts({ evidence: sink, journal, events, lease })).run(
      runRequest(),
    )
    expect(first.state).toBe('COMPLETED')
    const committed = sink.all.filter((write) => write.kind === 'evidence_bundle').length
    expect(committed).toBe(1)

    // A SECOND attempt on the same run id that reaches the commit and
    // fails there, so rollback actually runs. Run-scoped retraction
    // would wipe the first attempt's committed bundle along with it.
    const retry = testPorts({
      journal,
      events,
      lease,
      evidence: evidenceSinkFailing((request) => request.kind === 'evidence_bundle', sink, true),
    })
    const second = await new Runner(retry).run(runRequest())

    expect(second.state).not.toBe('COMPLETED')
    expect(
      sink.all.filter((write) => write.kind === 'evidence_bundle'),
      "a later attempt's rollback must not erase an earlier commit",
    ).toHaveLength(committed)
    // And the first attempt's journal tail survives too.
    const journaled = await journal.readCurrentState({ run_id: RUN })
    expect(journaled?.transitions.map((entry) => entry.to)).toContain('COMPLETED')
  })
})
