/**
 * FALSIFICATION ROUND 5 — the reviewer's own code review of the
 * production head `2816187`, written as tests before any fix.
 *
 * Round 4 was supplied as tests. These three were supplied as prose,
 * from a separate pass over the implementation the round-4 tests attack,
 * so they are written here in the same form: each states the requirement
 * it falsifies, carries a control proving the fixture reaches the
 * mechanism, and was RED when written.
 *
 * The fourth is mine, and it is the same lesson yet again. Round 4's
 * finding 3 named TWO holes — `runEpoch` returning success after the
 * final append, and `materialize()` re-asking the lease without first
 * respecting a fence it already knows it lost. Closing the first turned
 * the reviewer's test green while the second stayed open, which is
 * precisely the "repaired the counterexample, not the class" verdict
 * every round so far has returned.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import { RunMachine } from '../lifecycle/index.js'
import type { RunSignals } from '../orchestration/result.js'
import {
  digestHex,
  HangingAdapter,
  PINNED_BASE,
  policyDocument,
  RecordingWorkspaceLifecycle,
  runRequest,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'
import { materialize } from '../orchestration/materialize.js'
import { noObservations } from '../orchestration/state.js'
import { RunScope } from '../run/scope.js'
import { RunDeadline } from '../orchestration/deadline.js'
import { FinalizationLedger } from '../finalization/index.js'
import type { RunEnvironment } from '../orchestration/environment.js'

// The fixture's default run id: `runRequest`'s consent record is bound
// to it, and a run whose consent names a different run is refused at
// ELIGIBLE — which would make every test below fail before reaching the
// mechanism it is about.
const RUN = 'run-20260812-0001'

// ======================================================================
// FINDING 5 (P1) — an aborted run can still START a wrapped effect.
//
// Distinct from round 4's "some ports are not raced". These ports ARE
// raced. `RunDeadline.until()` takes an already-created promise:
//
//     await env.deadline.until(ports.adapter.invoke({ … }))
//
// and JavaScript evaluates the argument BEFORE entering `until()`. So a
// deadline that fires while `adapter.started` is being emitted does not
// prevent the invocation — it is launched, `until()` then observes the
// already-aborted signal and returns `undefined`, and the run reports a
// timeout for work it has just set running.
//
// `runner-lifecycle` says a cancelled run performs no further effect,
// and ADR-0013 says an adapter may not be trusted to honour its signal.
// Both are violated by an effect that starts after the abort.
// ======================================================================

/** Emits normally, but holds `adapter.started` past the deadline. */
class SlowStartEvents {
  readonly emitted: string[] = []
  #inner: TestPorts['events']

  constructor(inner: TestPorts['events']) {
    this.#inner = inner
  }

  async emit(request: Parameters<TestPorts['events']['emit']>[0]) {
    const type = (request.event as { event_type?: string }).event_type ?? ''
    this.emitted.push(type)
    if (type === 'adapter.started') {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 120)
      })
    }
    return await this.#inner.emit(request)
  }
}

describe('an aborted run can still start the effect it was about to wrap', () => {
  it('the adapter is invoked after the deadline has already fired', async () => {
    const base = testPorts()
    const adapter = new HangingAdapter()
    const events = new SlowStartEvents(base.events)
    const ports = { ...base, adapter, events } as unknown as TestPorts
    // Fires DURING `adapter.started`, before `invoke` would be reached.
    const runner = new Runner(ports, { deadline_ms: 40 })

    const conclusion = await runner.run(runRequest())

    // The control: the fixture really did reach the emission that holds
    // the run open, and the clock really did elapse inside it.
    expect(events.emitted, 'the run reached adapter.started').toContain('adapter.started')
    expect(conclusion.state, 'and the deadline really did fire').toBe('TIMED_OUT')

    // SETTLE PAST THE ABANDONED CONTINUATION. Round 4's fix races the
    // whole walk against the deadline, so `run()` RESOLVES at the
    // deadline while the walk it abandoned keeps executing. Asserting
    // the instant `run()` returns would observe the effect before it
    // happens and call the run clean — the same vacuous-green this suite
    // has caught in its own tests twice.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250)
    })

    // THE FINDING. The run is over and reported a timeout, and the
    // provider was engaged anyway.
    expect(adapter.requests.length, 'an aborted run started the effect it was about to race').toBe(
      0,
    )
  })

  it('the same run DOES invoke the adapter when nothing aborts it — the control', async () => {
    const base = testPorts()
    const adapter = new HangingAdapter()
    const events = new SlowStartEvents(base.events)
    const ports = { ...base, adapter, events } as unknown as TestPorts
    const runner = new Runner(ports, { deadline_ms: 5_000, cancelAfterMs: 400 })

    await runner.run(runRequest())

    expect(adapter.requests.length, 'the fixture reaches invocation when unaborted').toBe(1)
  })
})

// ======================================================================
// FINDING 6 (P1) — the committed transitions and the adopted ones are
// two different arrays.
//
// `project()` returns BOTH:
//
//     entries              ← the original, mutable
//     capability.entries   ← frozen copies
//
// Finalization is handed `projected.entries`; the machine afterwards
// adopts `projected.capability`. RO-INV-65 makes the capability frozen
// at mint precisely so authorization cannot be checked against one set
// of entries and applied to another — and then the OTHER set is what
// crosses the port boundary.
//
// A `FinalizationPort` that edits the array it was given before
// returning success leaves durable history and machine state disagreeing
// about what the run did, with nothing detecting it.
// ======================================================================

describe('the committed transition tail and the adopted one can diverge', () => {
  it('finalization cannot edit the transitions it was handed', () => {
    const machine = new RunMachine(RUN, { now: () => '2026-08-13T00:00:00.000Z' })
    const projected = machine.project([{ kind: 'resolve_profile', cause: 'proof' }])
    expect(projected.ok, 'the control: the projection succeeded').toBe(true)
    if (!projected.ok) return

    // THE FINDING. What crosses the port boundary must BE what the
    // capability owns — not a mutable twin of it.
    expect(
      projected.entries,
      'the committed entries and the adopted entries are one identity',
    ).toBe(projected.capability.entries)

    expect(
      Object.isFrozen(projected.entries),
      'a port cannot edit the transitions it was handed',
    ).toBe(true)
  })

  it('a finalization port that mutates its transitions does not diverge the record', async () => {
    const ports = testPorts()
    const inner = ports.finalization
    let attemptedEdit = false
    const meddling = {
      commit: async (request: Parameters<typeof inner.commit>[0]) => {
        // A defective — or hostile — implementation editing the tail it
        // was handed, before reporting success.
        try {
          ;(request.transitions as unknown as { push: (entry: unknown) => void }).push({
            ...request.transitions[request.transitions.length - 1],
            cause: 'forged',
          })
        } catch {
          attemptedEdit = true
        }
        return await inner.commit(request)
      },
    }
    const runner = new Runner({ ...ports, finalization: meddling } as unknown as TestPorts)

    const conclusion = await runner.run(runRequest())

    expect(conclusion.state, 'the control: the run sealed').toBe('COMPLETED')
    expect(attemptedEdit, 'the edit was refused rather than silently applied').toBe(true)
    expect(
      conclusion.transitions.some((entry) => entry.cause === 'forged'),
      'a forged transition reached the run record',
    ).toBe(false)
  })
})

// ======================================================================
// FINDING 7 (P1/P2) — a caller can manufacture timeout provenance.
//
// `RunSignals` is exported, and its one field returns
// `'cancel' | 'timeout' | undefined`. `runner-lifecycle` says TIMED_OUT
// is what happens when THE DECLARED WALL-CLOCK BUDGET ELAPSES — a
// governed deadline derived from the captured profile. A requester
// returning `'timeout'` authors the provenance of a terminal cause the
// contract assigns to the deadline mechanism.
//
// The resolution taken: public callers own CANCELLATION only; timeout
// comes exclusively from `RunDeadline`. The cast below is what makes
// this test compile against a narrowed surface — it is the forgery,
// stated explicitly.
// ======================================================================

describe('a caller can author the provenance of a governed terminal', () => {
  it('a submitted `timeout` does not become a TIMED_OUT run', async () => {
    const ports = testPorts()
    const runner = new Runner(ports, { deadline_ms: 60_000 })
    const forged = { interrupt: () => 'timeout' } as unknown as RunSignals

    const conclusion = await runner.run(runRequest(), forged)

    // The control: the signal really was consulted — the run stopped.
    expect(
      ['CANCELLED', 'TIMED_OUT'].includes(conclusion.state),
      'the fixture reached the interrupt',
    ).toBe(true)

    // THE FINDING. The wall clock never elapsed; nothing may report that
    // it did.
    expect(conclusion.state, 'a requester authored a governed terminal').toBe('CANCELLED')
  })

  it('the wall clock still produces TIMED_OUT — the control', async () => {
    const conclusion = await new Runner(testPorts({ adapter: new HangingAdapter() }), {
      deadline_ms: 5,
    }).run(runRequest())
    expect(conclusion.state, 'the governed deadline still owns TIMED_OUT').toBe('TIMED_OUT')
  })
})

// ======================================================================
// FINDING 8 (P1) — round 4's finding 3, second half.
//
// The reviewer named two holes. `runEpoch` returning success after the
// final append is closed. The other is not: `materialize()` re-asks the
// lease immediately before apply-back, but never consults the fence it
// has ALREADY lost. A lease store that answers `renew` affirmatively —
// because it is stale, partitioned, or simply wrong — lets a run known
// to be dispossessed write to the workspace.
//
// RO-INV-61: ownership lost "BOTH halt the walk before the next phase's
// effects. A dispossessed run performs no effect and writes no governed
// record." A run that already knows it lost the fence asking a third
// party for permission is not that.
// ======================================================================

// Proven by calling `materialize` directly rather than through a run.
// No port sits between the verification epoch and apply-back that can
// refuse a fence, so with `runEpoch` closed there is no end-to-end path
// that reaches this guard — it is DEFENCE IN DEPTH, and the honest way
// to prove defence in depth is to put the state in front of it. An
// end-to-end fixture here would prove the earlier guard twice and this
// one not at all.
describe('a run that already knows it lost the fence still asks the lease', () => {
  const dispossessedEnvironment = (ports: TestPorts) => {
    const scope = new RunScope(
      { run_id: RUN, generation: 1 },
      new RunMachine(RUN, ports.clock),
      ports.clock.now({ run_id: RUN }),
    )
    scope.workspace = { workspace_ref: `workspace:${RUN}`, root: PINNED_BASE }
    return {
      request: runRequest(),
      signals: {},
      ports,
      controls: {},
      scope,
      ledger: new FinalizationLedger(RUN),
      deadline: new RunDeadline(scope),
      journalTick: async () => {},
      journalAcquisition: async () => {},
    } as unknown as RunEnvironment
  }

  /**
   * Only what `materialize` READS. A focused unit needs the state the
   * unit consults, and casting the rest is honest about that — building
   * a whole captured authority here would prove the builder, not the
   * guard.
   */
  const materializableState = () => {
    const policy = {
      ok: true as const,
      value: policyDocument(),
      digest: digestHex('c'),
      source: { source: 'path-policy' },
      contract: { contract_id: 'path-policy', contract_version: '2.0.0' },
    }
    const authority = {
      snapshots: { path_policy: policy, profile: undefined, gate_registry: undefined },
    } as unknown as Parameters<typeof materialize>[1]
    const seen = {
      ...noObservations(),
      observed: {
        changes: [{ path: 'packages/a.txt', kind: 'added', digest: digestHex('d'), bytes: 4 }],
      },
    } as unknown as Parameters<typeof materialize>[2]
    return { authority, seen }
  }

  it('a dispossessed run does not apply back, even when renew succeeds', async () => {
    // A lease that says yes to everything — the failure mode the fence
    // exists to survive. `fenceLost` is the fact THIS RUN owns, set by
    // the resource that refused its generation; `renew` is a question
    // asked of a store that may not know yet, or may be partitioned.
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({ workspace }) as TestPorts
    const permissive = { ...ports.lease, renew: async () => true }
    const env = dispossessedEnvironment({ ...ports, lease: permissive } as unknown as TestPorts)
    const { authority, seen } = materializableState()

    // The control: with the fence intact, this exact state applies back.
    await materialize(env, authority, seen)
    expect(
      workspace.calls.filter((c) => c === 'applyBack').length,
      'the fixture reaches apply-back',
    ).toBe(1)

    // THE FINDING. Now the run knows it lost the fence, and the lease
    // still says yes.
    env.scope.loseFence('a resource refused generation 1')
    await materialize(env, authority, seen)
    expect(
      workspace.calls.filter((c) => c === 'applyBack').length,
      'a run that knows it lost the fence wrote to the workspace anyway',
    ).toBe(1)
  })
})
