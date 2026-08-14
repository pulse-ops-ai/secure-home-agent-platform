/**
 * The run engine: claim, walk, conclude.
 *
 * What this module does is now visible in one screen — build the
 * environment, declare the six phases, walk them, map the outcome. The
 * decisions live in `@secure-home/runner-core`, the mechanisms live in
 * their own directories, and the composition across mechanisms lives in
 * `phases/`.
 *
 * The typestate is threaded through two bindings rather than fifteen:
 * `authority`, established by the first phase, and `observations`,
 * established by RUNNING. A phase receives only what it has earned, so a
 * phase reading state it has not is a compile error rather than a
 * hazard the next review has to find.
 */
import { randomUUID } from 'node:crypto'
import { canConstructEvidence, RunMachine, walk as walkPhases } from '../lifecycle/index.js'
import type { PhaseCommand, RejectionEntry } from '../lifecycle/index.js'
import { FinalizationLedger } from '../finalization/index.js'
import type { FenceOutcome, LeaseClaim, Ports } from '../ports/index.js'
import { isRunControlError, isRunInterrupted } from '../run/interruption.js'
import { RunScope } from '../run/scope.js'
import type { OutboxEntry } from '../run-state/outbox.js'
import { RunDeadline, RunSettlement } from './deadline.js'
import { ACQUISITION_BUDGET_MS, narrowingOnly, type RunControls } from './controls.js'
import type { JournaledAcquisitionEntry, RunEnvironment } from './environment.js'
import { guardPorts } from './ports.js'
import { eligible } from './phases/eligible.js'
import { profileResolved } from './phases/profile-resolved.js'
import { requested } from './phases/requested.js'
import { running } from './phases/running.js'
import { sandboxStarted } from './phases/sandbox-started.js'
import { verifying } from './phases/verifying.js'
import type { RunConclusion, RunRequest, RunSignals, Stop } from './result.js'
import { recoverRun, settleInterrupt } from './settle.js'
import { noObservations, type EstablishedRun } from './state.js'

import { conclude, finish, terminateEarly } from './terminate.js'

/**
 * What the run has established, as a value nothing can misread.
 *
 * A phase narrows to the variant carrying what it needs. There is no
 * variant in which observations exist before RUNNING produced them, so
 * the empty-then-overwrite hazard is unrepresentable rather than merely
 * avoided by convention.
 */
type WalkState = EstablishedRun

/** The timestamp used when the clock itself is what failed. */
const UNESTABLISHED_INSTANT = '1970-01-01T00:00:00.000Z'

export class Runner {
  readonly #ports: Ports
  readonly #controls: RunControls

  /**
   * `controls` are composition-time proof affordances, not part of a run
   * request. They are validated as narrowings before they reach the
   * machine — see `RunControls`.
   */
  constructor(ports: Ports, controls: RunControls = {}) {
    this.#ports = ports
    this.#controls = controls
  }

  /**
   * Orchestrate one run.
   *
   * ONE OWNER, BEFORE ANYTHING ELSE. `RunMachine` gives one writer per
   * machine instance, which says nothing about two `run()` calls handed
   * the same `run_id`. The claim happens before the first effect — a run
   * we do not own must not even read authority.
   */
  async run(request: RunRequest, signals: RunSignals = {}): Promise<RunConclusion> {
    // THE BUDGET STARTS BEFORE OWNERSHIP. A lease implementation is a
    // port too, and a claim that never answers must not make `run()`
    // unbounded. The standing acquisition ceiling is the only authority
    // available before the profile is captured; the proof override may
    // shorten it and never lengthen it.
    const deadline = new RunDeadline(undefined, signals.interrupt)
    deadline.armAcquisition(
      Math.min(this.#controls.deadline_ms ?? ACQUISITION_BUDGET_MS, ACQUISITION_BUDGET_MS),
    )
    // UNIQUE PER ATTEMPT, not per run. A durable lease may answer a
    // replayed attempt id with the same successful generation — that is
    // its idempotency, and it is only safe because no two attempts ever
    // share an id. Derived from the run id alone, a retry or a competing
    // runner would present the SAME attempt and could both be granted.
    const attempt_id = `${request.run_id}:${randomUUID()}`
    let claim: LeaseClaim
    try {
      claim = await deadline.call(() =>
        this.#ports.lease.claim({
          run_id: request.run_id,
          attempt_id,
          signal: deadline.signal,
        }),
      )
    } catch (error) {
      deadline.disarm()
      // THE ATTEMPT'S OUTCOME IS UNKNOWN, so it is resolved AT THE
      // RESOURCE. The resource may have committed a generation whose
      // acknowledgement never arrived; returning `not_started` while
      // that grant stands would park the run id with no holder. Only
      // the resource knows which case this is — it is told the answer
      // is "no" either way.
      await this.#abandonClaim(request.run_id, attempt_id)
      if (isRunInterrupted(error)) {
        return unstarted(
          request.run_id,
          `the run was ${error.reason === 'cancel' ? 'cancelled' : 'timed out'} before the lease could be claimed`,
        )
      }
      // A lease store that throws is not a run that failed — it is a run
      // that never started. Reported as a conclusion rather than a
      // rejection, because `run()` resolving is what every caller relies
      // on to know the run is over.
      return unstarted(request.run_id, `the run lease could not be claimed: ${describe(error)}`)
    }
    if (!claim.ok) {
      deadline.disarm()
      return unstarted(
        request.run_id,
        `this run is owned elsewhere: ${claim.detail} (lease not acquired)`,
      )
    }
    const ports = guardPorts(this.#ports, deadline)
    try {
      return await this.#walkOwned(request, signals, claim.generation, deadline, ports)
    } finally {
      // Released even on the throw path: a concluded run must not hold
      // its lease, and neither must a crashed one. A release that THROWS
      // must not replace the run's result either — the run is over, and
      // a stuck lease is a lease problem.
      try {
        const settlement = deadline.settlement()
        try {
          await guardPorts(this.#ports, settlement).lease.release({
            run_id: request.run_id,
            generation: claim.generation,
          })
        } finally {
          settlement.disarm()
        }
      } catch {
        // Deliberately swallowed. See above.
      }
    }
  }

  /**
   * Tell the lease an attempt this caller can no longer await is over.
   *
   * Bounded by its own settlement ceiling — a lease store that cannot
   * answer must not hold `run()` open either — and best-effort by
   * construction: when even the abandon cannot be delivered, the
   * resource's own ownership expiry is the backstop (see RunLeasePort).
   */
  async #abandonClaim(run_id: string, attempt_id: string): Promise<void> {
    const settlement = new RunSettlement()
    try {
      await settlement.call(() => this.#ports.lease.abandon({ run_id, attempt_id }))
    } catch {
      // Deliberately swallowed: the conclusion below reports the run
      // that never started, and a broken abandon must not replace it.
    } finally {
      settlement.disarm()
    }
  }

  async #walkOwned(
    request: RunRequest,
    signals: RunSignals,
    generation: number,
    deadline: RunDeadline,
    ports: Ports,
  ): Promise<RunConclusion> {
    // A clock that throws is one of the ports the handler below exists
    // for, so the machine gets one that cannot.
    const safeClock = {
      now: (scoped: { run_id: string }) => {
        try {
          return this.#ports.clock.now(scoped)
        } catch {
          return UNESTABLISHED_INSTANT
        }
      },
    }
    // A table that is not a narrowing never reaches the machine. The
    // run refuses on it rather than executing under a forged lifecycle.
    const table = narrowingOnly(this.#controls.transitions)
    const scope = new RunScope(
      { run_id: request.run_id, generation },
      new RunMachine(request.run_id, safeClock, table.ok ? table.table : undefined),
      safeClock.now({ run_id: request.run_id }),
    )
    const env: RunEnvironment = {
      request,
      signals,
      ports,
      cleanupPorts: this.#ports,
      scope,
      controls: this.#controls,
      ledger: new FinalizationLedger(request.run_id),
      deadline,
      commitSignal: deadline.signal,
      journalTick: () => this.#flushJournal(scope, ports),
      journalTickThrough: (through) => this.#flushJournal(scope, through),
      journalAcquisition: async (acquisition: JournaledAcquisitionEntry) => {
        // Into the outbox, then flushed immediately — appended at the
        // moment it occurs, like every other journal fact, but a fault
        // leaves it PENDING for retry instead of killing the epoch or
        // silently dropping the fact. The flush recognises a fence
        // refusal and stops the run's writes.
        scope.outbox.record({ category: 'acquisition', acquisition })
        await this.#flushJournal(scope, ports)
      },
    }
    scope.deadline = deadline

    if (!table.ok) {
      return await recoverRun(
        env,
        `the supplied transition table widens lifecycle authority: ${table.detail}`,
        this.#ports,
        (current, through) => this.#flushJournal(current, through),
      )
    }
    try {
      return await this.#walk(env, this.#ports)
    } catch (error) {
      return await recoverRun(
        env,
        `the run's terminal state could not be established: ${describe(error)}`,
        this.#ports,
        (current, through) => this.#flushJournal(current, through),
      )
    }
  }

  /** The declared walk. Each phase receives only what it has earned. */
  async #walk(env: RunEnvironment, rawPorts: Ports): Promise<RunConclusion> {
    // WHAT THE RUN HAS ESTABLISHED, as one discriminated value.
    //
    // This was two bindings and a cast. `authority as Authority` told
    // the compiler to stop checking the very ordering the typestate
    // exists to encode — the same instruction the definite-assignment
    // assertions used to give, wearing different syntax. And
    // `observations` existed, empty, before RUNNING had produced any, so
    // deleting the assignment that fills it still compiled.
    //
    // Neither is representable now. A phase needing authority must
    // narrow to a variant that HAS authority, there is no variant
    // carrying observations before RUNNING, and the out-of-order branch
    // fails closed rather than pretending.
    let state: WalkState = { at: 'requested' }
    const outOfOrder = (phase: string): Promise<Stop> =>
      terminateEarly(
        env,
        'indeterminate',
        `the ${phase} phase ran before the state it requires was established`,
      )

    let outcome
    try {
      outcome = await walkPhases<RunConclusion>(
        env.scope.machine,
        [
          {
            name: 'requested',
            earns: 'resolve_profile',
            run: async () => {
              const result = await requested(env)
              if (result.kind === 'earned') {
                state = { at: 'authorized', authority: result.next }
                env.scope.established = state
              }
              return result
            },
          },
          {
            name: 'profile-resolved',
            earns: 'decide_eligibility',
            run: () =>
              state.at === 'requested'
                ? outOfOrder('profile-resolved')
                : profileResolved(env, state.authority),
          },
          {
            name: 'eligible',
            earns: 'commit_spend',
            run: () =>
              state.at === 'requested' ? outOfOrder('eligible') : eligible(env, state.authority),
          },
          {
            name: 'sandbox-started',
            earns: 'begin_execution',
            run: () =>
              state.at === 'requested'
                ? outOfOrder('sandbox-started')
                : sandboxStarted(env, state.authority),
          },
          {
            name: 'running',
            earns: 'begin_verification',
            run: async () => {
              if (state.at === 'requested') return outOfOrder('running')
              const authority = state.authority
              const result = await running(env, authority)
              if (result.kind === 'earned') {
                state = { at: 'observed', authority, observations: result.next }
                env.scope.established = state
              }
              return result
            },
          },
          // The last phase. Finalization is one transaction and owns both
          // terminal transitions, so `earns` names the first of the two.
          {
            name: 'verifying',
            earns: 'seal_evidence',
            run: () =>
              state.at === 'observed'
                ? verifying(env, state.authority, state.observations)
                : outOfOrder('verifying'),
          },
        ],
        {
          // The lease is checked BEFORE each phase's effects, for the same
          // reason the machine's transition is: a run that has lost
          // ownership must stop before it acts, not be told afterwards.
          beforePhase: async (phase: string) => {
            // TWO WAYS OWNERSHIP IS LOST, and this consulted only one. A
            // fence refusal — a resource telling this run it has been
            // superseded — set `fenceLost` and nothing looked at it until
            // the final commit, so a dispossessed run went on to
            // provision, spend, invoke the provider and run gates.
            if (env.scope.fenceLost !== undefined) return env.scope.fenceLost
            return (await env.ports.lease.renew({
              run_id: env.request.run_id,
              generation: env.scope.fence.generation,
            }))
              ? undefined
              : `the run lease was lost at generation ${String(env.scope.fence.generation)} before ${phase}`
          },
          afterRecord: env.journalTick,
        },
      )
    } catch (error) {
      if (isRunInterrupted(error)) {
        return await settleInterrupt(env, state, error.reason, rawPorts, (current, through) =>
          this.#flushJournal(current, through),
        )
      }
      throw error
    }

    switch (outcome.kind) {
      case 'terminated':
        return outcome.value
      case 'held': {
        // The hold is the run's PENDING IDENTITY, recorded durably with
        // the state it is held at, so something can later resume it.
        // Through the outbox: a journal fault leaves it pending — and
        // `conclude`'s ticks retry it — instead of crashing a HELD run
        // into recovery, which would seal an INDETERMINATE bundle for a
        // run that is merely waiting.
        env.scope.outbox.record({
          category: 'hold',
          hold: {
            state: env.scope.machine.state,
            transition: 'commit_spend',
            detail: outcome.detail,
            at: env.ports.clock.now({ run_id: env.request.run_id }),
          },
        })
        await env.journalTick()
        return await conclude(env, 'none', outcome.detail)
      }
      case 'lost': {
        // Ownership moved while the run was walking. It has not failed a
        // contract; it has stopped being OURS. Writing a terminal record
        // now would be exactly the second writer the lease prevents, so
        // this path writes NOTHING.
        //
        // It must still let go. Marking the fence lost makes `release`
        // disarm the wall clock — a local timer, belonging to this
        // process — while skipping the workspace and session, which
        // belong to whoever holds the run now. This was the one exit
        // that reached neither, so a stolen run left its deadline armed
        // for the rest of the profile's budget.
        env.scope.loseFence(outcome.reason)
        await env.scope.release(env.ports)
        return {
          run_id: env.request.run_id,
          // NOT a terminal. This attempt is over; the logical run is
          // not, and whoever holds it now owns its eventual terminal.
          kind: 'ownership_lost',
          state: env.scope.machine.state,
          produced: 'none',
          detail: `${outcome.reason}; the ${outcome.phase} phase did not run, and no further write was made`,
          transitions: env.scope.machine.transitionRecord,
          rejections: env.scope.machine.rejections,
        }
      }
      case 'halted':
        return await this.#terminateFromRejection(env, state, outcome)
      case 'walked':
        // Unreachable: the final phase always terminates. Represented
        // rather than assumed — a walk that fell off the end without
        // terminating would otherwise be a silent success.
        return await conclude(env, 'none', 'the walk ended without a terminal commit')
    }
  }

  /**
   * A phase earned a transition the machine REFUSED.
   *
   * The walk has stopped and no later phase ran, but the run is still in
   * a non-terminal state and the lifecycle requirement forbids
   * abandoning it there. `canConstructEvidence` chooses the shape: a run
   * past REQUESTED has the identities a bundle needs; one still in
   * REQUESTED does not.
   */
  async #terminateFromRejection(
    env: RunEnvironment,
    state: WalkState,
    halt: { readonly phase: string; readonly rejection: RejectionEntry },
  ): Promise<RunConclusion> {
    const why = `the ${halt.phase} phase earned ${halt.rejection.attempted}, which the machine refused from ${halt.rejection.state}: ${halt.rejection.detail}`
    const stopped: PhaseCommand<RunConclusion> =
      canConstructEvidence(env.scope.machine.state) && state.at !== 'requested'
        ? await finish(
            env,
            state.authority,
            state.at === 'observed' ? state.observations : noObservations(),
            'operational_fault',
            why,
            'OPERATIONAL_FAILURE',
          )
        : await terminateEarly(env, 'operational_fault', why)
    return stopped.kind === 'terminate' ? stopped.value : await conclude(env, 'none', why)
  }

  /**
   * Land everything the run has recorded since the last tick — every
   * category, through the ONE outbox.
   *
   * Called after every machine mutation during the walk, when an
   * acquisition or hold is recorded, and again by the exception handler
   * — so a run that died mid-phase leaves the same durable trail as one
   * that concluded. A fault leaves the entry at the head of the outbox
   * and the next tick retries it; only what LANDED is removed.
   */
  async #flushJournal(scope: RunScope, ports: Ports = this.#ports): Promise<void> {
    if (scope.fenceLost !== undefined) return
    scope.outbox.drainMachine(scope.machine)
    try {
      for (;;) {
        const entry = scope.outbox.head()
        if (entry === undefined) return
        const appended = await this.#append(ports, scope, entry)
        // A refused append is NOT retried: retrying cannot fix a fence
        // refusal, and a dispossessed run makes no further write. The
        // entry stays where it is, which the seal gate reads correctly —
        // this run's durable record is incomplete.
        if (!appended.ok) return scope.loseFence(appended.detail)
        scope.outbox.landed()
      }
    } catch (error) {
      if (isRunControlError(error)) throw error
      // Swallowed on purpose: an append that fails leaves its entry
      // PENDING and the next tick retries it. Propagating would end the
      // run over a transient journal fault, and the entry would still be
      // unwritten.
    }
  }

  /** One outbox entry to its journal append, by category. */
  #append(ports: Ports, scope: RunScope, entry: OutboxEntry): Promise<FenceOutcome> {
    switch (entry.category) {
      case 'transition':
        return ports.journal.appendTransition({ ...scope.fence, transition: entry.transition })
      case 'rejection':
        return ports.journal.appendRejection({ ...scope.fence, rejection: entry.rejection })
      case 'acquisition':
        return ports.journal.appendAcquisition({ ...scope.fence, acquisition: entry.acquisition })
      case 'hold':
        return ports.journal.appendHold({ ...scope.fence, hold: entry.hold })
    }
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** A run that never started: no state, no record, no walk. */
const unstarted = (run_id: string, detail: string): RunConclusion => ({
  run_id,
  kind: 'not_started',
  state: 'REQUESTED',
  produced: 'none',
  detail,
  transitions: [],
  rejections: [],
})
