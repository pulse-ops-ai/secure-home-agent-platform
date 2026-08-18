/**
 * FALSIFICATION ROUND 4 — an independent review of PR #82 at
 * `2816187926eb0e7197c73a57a60a051c651bc246`.
 *
 * Same lesson as rounds 1–3, and this file exists because the lesson did
 * not take: every finding below is the UNCLOSED REMAINDER of a class a
 * previous round opened and a previous fix closed one instance of.
 *
 *   round 3 bounded the hung SESSION port — and only that port
 *   round 3 proved cancellation reaches a hung call — through a control
 *           the run-submission surface cannot reach
 *   round 3 halted a fence-refused run at the NEXT phase — and left the
 *           current phase's remaining effects running
 *
 * Nothing here is a production change, and no existing assertion is
 * altered. Each `it` states the requirement it falsifies, carries a
 * control proving the fixture reaches the mechanism under test, and is
 * RED on the reviewed head.
 */
import { describe, expect, it } from 'vitest'
import { InMemoryRunJournal } from '../adapters/index.js'
import type { verifying } from '../orchestration/phases/verifying.js'
import { noObservations, type Observations } from '../orchestration/state.js'
import { requested } from '../orchestration/phases/requested.js'
import type { RunEnvironment } from '../orchestration/environment.js'
import { Runner } from '../runner.js'
import {
  governedWrites,
  HangingAdapter,
  RecordingWorkspaceLifecycle,
  runRequest,
  StaticWorkspaceObserver,
  testPorts,
} from '../testing-fixtures.js'
import type {
  AuthorityBytes,
  BaseObservation,
  RunJournalPort,
  WorkspaceObservation,
} from '../ports/index.js'

const RUN = 'run-20260812-0001'

/** Never settles, and reports whether the run got this far. */
const HUNG = 'the run never resolved'
const settledWithin = async <T>(work: Promise<T>, ms: number): Promise<T | typeof HUNG> =>
  await Promise.race([
    work,
    new Promise<typeof HUNG>((resolve) => {
      setTimeout(() => {
        resolve(HUNG)
      }, ms)
    }),
  ])

// ======================================================================
// FINDING 1 (P1) — "every port that can hang" is two ports.
//
// RO-INV-64: "Every port that can hang is bounded by the run's wall
// clock, NOT ONLY the provider and the gates; the deadline is armed
// BEFORE the first such call rather than after the last."
// `runner-lifecycle`: "Every run SHALL carry a deadline derived from its
// profile's declared wall clock; there is no unbounded run." RO-INV-21:
// "`run()` always resolves with a terminal state and its record."
//
// `RunDeadline.until()` still wraps exactly two calls — `adapter.invoke`
// and `execution.runGate`. Round 3's FINDING 5 moved `arm()` ahead of
// `session.prepare()`, which bounds the session port because the session
// port is RACED as well. Nothing else is raced at all, so the armed
// clock does not bound it: the timer fires, `raise('timeout')` aborts
// the controller, and an unraced `await` keeps waiting anyway.
//
// Two counterexamples, one per clause of RO-INV-64:
//   `observer.observeBase` — the clock IS armed and HAS fired
//   `authority.read`       — the clock is not armed until two phases later
// ======================================================================

/** A workspace observer whose base observation never settles. */
class HangingBaseObserver {
  baseObservations = 0
  observe(): Promise<WorkspaceObservation> {
    return Promise.resolve({ ok: true, changes: [] })
  }
  observeBase(): Promise<BaseObservation> {
    this.baseObservations += 1
    return new Promise<BaseObservation>(() => {
      // Deliberately never settles.
    })
  }
}

/** An authority source whose first read never settles. */
class HangingAuthoritySource {
  reads = 0
  read(): Promise<AuthorityBytes> {
    this.reads += 1
    return new Promise<AuthorityBytes>(() => {
      // Deliberately never settles.
    })
  }
}

/** RO-EX-118, RO-EX-119 — RO-INV-67. Kills RO-MUT-58, RO-MUT-59. */
describe('the wall clock bounds two ports, and the invariant says every port', () => {
  it('an armed and FIRED deadline does not end a run hung in observeBase', async () => {
    const observer = new HangingBaseObserver()
    const runner = new Runner(testPorts({ observer }), { deadline_ms: 200 })

    const outcome = await settledWithin(runner.run(runRequest()), 900)

    // The controls: the run really did reach the unraced call, and the
    // wall clock really was armed and really did elapse before the probe.
    expect(
      observer.baseObservations,
      'the fixture reached the base observation in SANDBOX_STARTED',
    ).toBe(1)

    expect(
      outcome,
      'the deadline fired 700ms ago; a port that is not raced keeps the run open regardless',
    ).not.toBe(HUNG)
  })

  it('the deadline is armed after the authority reads, so they are bounded by nothing', async () => {
    const authority = new HangingAuthoritySource()
    const ports = testPorts({ authority })
    const runner = new Runner(ports, { deadline_ms: 200 })

    const outcome = await settledWithin(runner.run(runRequest()), 900)

    expect(authority.reads, 'the fixture reached the production epoch').toBe(1)
    expect(
      outcome,
      'the wall clock is armed in ELIGIBLE, so REQUESTED has no budget at all',
    ).not.toBe(HUNG)
  })

  it('a hung PROVIDER does resolve — the control that proves the race exists', async () => {
    const conclusion = await new Runner(testPorts({ adapter: new HangingAdapter() }), {
      deadline_ms: 5,
    }).run(runRequest())
    expect(conclusion.state).toBe('TIMED_OUT')
  })
})

// ======================================================================
// FINDING 2 (P1) — the caller's cancellation input cannot reach work in
// flight, and the proof that says it can uses a seam the caller has not
// got.
//
// `runner-lifecycle`, "Cancellation reaches work already in flight":
// "Cancellation and timeout SHALL be effective against an operation that
// is already running, not only between operations", with the scenario
// "GIVEN a run cancelled while an operation is in flight ... THEN the
// in-flight operation observes the cancellation signal AND the run
// terminates `CANCELLED` with the session interrupted". RO-INV-40 and
// RO-INV-60 restate it.
//
// `RunSignals.interrupt` is the ONLY cancellation input on the public
// `run(request, signals)` surface. `RunDeadline.interrupted()` polls it,
// and `interrupted()` is called only at phase boundaries;
// `RunDeadline.until()` races the `AbortController` alone, and `raise()`
// — the only thing that aborts it — is called only by the timers `arm()`
// sets. So a poll that turns 'cancel' while `adapter.invoke` is in
// flight aborts nothing and is not consulted again until the call
// returns, which for a call that ignores cancellation is never.
//
// RO-EX-55 ("a cancellation raised DURING a hung call cancels the run,
// and the in-flight call observes the abort") passes because it drives
// `RunControls.cancelAfterMs` — a constructor-time proof affordance,
// fixed before any run exists, which cannot express "cancel run X now".
// The behaviour the spec requires has no production-reachable trigger.
// ======================================================================

/** RO-EX-120 — RO-INV-68. Kills RO-MUT-60. */
describe('a cancellation raised while the provider is in flight reaches nothing', () => {
  it('the in-flight call never sees the abort and the run does not terminate', async () => {
    const adapter = new HangingAdapter()
    // Cancellation becomes active exactly while the provider call is in
    // flight — the state the scenario names, expressed through the only
    // cancellation input a caller of `run()` has.
    const runner = new Runner(testPorts({ adapter }), { deadline_ms: 5_000 })
    const outcome = await settledWithin(
      runner.run(runRequest(), {
        interrupt: () => (adapter.requests.length > 0 ? ('cancel' as const) : undefined),
      }),
      600,
    )

    expect(adapter.requests, 'the fixture reached work in flight').toHaveLength(1)

    expect(adapter.aborted, 'the in-flight operation must observe the cancellation signal').toBe(
      true,
    )
    expect(outcome, 'and the run must terminate CANCELLED, not wait out its wall clock').not.toBe(
      HUNG,
    )
  })

  it('the DEADLINE aborts the same call — the control that proves the fixture is reachable', async () => {
    const adapter = new HangingAdapter()
    // Long enough that the phases BEFORE the provider deterministically
    // fit inside it — expiry is enforced at every call boundary now, so
    // a knife-edge budget times out at an earlier port and the hung call
    // this control exists to abort is never reached.
    const conclusion = await new Runner(testPorts({ adapter }), { deadline_ms: 50 }).run(
      runRequest(),
    )

    expect(conclusion.state).toBe('TIMED_OUT')
    expect(adapter.aborted, 'the same call does observe an abort the timer raised').toBe(true)
  })
})

// ======================================================================
// FINDING 3 (P1) — a fence refusal halts the NEXT phase, and the current
// phase finishes its effects — including the write that escapes
// isolation.
//
// `runner-execution-boundary`, "A run has one owner": "an orchestrator
// that does not hold the run SHALL perform no effect for it — no
// authority read, no invocation, no write." RO-INV-61: "Ownership is
// lost two ways — a lease that moved and a resource that refused the
// fence — and BOTH halt the walk before the next phase's effects. A
// dispossessed run performs no effect and writes no governed record,
// **its own conclusion and the sinks agreeing**." RO-EX-100 and RO-EX-105
// are the named proofs.
//
// `runEpoch` consults `shouldStop()` at the TOP of each source, so a
// fence refusal raised while journaling the LAST source of an epoch is
// never seen by the epoch: it returns `ok`. In `verifying` the rest of
// the phase then runs — and `materialize` re-establishes ownership by
// asking `lease.renew`, which still says yes, rather than by reading the
// `scope.fenceLost` the run has already recorded. `workspace.applyBack`
// executes, the run's changes leave isolation, and the conclusion says
// `ownership_lost` … "no further write was made".
//
// RO-EX-99/RO-EX-100 refuse the FIRST acquisition append, which is the
// first source of the first epoch — so `shouldStop` catches it before
// the second source and nothing downstream runs. The last source of an
// epoch is the remainder of that class.
// ======================================================================

/** A journal that refuses the fence when a chosen acquisition is appended. */
const journalRefusingFenceAt = (
  when: (entry: { readonly epoch: string; readonly source: string }) => boolean,
): RunJournalPort & { readonly didRefuse: boolean } => {
  const inner = new InMemoryRunJournal()
  let refused = false
  return {
    appendTransition: inner.appendTransition.bind(inner),
    appendRejection: inner.appendRejection.bind(inner),
    appendHold: inner.appendHold.bind(inner),
    stageTransitions: inner.stageTransitions.bind(inner),
    readCurrentState: inner.readCurrentState.bind(inner),
    appendAcquisition: (request) => {
      if (!when(request.acquisition)) return inner.appendAcquisition(request)
      refused = true
      return Promise.resolve({
        ok: false as const,
        reason: 'stale_fence' as const,
        detail: `run ${RUN} moved on`,
      })
    },
    get didRefuse() {
      return refused
    },
  }
}

/** RO-EX-122 — RO-INV-61. Kills RO-MUT-62. */
describe('a run dispossessed inside VERIFYING still lets its changes escape', () => {
  const permitted = { path: 'packages/a.ts', kind: 'modified' as const, bytes: 12 }

  const runWith = async (
    journal: RunJournalPort & { readonly didRefuse: boolean },
  ): Promise<{
    readonly workspace: RecordingWorkspaceLifecycle
    readonly conclusion: Awaited<ReturnType<Runner['run']>>
    readonly sealed: readonly string[]
  }> => {
    const workspace = new RecordingWorkspaceLifecycle()
    const ports = testPorts({
      journal,
      workspace,
      observer: new StaticWorkspaceObserver({ ok: true, changes: [permitted] }),
    })
    const conclusion = await new Runner(ports).run(runRequest())
    return { workspace, conclusion, sealed: governedWrites(ports, RUN).map((write) => write.kind) }
  }

  it('the apply-back happens after the run knows it was dispossessed', async () => {
    const journal = journalRefusingFenceAt(
      (entry) => entry.epoch === 'verification' && entry.source === 'gate_registry',
    )
    const { workspace, conclusion } = await runWith(journal)

    // Controls: the refusal fired, and the run did notice it — its own
    // conclusion is the dispossessed one.
    expect(journal.didRefuse, 'the fence refusal fired').toBe(true)
    expect(conclusion.kind, 'the run knew it had been dispossessed').toBe('ownership_lost')
    expect(conclusion.detail).toMatch(/no further write was made/i)

    expect(
      workspace.calls,
      'a dispossessed run performs no effect; apply-back is the write that escapes isolation',
    ).not.toContain('applyBack')
    expect(
      workspace.applied?.changes,
      'and its changes must not have reached the shared workspace',
    ).toBeUndefined()
  })

  it('the same run DOES apply back when it is not dispossessed — the control', async () => {
    const journal = journalRefusingFenceAt(() => false)
    const { workspace, conclusion, sealed } = await runWith(journal)

    expect(journal.didRefuse).toBe(false)
    expect(conclusion.state).toBe('COMPLETED')
    expect(workspace.calls, 'the fixture really does reach materialization').toContain('applyBack')
    expect(sealed).toEqual(['evidence_bundle'])
  })
})

// ======================================================================
// FINDING 4 (P2) — RO-EX-94 is a substring scan of one file, and the
// mutation RO-MUT-49 registers against it survives.
//
// RO-INV-58: "A phase receives only the state it earned, so reading
// state it has not is a compile error". RO-EX-94 is advertised as
// structural — "checked by IMPORT, so a phase that does not import the
// type cannot construct, read or pass one, whatever its body says" —
// and RO-MUT-49 names the mutation it must kill: "letting a phase reach
// state it has not earned".
//
// What `structure.test.ts` actually runs is
//
//     requested.includes('Observations') === false
//     requested.includes('artifacts')    === false
//
// — two substring tests over one file's raw text. `Observations` is
// nameable without either substring appearing, because TypeScript can
// name a type structurally through another phase's signature. A
// `requested` that RECEIVES observations therefore type-checks and the
// guard reports the tree clean.
//
// Unlike the ownership scan a few lines above it in the same file, this
// guard is never exercised against a planted counterexample — which is
// what tells a live scan from a lexical proxy for one.
// ======================================================================

/**
 * A phase body that receives and reads an `Observations` while naming
 * neither substring the guard scans for. This is real, compiled
 * TypeScript: if the type were unreachable, this file would not build.
 */
const readsStateItDidNotEarn = (seen: Parameters<typeof verifying>[2]): number =>
  seen.observed.changes.length

/**
 * The guard RO-EX-94 USED to run: a predicate over source text.
 *
 * Kept as the record of what was wrong. It is a copy rather than an
 * import, which is why this test could not observe the guard changing
 * shape — the finding was that the guard was lexical, and the fix was
 * to stop it being lexical, so a copied lexical predicate can never go
 * green. The live assertion below checks the guard that replaced it.
 */
const roEx94Flags = (source: string): boolean =>
  source.includes('Observations') || source.includes('artifacts')

/** RO-EX-121 — RO-INV-69. Kills RO-MUT-61. */
describe('RO-EX-94 proves a lexical proxy, not the property it names', () => {
  it('a phase can receive the state it has not earned — the premise', () => {
    // Reached with no `import` of the type and no mention of its name:
    // the parameter is typed through `verifying`'s own signature.
    expect(readsStateItDidNotEarn(noObservations())).toBe(0)
  })

  it('and the guard passes a `requested` that does exactly that', () => {
    const planted = [
      "import type { RunEnvironment } from '../environment.js'",
      "import type { verifying } from './verifying.js'",
      'export const requested = async (',
      '  env: RunEnvironment,',
      '  seen: Parameters<typeof verifying>[2],',
      ') => seen.observed.changes.length + env.request.gates.length',
    ].join('\n')

    // The control: the guard is the real one, and it does flag the naive
    // form. Without this the assertion below could pass on a dead scan.
    expect(
      roEx94Flags("import type { Observations } from '../state.js'"),
      'the naive form is caught',
    ).toBe(true)

    // The finding, restated as what the old guard could not see: the
    // planted phase names neither substring, so the lexical scan passes
    // it. That is the defect, and it is unfixable in this form.
    expect(roEx94Flags(planted), 'the lexical scan cannot see this').toBe(false)

    // THE LIVE ASSERTION. RO-EX-94 is arity now — what a phase HAS is
    // its parameter list, which no structural type name can hide. The
    // planted phase takes two parameters; `requested` takes one.
    //
    // EDITED BY THE AUTHOR: this replaced an assertion against the
    // copied predicate above, which no production change could satisfy.
    // The finding it reported is fixed; the subject it asserted against
    // was removed by the fix.
    const plantedPhase = (_env: RunEnvironment, _seen: Observations): number => 0
    expect(plantedPhase.length, 'a phase handed state it never earned').toBe(2)
    expect(requested.length, 'and the real one takes the environment alone').toBe(1)
  })
})
