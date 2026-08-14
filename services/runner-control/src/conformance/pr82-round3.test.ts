/**
 * The third falsification round, at head `fd985bf`.
 *
 * The previous round's lesson was that a fix which repairs the
 * counterexample stops at the edge of its class. These six are that shape
 * one level out: in each, an enumeration that claims to be total lists one
 * member fewer than the thing it enumerates.
 *
 *   four declared terminal observations, three of them classified
 *   four public machine mutators, three of them scanned
 *   the journal cursor advanced for entries that never landed
 *   the cancellation boundaries stop before the last effect
 *   two calls raced against the deadline, and the rest unbounded
 *   one lease surface for the port, and one more for whoever imports it
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Runner } from '../runner.js'
import {
  ObservingAdapter,
  RecordingWorkspaceLifecycle,
  StaticWorkspaceObserver,
  journalFailing,
  runRequest,
  sharedPorts,
  testPorts,
} from '../testing-fixtures.js'
import type {
  ApplyBackOutcome,
  ApplyBackRequest,
  ExecutionSessionPort,
  FenceOutcome,
  SessionClosure,
  SessionPreparation,
  SessionStart,
} from '../ports/index.js'

const RUN = 'run-20260812-0001'
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const observation = (terminal: Record<string, unknown>) => ({
  calls: [],
  claims: [],
  events: [],
  terminal,
  usage: [],
})

/**
 * FINDING 1 — the fourth terminal observation is classified by nobody.
 *
 * `runner-execution-boundary` names THREE observations that are carried
 * apart so that they may disagree: "the provider's exit code, its
 * self-reported outcome, and its transcript's terminal event ... Where
 * they disagree the run's terminal state cannot be established and SHALL
 * be `INDETERMINATE`, which is a failure class." RO-INV-36 restates it.
 *
 * `TerminalObservations` declares all four fields.
 * `classifyTerminalObservations` destructures three:
 *
 *     const { exit_code, reported_outcome, signalled } = observations
 *
 * `transcript_terminal` is never read, by the classifier or by the field
 * scan that guards against orchestration re-implementing it. So the one
 * observation the spec names by its own words — the transcript's terminal
 * event — can contradict the other two and the run seals COMPLETED.
 *
 * RO-EX-46 does not catch this: its own comment says "exit code,
 * self-reported outcome and transcript terminal are OBSERVATIONS", and
 * then it exercises only the exit/signal pair.
 */
describe('a transcript terminal that disagrees is not classified at all', () => {
  it('two observations say success, the transcript says error, and the run COMPLETES', async () => {
    const adapter = new ObservingAdapter(
      observation({ exit_code: 0, reported_outcome: 'success', transcript_terminal: 'error' }),
    )
    const conclusion = await new Runner(testPorts({ adapter })).run(runRequest())

    expect(
      conclusion.state,
      'the transcript terminal contradicts the exit code and the claim; nothing establishes this run',
    ).toBe('INDETERMINATE')
  })

  it('agreeing observations complete — the control that proves the fixture reaches the seal', async () => {
    const adapter = new ObservingAdapter(
      observation({ exit_code: 0, reported_outcome: 'success', transcript_terminal: 'success' }),
    )
    const conclusion = await new Runner(testPorts({ adapter })).run(runRequest())
    expect(conclusion.state).toBe('COMPLETED')
  })
})

/**
 * FINDING 2 — a transition whose append failed is dropped, not retried.
 *
 * RO-INV-49: "A journal append that fails leaves its entry PENDING for
 * retry; the cursor advances only for what landed." `#flushJournal`
 * honours that — it confirms only the appends that landed.
 *
 * `commitProjected` then overrides it unconditionally:
 *
 *     this.#journaledTransitions = this.#transitions.length
 *
 * Every transition is marked journaled because the COMMIT wrote the tail
 * — but the commit wrote only the tail. An entry still pending when
 * finalization succeeds is marked as durable without ever having been
 * appended, and the next `journalTick` finds nothing to retry.
 *
 * RO-EX-67 fails the append of `PROFILE_RESOLVED`, which is retried
 * mid-walk three transitions before the commit, so it never reaches the
 * cursor overwrite. The last transition before finalization does.
 */
describe('a failed journal append is lost when the commit overwrites the cursor', () => {
  const failingVerifyingAppend = () => {
    const shared = sharedPorts()
    let failures = 0
    const journal = journalFailing((transition) => {
      // The FIRST append of VERIFYING only — exactly RO-EX-67's shape,
      // moved to the last transition before the commit.
      if (transition.to === 'VERIFYING' && failures === 0) {
        failures += 1
        return true
      }
      return false
    }, shared.journal)
    return {
      ports: testPorts({
        journal,
        events: shared.events,
        evidence: shared.evidence,
        visibility: shared.visibility,
      }),
      failed: () => failures,
    }
  }

  it('the run completes and its journal never records the transition it took', async () => {
    const { ports, failed } = failingVerifyingAppend()
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state, 'the run itself completed').toBe('COMPLETED')
    expect(failed(), 'the injected failure fired exactly once').toBe(1)
    expect(
      conclusion.transitions.map((entry) => entry.to),
      'the machine took the transition',
    ).toContain('VERIFYING')

    const journaled = await ports.journal.readCurrentState({ run_id: RUN })
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'a rejected append must stay in the retry set, not be marked journaled by the commit',
    ).toContain('VERIFYING')
    // Stated as the whole record too: the durable walk of a run that
    // concluded is the walk it took, not that walk minus what a
    // transient fault happened to interrupt.
    expect(
      journaled?.transitions.map((entry) => entry.to),
      'the journal is the durable transition record of every transition',
    ).toEqual(conclusion.transitions.map((entry) => entry.to))
  })
})

/**
 * FINDING 3 — the "one owner" scan enumerates three of four mutators.
 *
 * RO-EX-103 claims "EVERY machine-mutating entry point is owned —
 * `advance`, `commitProjected` and `hold`". `RunMachine.apply()` is
 * public, mutates `#state`, appends a transition and bumps `#version`;
 * `advance()` is literally `this.apply(this.claim(), kind, cause)`.
 *
 * So the entry point that does the mutating is the one neither guard
 * scans for. A module calling `machine.apply(machine.claim(), ...)`
 * bypasses `RunScope.reachTerminal` — the owner whose whole purpose is
 * the INDETERMINATE fallback when the machine refuses a terminal — and
 * both structural guards pass. RO-MUT-53 registers exactly this mutation
 * ("mutate the machine through an entry point the owner does not
 * expose") and names RO-EX-103 as its kill.
 */
describe('the one-owner scan does not name the mutator the owners call', () => {
  const guards = ['conformance/structure.test.ts', 'conformance/pr82-falsification.test.ts']

  it('apply() is a public machine mutator — the premise', async () => {
    const { RunMachine } = await import('../lifecycle/index.js')
    const machine = new RunMachine(RUN, { now: () => '2026-08-13T00:00:00.000Z' })
    const before = machine.state
    machine.apply(machine.claim(), 'resolve_profile', 'proof')

    expect(before).toBe('REQUESTED')
    expect(machine.state, 'apply() advances the machine on its own').toBe('PROFILE_RESOLVED')
    expect(machine.transitionRecord, 'and appends to the durable record').toHaveLength(1)
  })

  it('and no structural guard scans for it', () => {
    const scanned = guards.map((guard) => readFileSync(join(srcRoot, guard), 'utf8')).join('\n')

    // Each of the three the claim enumerates is present, which is what
    // makes the fourth's absence a gap rather than a different design.
    for (const owned of ['.advance(', '.commitProjected(', '.hold(']) {
      expect(scanned.includes(`'${owned}'`), `${owned} is scanned`).toBe(true)
    }
    expect(
      scanned.includes("'.apply('"),
      'the guard that claims EVERY mutating entry point omits the one advance() delegates to',
    ).toBe(true)
  })
})

/**
 * FINDING 4 — the last cancellation check precedes the last effects.
 *
 * RO-INV-22: cancellation and timeout are honoured "at every non-terminal
 * boundary, verification included". RO-INV-60: "at EVERY declared
 * boundary". `runner-lifecycle` makes cancel and timeout declared
 * transitions "available from `PROFILE_RESOLVED` and every later
 * non-terminal state", and VERIFYING is one.
 *
 * `verifying.ts` consults the interrupt twice — before the verification
 * epoch, and after the fresh artifact observation. Nothing after that
 * does. Between the second check and the terminal commit the run still
 * performs `lease.renew` and `workspace.applyBack`: the apply-back is the
 * write that escapes isolation, and it is the last await before the seal.
 *
 * A cancellation that becomes active there is never observed. The run
 * seals COMPLETED, and the terminal event announces a completion for a
 * run that was cancelled while still in a non-terminal state.
 */
describe('a cancellation raised during apply-back is never seen', () => {
  const permitted = { path: 'packages/a.ts', kind: 'modified' as const, bytes: 12 }

  /** Cancels the run at the moment the changes leave the workspace. */
  class CancellingApplyBack extends RecordingWorkspaceLifecycle {
    cancelled = false
    override applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
      this.cancelled = true
      return super.applyBack(request)
    }
  }

  it('the run seals COMPLETED for a run cancelled before its terminal transition', async () => {
    const workspace = new CancellingApplyBack()
    const ports = testPorts({
      workspace,
      observer: new StaticWorkspaceObserver(
        { ok: true, changes: [permitted] },
        { ok: true, digest: `sha256:${'b'.repeat(64)}` },
      ),
    })
    const conclusion = await new Runner(ports).run(runRequest(), {
      interrupt: () => (workspace.cancelled ? 'cancel' : undefined),
    })

    expect(workspace.calls, 'the fixture reached the apply-back').toContain('applyBack')
    expect(
      conclusion.state,
      'a run cancelled while still in VERIFYING must not report a completion',
    ).toBe('CANCELLED')
  })
})

/**
 * FINDING 5 — a session port that hangs leaves the run in ELIGIBLE forever.
 *
 * `runner-lifecycle`: "Every run SHALL carry a deadline derived from its
 * profile's declared wall clock; there is no unbounded run", and "The
 * lifecycle SHALL never abandon a run in a non-terminal state." RO-INV-41
 * and RO-INV-22 restate both.
 *
 * `RunDeadline.until()` is applied to exactly two calls — `adapter.invoke`
 * and `execution.runGate` — and `RunDeadline.arm()` runs at the END of the
 * ELIGIBLE phase, after `session.start()` has returned. Every await before
 * that point is unbounded: the three authority reads, the workspace
 * provision, the session prepare, and the session start.
 *
 * The profile's declared wall clock is already captured and in hand when
 * `eligible` calls `session.prepare()` — `authority.profile.value.limits`
 * is read a few lines later to arm the timer. So this is not the
 * chicken-and-egg case of a budget that is not yet known: the budget is
 * known, and is applied only after the call that can hang.
 *
 * A `prepare()` that never settles therefore holds the run open with no
 * deadline, no interrupt consulted, and no terminal ever recorded. RO-EX-53
 * and RO-EX-54 prove the hung PROVIDER and the hung GATE; the session port
 * has the same shape and no proof.
 */
describe('a hung session port holds the run open past its declared budget', () => {
  /** A session whose prepare never settles. `start` is never reached. */
  class HangingSession implements ExecutionSessionPort {
    readonly calls: string[] = []
    prepare(): Promise<SessionPreparation> {
      this.calls.push('prepare')
      return new Promise<SessionPreparation>(() => {
        // Deliberately never settles: the orchestrator must not depend on
        // a session implementation being well behaved either.
      })
    }
    start(): Promise<SessionStart> {
      return new Promise<SessionStart>(() => {})
    }
    interrupt(): Promise<FenceOutcome> {
      return Promise.resolve({ ok: true })
    }
    close(): Promise<SessionClosure> {
      return Promise.resolve({ torn_down: true })
    }
  }

  const HUNG = 'the run never resolved'

  it('the run resolves on its own budget rather than hanging in ELIGIBLE', async () => {
    const session = new HangingSession()
    const ports = testPorts({ session })
    // A one-millisecond wall clock: a control may only SHORTEN the
    // profile's grant, so this is the shortest budget the run can have.
    const runner = new Runner(ports, { deadline_ms: 1 })

    const outcome = await Promise.race([
      runner.run(runRequest()).then((conclusion) => conclusion.state),
      new Promise<string>((resolve) => setTimeout(() => resolve(HUNG), 250)),
    ])

    expect(session.calls, 'the fixture reached the session port').toContain('prepare')
    expect(outcome, 'a run whose budget has elapsed is not still waiting on a port').not.toBe(HUNG)
  })

  it('a hung PROVIDER does resolve — the control that proves the race exists elsewhere', async () => {
    const { HangingAdapter } = await import('../testing-fixtures.js')
    const ports = testPorts({ adapter: new HangingAdapter() })
    const conclusion = await new Runner(ports, { deadline_ms: 5 }).run(runRequest())
    expect(conclusion.state).toBe('TIMED_OUT')
  })
})

/**
 * FINDING 6 — the lease's test seam is on the production surface.
 *
 * `RunLeasePort` declares `claim`, `renew`, `release`, and `claim` refuses
 * a run that is already leased — that refusal is the whole of the
 * one-owner rule (RO-INV-30). `InMemoryRunLease.steal()` is the same
 * capability with the refusal removed: it takes a `run_id`, bumps the
 * generation and seizes the run, with no claim, no generation to present
 * and no fence to satisfy.
 *
 * It is annotated "Test seam", but it is declared in production source
 * (`run-state/in-memory.ts`), exported from the package root, and emitted
 * into `dist`. This landing ships no other lease implementation, so it is
 * THE lease. A holder of the port instance can dispossess a live run
 * without ever having owned it.
 *
 * A seam is not safe because tests are its main consumer.
 */
describe('the lease exposes a dispossession capability its port does not declare', () => {
  it('a caller that never claimed can seize a live run — the premise', async () => {
    const { InMemoryRunLease } = await import('../index.js')
    const lease = new InMemoryRunLease()
    const owner = await lease.claim({ run_id: RUN })
    expect(owner.ok).toBe(true)
    if (!owner.ok) return

    // A second CLAIM is refused: that is the one-owner rule working.
    expect((await lease.claim({ run_id: RUN })).ok).toBe(false)

    // The seam is the same act with the refusal taken out.
    lease.steal(RUN)
    expect(
      await lease.renew({ run_id: RUN, generation: owner.generation }),
      'the legitimate holder was dispossessed by a caller that never claimed',
    ).toBe(false)
  })

  it('and the exported surface is exactly the port', async () => {
    const { InMemoryRunLease } = await import('../index.js')
    const declared = ['claim', 'renew', 'release']
    const exposed = Object.getOwnPropertyNames(InMemoryRunLease.prototype).filter(
      (name) => name !== 'constructor',
    )

    expect(
      exposed.sort(),
      'a method the port does not declare is authority no composition granted',
    ).toEqual(declared.sort())
  })
})
