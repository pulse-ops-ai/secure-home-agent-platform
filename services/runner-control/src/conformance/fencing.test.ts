/**
 * THE FENCE: a lease generation that the resource itself enforces.
 *
 * The lease always minted a generation, and the walk renewed it between
 * phases. That is a LIVENESS check — it proves the run was ours a moment
 * ago. Ownership can move DURING a phase, and every effect after that
 * point was accepted by sinks with no way to tell the dispossessed
 * holder from the real one, because nothing but `renew` ever saw a
 * generation.
 *
 * These proofs are about the other half:
 *
 *  RO-FENCE-01  every effectful port refuses a superseded generation
 *  RO-FENCE-02  the current holder is never locked out by its own writes
 *  RO-FENCE-03  a refusal ANYWHERE stops the run writing everywhere
 *  RO-FENCE-04  a fenced-out run is not a failed run: it produces no
 *               record and no terminal verdict about a run it lost
 *  RO-FENCE-05  the stale holder does not spend, materialize, or tear
 *               down the current holder's session and workspace
 *  RO-FENCE-06  reads stay unfenced, so lost ownership never disguises
 *               itself as a missing document
 */
import { describe, expect, it } from 'vitest'
import {
  DeterministicAdapterInvocation,
  DeterministicExecution,
  InMemoryRunJournal,
  InMemoryRunLease,
  RecordingEventSink,
  RecordingEvidenceSink,
} from '../adapters/index.js'
import { InMemoryExecutionSession } from '../execution/index.js'
import { InMemoryWorkspaceLifecycle } from '../workspace/index.js'
import { FenceLedger } from '../run-state/fence.js'
import { Runner } from '../runner.js'
import {
  StaticWorkspaceObserver,
  governedWrites,
  runRequest,
  seizeLease,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'
import type { ArtifactObservation } from '../ports/index.js'

const RUN = 'run-20260812-0001'

const transition = () =>
  ({
    from: 'REQUESTED',
    to: 'PROFILE_RESOLVED',
    kind: 'resolve_profile',
    cause: 'forged',
    at: '2026-01-01T00:00:00.000Z',
  }) as never

describe('RO-FENCE-01: every effectful port refuses a superseded generation', () => {
  it('the journal refuses an append from the generation it has moved past', async () => {
    const journal = new InMemoryRunJournal()
    expect(
      (await journal.appendTransition({ run_id: RUN, generation: 2, transition: transition() })).ok,
    ).toBe(true)

    const stale = await journal.appendTransition({
      run_id: RUN,
      generation: 1,
      transition: transition(),
    })
    expect(stale.ok).toBe(false)
    expect(stale.ok === false && stale.reason).toBe('stale_fence')

    // And the refusal is not cosmetic: the entry is absent.
    const state = await journal.readCurrentState({ run_id: RUN })
    expect(state?.transitions).toHaveLength(1)
  })

  it('the event sink refuses, and the refused event is not in the stream', async () => {
    const events = new RecordingEventSink()
    await events.emit({ run_id: RUN, generation: 2, event: { event_type: 'run.started' } })

    const stale = await events.emit({ run_id: RUN, generation: 1, event: { event_type: 'forged' } })
    expect(stale.ok).toBe(false)
    expect(events.eventsOf(RUN)).toHaveLength(1)
  })

  it('the evidence sink refuses a stale seal — two signed records of one run', async () => {
    const evidence = new RecordingEvidenceSink()
    await evidence.write({
      run_id: RUN,
      generation: 2,
      kind: 'evidence_bundle',
      bundle: { real: true },
    })

    const stale = await evidence.write({
      run_id: RUN,
      generation: 1,
      kind: 'evidence_bundle',
      bundle: { forged: true },
    })
    expect(stale.ok).toBe(false)
    expect(evidence.writesOf(RUN)).toHaveLength(1)
    expect(evidence.writesOf(RUN)[0]?.payload).toEqual({ real: true })
  })

  it('apply-back refuses: a stale holder cannot materialize over a live workspace', async () => {
    const workspace = new InMemoryWorkspaceLifecycle()
    await workspace.provision({ run_id: RUN, generation: 2, source_ref: '/workspace' })

    const stale = await workspace.applyBack({
      run_id: RUN,
      generation: 1,
      workspace_ref: `workspace:${RUN}`,
      changes: [{ path: 'a.txt', change: 'modified', digest: 'sha256:x' }] as never,
      authorized_by: { contract_id: 'path-policy', digest: 'sha256:y' },
    })
    expect(stale.ok).toBe(false)
    expect(stale.ok === false && stale.reason).toBe('stale_fence')
    expect(workspace.appliedFor(RUN)).toBe(0)
  })

  it('discard refuses: cleanup must not delete the current holder’s workspace', async () => {
    const workspace = new InMemoryWorkspaceLifecycle()
    await workspace.provision({ run_id: RUN, generation: 2, source_ref: '/workspace' })
    const stale = await workspace.discard({ run_id: RUN, generation: 1, workspace_ref: 'w' })
    expect(stale.ok).toBe(false)
  })

  it('the session refuses start, interrupt, and close from a stale holder', async () => {
    const session = new InMemoryExecutionSession()
    await session.prepare({
      run_id: RUN,
      generation: 2,
      profile: { name: 'p', version: '1.0.0', digest: 'sha256:a' },
      limits: {
        wall_clock_seconds: 600,
        cpu_cores: 1,
        memory_bytes: 1,
        pids: 1,
        output_bytes: 1,
      },
    })

    const started = await session.start({ run_id: RUN, generation: 1, session_ref: 's' })
    expect(started.ok).toBe(false)

    const interrupted = await session.interrupt({
      run_id: RUN,
      generation: 1,
      session_ref: 's',
      reason: 'cancel',
    })
    expect(interrupted.ok).toBe(false)
    // The interrupt did not reach the session the current holder is in.
    expect(session.interruptedRefs()).toHaveLength(0)

    const closed = await session.close({ run_id: RUN, generation: 1, session_ref: 's' })
    expect(closed.torn_down).toBe(false)
    expect(closed.reason).toBe('stale_fence')
    expect(session.closedRefs()).toHaveLength(0)
  })

  it('the adapter refuses BEFORE the provider is engaged: no stale spend', async () => {
    const adapter = new DeterministicAdapterInvocation()
    const request = (generation: number) =>
      ({ run_id: RUN, generation, adapter: 'a', signal: new AbortController().signal }) as never

    await adapter.invoke(request(2))
    const stale = await adapter.invoke(request(1))

    expect(stale.outcome).toBe('stale_fence')
    // One invocation recorded, not two: the refused call never ran.
    expect(adapter.requests).toHaveLength(1)
  })

  it('gate execution refuses, and records no attempt', async () => {
    const execution = new DeterministicExecution()
    const request = (generation: number) =>
      ({ run_id: RUN, generation, gate_id: 'lint', signal: new AbortController().signal }) as never

    await execution.runGate(request(2))
    const stale = await execution.runGate(request(1))

    expect(stale.outcome).toBe('stale_fence')
    expect(execution.requests).toHaveLength(1)
  })
})

describe('RO-FENCE-02: the current holder is not locked out by its own writes', () => {
  it('the same generation may write repeatedly', async () => {
    const journal = new InMemoryRunJournal()
    for (let i = 0; i < 3; i += 1) {
      const appended = await journal.appendTransition({
        run_id: RUN,
        generation: 7,
        transition: transition(),
      })
      expect(appended.ok).toBe(true)
    }
    expect((await journal.readCurrentState({ run_id: RUN }))?.transitions).toHaveLength(3)
  })

  it('the fence is per run: one run moving on does not fence another', () => {
    const ledger = new FenceLedger()
    expect(ledger.refuse({ run_id: 'run-a', generation: 5 })).toBeUndefined()
    // A different run at a lower generation is unaffected — unkeyed
    // high-water state here would fence every concurrent run in the
    // process the moment any one of them was re-claimed.
    expect(ledger.refuse({ run_id: 'run-b', generation: 1 })).toBeUndefined()
    expect(ledger.refuse({ run_id: 'run-a', generation: 4 })).toBeDefined()
  })
})

/**
 * Ownership moves during the LAST phase, and this is the whole point.
 *
 * A steal during any earlier phase proves nothing about the fence: the
 * walk renews the lease before each phase, so the pre-existing liveness
 * check would halt the run at the next boundary and the test would pass
 * with the fence removed. `verifying` is the final phase — its terminal
 * is committed from inside it — so after this point there is no boundary
 * left, and only a fence presented to the write itself can stop it.
 *
 * The hook is an ARTIFACT OBSERVER because observation is a read, and
 * reads are deliberately unfenced: it can therefore run at a moment the
 * dispossessed holder still believes it owns the run. The new owner
 * touches the journal, which is how that resource learns the higher
 * generation.
 */
class UsurpingArtifactObserver {
  #calls = 0
  /** How long the journal was at the instant ownership moved. */
  lengthAtSteal = -1

  constructor(
    private readonly lease: InMemoryRunLease,
    private readonly journal: InMemoryRunJournal,
    /** 1 = during `running`; 2 = during `verifying`, after all renewals. */
    private readonly strikeOn: number,
  ) {}

  async observe(request: { run_id: string }): Promise<ArtifactObservation> {
    this.#calls += 1
    if (this.#calls === this.strikeOn) {
      const generation = seizeLease(this.lease, request.run_id)
      await this.journal.appendTransition({
        run_id: request.run_id,
        generation,
        transition: transition(),
      })
      const state = await this.journal.readCurrentState({ run_id: request.run_id })
      this.lengthAtSteal = state?.transitions.length ?? 0
    }
    return { ok: true, artifacts: [] }
  }
}

/** A change under an allowed write root, so materialization is reached. */
const CHANGES = [{ path: 'packages/a.ts', kind: 'modified' as const, bytes: 12 }]

const usurpedPorts = (
  /**
   * With changes the run reaches materialization, where a direct lease
   * renewal also guards the write. WITHOUT changes it skips straight to
   * finalization, and the fenced commit is then the ONLY thing standing
   * between a dispossessed holder and a sealed bundle — which is the
   * scenario that isolates the fence from the renewal.
   */
  changes: readonly { path: string; kind: 'modified'; bytes: number }[] = [],
): TestPorts & { readonly usurper: UsurpingArtifactObserver } => {
  const lease = new InMemoryRunLease()
  const journal = new InMemoryRunJournal()
  // Strike on the SECOND artifact observation: the first is in `running`,
  // the second in `verifying` — after the last phase-boundary renewal.
  const usurper = new UsurpingArtifactObserver(lease, journal, 2)
  const ports = testPorts({
    lease,
    journal,
    artifacts: usurper,
    observer: new StaticWorkspaceObserver({ ok: true, changes }),
  })
  return { ...ports, usurper }
}

describe('RO-FENCE-03/04: a refusal anywhere stops the run writing everywhere', () => {
  it('the control: an undisturbed run COMPLETES and seals exactly one bundle', async () => {
    // Without this, every assertion below would be satisfied by a run
    // that failed for an unrelated reason, and the suite would not
    // notice if the fence stopped being what stops it.
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
    expect(governedWrites(ports, RUN)).toHaveLength(1)
  })

  it('a run dispossessed in the FINAL phase seals nothing — the fence alone stops it', async () => {
    // No observed changes, so there is no materialization step and no
    // renewal before it. The run walks straight into finalization
    // believing it owns the run; the FENCED COMMIT is the only thing
    // that can refuse it. Remove the fence and this run COMPLETES and
    // seals a bundle for a run another holder owns.
    const ports = usurpedPorts()
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.produced).toBe('none')
    expect(conclusion.state).not.toBe('COMPLETED')
    expect(governedWrites(ports, RUN)).toHaveLength(0)
  })

  it('it is not reported as a failed run: no terminal verdict is invented', async () => {
    const conclusion = await new Runner(usurpedPorts()).run(runRequest())

    // The run did not fail a contract; it stopped being ours. Recording
    // OPERATIONAL_FAILURE or INDETERMINATE would be this attempt writing
    // a verdict about a run another holder now owns.
    expect(conclusion.state).not.toBe('OPERATIONAL_FAILURE')
    expect(conclusion.state).not.toBe('INDETERMINATE')
    expect(conclusion.state).not.toBe('COMPLETED')
    expect(conclusion.detail).toMatch(/moved on|lease/i)
  })

  it('the journal gains nothing after ownership moved', async () => {
    const ports = usurpedPorts()
    await new Runner(ports).run(runRequest())

    const state = await ports.journal.readCurrentState({ run_id: RUN })
    // The sharp assertion: the journal is EXACTLY as long as it was the
    // instant the lease moved. Counting the usurper's own entry instead
    // would pass whether or not the dispossessed holder kept appending.
    expect(ports.usurper.lengthAtSteal).toBeGreaterThan(0)
    expect(state?.transitions).toHaveLength(ports.usurper.lengthAtSteal)
  })
})

describe('RO-FENCE-05: the stale holder does not spend or materialize', () => {
  it('the control: an undisturbed run with these changes DOES apply back', async () => {
    // Establishes that this scenario reaches apply-back at all, so the
    // assertion below is about the fence rather than about a run that
    // never had anything to materialize.
    const ports = testPorts({
      observer: new StaticWorkspaceObserver({ ok: true, changes: CHANGES }),
    })
    await new Runner(ports).run(runRequest())
    expect((ports.workspace as InMemoryWorkspaceLifecycle).appliedFor(RUN)).toBe(1)
  })

  it('a dispossessed run materializes nothing', async () => {
    // Guarded by BOTH mechanisms: the direct renewal immediately before
    // the write, and the fence for a workspace that has already served
    // the newer generation. Stated plainly because the fence alone is
    // not sufficient here and the code says so.
    const ports = usurpedPorts(CHANGES)
    await new Runner(ports).run(runRequest())
    expect((ports.workspace as InMemoryWorkspaceLifecycle).appliedFor(RUN)).toBe(0)
  })
})

describe('RO-FENCE-06: reads stay unfenced', () => {
  it('a stale holder can still READ the journal it may not write', async () => {
    const journal = new InMemoryRunJournal()
    await journal.appendTransition({ run_id: RUN, generation: 2, transition: transition() })

    // Refusing the read would report an EMPTY journal to a stale holder,
    // which reads as "this run does not exist" — a far more confusing
    // answer than "you may not write to it".
    const state = await journal.readCurrentState({ run_id: RUN })
    expect(state?.transitions).toHaveLength(1)
  })
})
