/**
 * RO-EX-32…37: the durable run journal and the run lease.
 *
 * Two gaps these close.
 *
 * The journal: `runner-lifecycle` requires every declared transition in a
 * durable reconstructable record, and requires a run held at `ELIGIBLE`
 * for want of consent to be RECORDED rather than dropped. A record kept
 * in memory and written once at the end satisfies neither — a run that
 * dies mid-walk leaves nothing, and a held run leaves no pending
 * identity. So these proofs read the JOURNAL, not the conclusion: a
 * conclusion is the report of a process that survived, and the point is
 * what survives one that did not.
 *
 * The lease: `RunMachine` guarantees one writer per machine instance,
 * which says nothing about two `Runner.run()` calls handed the same
 * `run_id`. The cross-run isolation proofs deliberately use two different
 * ids; these use ONE, which is the case that was unguarded.
 */
import { describe, expect, it } from 'vitest'
import { InMemoryRunJournal, InMemoryRunLease } from '../adapters/index.js'
import { Runner } from '../runner.js'
import {
  CountingAuthoritySource,
  DeterministicExecution,
  runRequest,
  testPorts,
  withoutConsent,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

describe('RO-EX-32: the journal is appended as the walk happens', () => {
  it('a run that faults mid-walk has journaled everything up to the fault', async () => {
    // The gate faults at RUNNING. A journal written only at conclusion
    // would still have this — so the assertion that matters is the ORDER
    // and completeness of what precedes it.
    const ports = testPorts({
      execution: new DeterministicExecution({
        lint: { outcome: 'environmental_fault', detail: 'sandbox died' },
      }),
    })
    await new Runner(ports).run(runRequest())

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled, 'a faulted run must still be reconstructable').toBeDefined()
    expect(journaled?.transitions.map((entry) => entry.to)).toEqual([
      'PROFILE_RESOLVED',
      'ELIGIBLE',
      'SANDBOX_STARTED',
      'RUNNING',
      'OPERATIONAL_FAILURE',
    ])
  })

  it('each transition is journaled at the moment it is taken, not in a batch', async () => {
    // A sink that records how many transitions existed at each append.
    // A batched write appends N entries with the walk already finished;
    // an incremental one appends the k-th entry when exactly k exist.
    const seen: number[] = []
    // Wrapped BEFORE testPorts builds the commit participant, so the
    // finalization tail is counted too. Wrapping afterwards would leave
    // the commit writing to the unwrapped journal and the proof would
    // silently observe only the engine's five.
    const inner = new InMemoryRunJournal()
    const length = async (run_id: string): Promise<number> =>
      (await inner.readCurrentState({ run_id }))?.transitions.length ?? 0
    const counting = {
      ...inner,
      appendTransition: async (request: Parameters<typeof inner.appendTransition>[0]) => {
        const appended = await inner.appendTransition(request)
        seen.push(await length(request.run_id))
        return appended
      },
      // The finalization tail no longer arrives through `appendTransition`
      // — it is STAGED and published with the terminal event and the
      // bundle. Counted at publication, which is the only moment it
      // becomes visible at all.
      stageTransitions: async (request: Parameters<typeof inner.stageTransitions>[0]) => {
        const staging = await inner.stageTransitions(request)
        if (!staging.ok) return staging
        const staged = staging.staged
        return {
          ok: true as const,
          staged: {
            publish: () => {
              staged.publish()
              // Synchronous, so this reads the page directly rather than
              // awaiting — a publication that awaited would be the bug.
              seen.push(-1)
            },
            abandon: staged.abandon.bind(staged),
          },
        }
      },
      appendRejection: inner.appendRejection.bind(inner),
      appendAcquisition: inner.appendAcquisition.bind(inner),
      appendHold: inner.appendHold.bind(inner),
      readCurrentState: inner.readCurrentState.bind(inner),
    }
    const ports = testPorts({ journal: counting })
    await new Runner(ports).run(runRequest())

    // The walk's five transitions land one at a time, each when exactly
    // k exist. The sixth marker is the finalization tail, which is NOT
    // incremental by design: EVIDENCE_SEALED and COMPLETED become
    // visible together with the event and the bundle, or not at all.
    expect(seen, 'the walk must journal incrementally').toEqual([1, 2, 3, 4, 5, -1])
    expect(await length(RUN), 'and the tail added both entries at once').toBe(7)
  })

  it('acquisitions are journaled per epoch and source', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest())
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    const production = journaled?.acquisitions.filter((a) => a.epoch === 'production') ?? []
    const verification = journaled?.acquisitions.filter((a) => a.epoch === 'verification') ?? []
    expect(production.map((a) => a.source)).toEqual(['profile', 'path_policy', 'gate_registry'])
    expect(verification.map((a) => a.source)).toEqual(['profile', 'path_policy', 'gate_registry'])
  })

  it('a failed acquisition is journaled as failed, not omitted', async () => {
    const ports = testPorts({
      authority: new CountingAuthoritySource({
        path_policy: { ok: false, source: { source: 'path_policy' }, failure: 'unreadable' },
      }),
    })
    await new Runner(ports).run(runRequest())
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.acquisitions.find((a) => a.source === 'path_policy')?.outcome).toBe('failed')
  })
})

describe('RO-EX-33: a held run is durably pending', () => {
  it('an unconsented run leaves a resumable pending identity, not silence', async () => {
    const ports = testPorts()
    await new Runner(ports).run(withoutConsent(runRequest()))

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled, 'a held run that leaves no journal has been dropped').toBeDefined()
    expect(journaled?.state).toBe('ELIGIBLE')
    expect(journaled?.held, 'the hold itself must be recorded').toBeDefined()
    expect(journaled?.held?.transition).toBe('commit_spend')
    expect(journaled?.held?.detail).toContain('consent')
  })

  it('the hold names the state it is held at, so a resumer knows where to resume', async () => {
    const ports = testPorts()
    await new Runner(ports).run(withoutConsent(runRequest()))
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.held?.state).toBe('ELIGIBLE')
    expect(journaled?.transitions.at(-1)?.to).toBe('ELIGIBLE')
  })

  it('rejections are journaled too — a refused transition is evidence', async () => {
    const ports = testPorts()
    await new Runner(ports).run(withoutConsent(runRequest()))
    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(journaled?.rejections.some((entry) => entry.reason === 'precondition_unmet')).toBe(true)
  })
})

describe('RO-EX-34: one run, one owner — across Runner instances', () => {
  it('two concurrent runs of the SAME run_id: only one executes', async () => {
    const shared = testPorts()
    const [a, b] = await Promise.all([
      new Runner(shared).run(runRequest()),
      new Runner(shared).run(runRequest()),
    ])

    const outcomes = [a, b]
    expect(
      outcomes.filter((conclusion) => conclusion.produced === 'evidence_bundle'),
      'exactly one of the two may own the run',
    ).toHaveLength(1)
    const refused = outcomes.find((conclusion) => conclusion.produced !== 'evidence_bundle')
    expect(refused?.detail).toContain('lease')
  })

  it('the run that does NOT hold the lease performs no effect at all', async () => {
    const shared = testPorts()
    const holder = new InMemoryRunLease()
    const claimed = await holder.claim({ run_id: RUN })
    expect(claimed.ok).toBe(true)

    const conclusion = await new Runner({ ...shared, lease: holder }).run(runRequest())

    expect(conclusion.produced).toBe('none')
    expect(shared.authority.reads, 'a run we do not own must not read authority').toHaveLength(0)
    expect(shared.adapter.requests).toHaveLength(0)
    expect(shared.evidence.all).toHaveLength(0)
  })

  it('the lease is released on conclusion, so the run can be picked up again', async () => {
    const ports = testPorts()
    await new Runner(ports).run(runRequest())
    const second = await ports.lease.claim({ run_id: RUN })
    expect(second.ok, 'a concluded run must not hold its lease forever').toBe(true)
  })

  it('a held run releases its lease — a pending run is not a locked one', async () => {
    const ports = testPorts()
    await new Runner(ports).run(withoutConsent(runRequest()))
    const second = await ports.lease.claim({ run_id: RUN })
    expect(second.ok).toBe(true)
  })
})

describe('RO-EX-35: a lost lease stops the run', () => {
  it('a run whose lease is stolen mid-walk does not complete', async () => {
    const lease = new InMemoryRunLease()
    const ports = testPorts({ lease })
    const execution = new DeterministicExecution()
    const conclusion = await new Runner({ ...ports, execution }).run(runRequest(), {
      interrupt: () => {
        // Steal the lease out from under the run at the first check.
        lease.steal(RUN)
        return undefined
      },
    })
    expect(conclusion.state, 'a run that lost its lease must not complete').not.toBe('COMPLETED')
    expect(conclusion.detail).toContain('lease')
  })
})

describe('RO-EX-36: the fencing token is real', () => {
  it('a stale generation cannot renew', async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN })
    if (!first.ok) throw new Error('the first claim must succeed')
    lease.steal(RUN)
    expect(await lease.renew({ run_id: RUN, generation: first.generation })).toBe(false)
  })

  it('a stale generation cannot release the current holder', async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN })
    if (!first.ok) throw new Error('the first claim must succeed')
    const current = lease.steal(RUN)
    await lease.release({ run_id: RUN, generation: first.generation })
    expect(
      await lease.renew({ run_id: RUN, generation: current }),
      'a stale release must not hand the run to a third party',
    ).toBe(true)
  })
})

describe('RO-EX-37: the journal is keyed, like every shared port', () => {
  it('two runs through one journal instance stay separate', async () => {
    const shared = testPorts()
    const runner = new Runner(shared)
    await Promise.all([
      runner.run(runRequest({ run_id: 'run-a' })),
      runner.run(runRequest({ run_id: 'run-b' })),
    ])
    for (const run_id of ['run-a', 'run-b']) {
      const journaled = await shared.journal.readCurrentState({ run_id })
      expect(journaled?.run_id).toBe(run_id)
      for (const entry of journaled?.transitions ?? []) expect(entry.run_id).toBe(run_id)
    }
  })

  it('an unknown run has no journal rather than an empty one', async () => {
    const ports = testPorts()
    expect(await ports.journal.readCurrentState({ run_id: 'never-ran' })).toBeUndefined()
  })
})
