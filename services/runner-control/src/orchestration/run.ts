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
import { isTerminal, RunMachine, walk as walkPhases } from '../lifecycle/index.js'
import { FinalizationLedger } from '../finalization/index.js'
import type { LeaseClaim, Ports } from '../ports/index.js'
import { RunScope } from '../run/scope.js'
import { RunDeadline } from './deadline.js'
import {
  ACQUISITION_BUDGET_MS,
  CLEANUP_BUDGET_MS,
  narrowingOnly,
  type RunControls,
} from './controls.js'
import { boundPorts, RunAborted, withinBudget } from './bound-ports.js'
import type { JournaledAcquisitionEntry, RunEnvironment } from './environment.js'
import { eligible } from './phases/eligible.js'
import { profileResolved } from './phases/profile-resolved.js'
import { requested } from './phases/requested.js'
import { running } from './phases/running.js'
import { sandboxStarted } from './phases/sandbox-started.js'
import { verifying } from './phases/verifying.js'
import type { RunConclusion, RunRequest, RunSignals, Stop } from './result.js'

import {
  conclude,
  concludeAborted,
  terminateEarly,
  terminateFromRejection,
  writeEarlyTerminalRecord,
} from './terminate.js'

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
    let claim: LeaseClaim
    try {
      // BOUNDED, THOUGH IT PRECEDES THE DEADLINE. The claim happens
      // before the scope the run's deadline is built from, so it had no
      // budget at all: a lease store that never answered left `run()`
      // unresolved forever, and `run()` resolving is the whole of what a
      // caller relies on to know the run is over.
      const claimed = await withinBudget(CLEANUP_BUDGET_MS, () =>
        this.#ports.lease.claim({ run_id: request.run_id }),
      )
      if (!claimed.ok) {
        return unstarted(
          request.run_id,
          'the run lease could not be claimed: the store did not answer within its budget',
        )
      }
      claim = claimed.value
    } catch (error) {
      // A lease store that throws is not a run that failed — it is a run
      // that never started. Reported as a conclusion rather than a
      // rejection, because `run()` resolving is what every caller relies
      // on to know the run is over.
      return unstarted(request.run_id, `the run lease could not be claimed: ${describe(error)}`)
    }
    if (!claim.ok) {
      return unstarted(
        request.run_id,
        `this run is owned elsewhere: ${claim.detail} (lease not acquired)`,
      )
    }
    try {
      return await this.#walkOwned(request, signals, claim.generation)
    } finally {
      // Released even on the throw path: a concluded run must not hold
      // its lease, and neither must a crashed one. A release that THROWS
      // must not replace the run's result either — the run is over, and
      // a stuck lease is a lease problem.
      try {
        // BOUNDED, THOUGH IT FOLLOWS THE DISARM. The run's timers are
        // cleared by this point, so a release that never answered held
        // `run()` open with no clock left to stop it — the same hole as
        // the claim, at the other end.
        await withinBudget(CLEANUP_BUDGET_MS, () =>
          this.#ports.lease.release({ run_id: request.run_id, generation: claim.generation }),
        )
      } catch {
        // Deliberately swallowed. See above.
      }
    }
  }

  async #walkOwned(
    request: RunRequest,
    signals: RunSignals,
    generation: number,
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
    // EVERY PORT, BOUND ONCE, before the environment exists — so there
    // is no unbound path to a port from anywhere inside a run.
    const deadline = new RunDeadline(scope, signals.interrupt)
    const bound = boundPorts(this.#ports, deadline)
    const env: RunEnvironment = {
      request,
      signals,
      ports: bound,
      scope,
      controls: this.#controls,
      ledger: new FinalizationLedger(request.run_id),
      deadline,
      journalTick: () => this.#flushJournal(scope),
      journalAcquisition: async (acquisition: JournaledAcquisitionEntry) => {
        const appended = await bound.journal.appendAcquisition({
          ...scope.fence,
          acquisition,
        })
        if (!appended.ok) scope.loseFence(appended.detail)
      },
    }

    // BOUNDED FROM THE FIRST EFFECT. The profile cannot bound the read
    // that captures it, so acquisition has its own ceiling and the
    // profile narrows it in ELIGIBLE.
    // SHORTENING ONLY. This was `??`, so a control of 120_000 DOUBLED
    // the standing 60-second ceiling — a control whose contract says it
    // "never lengthens" doing the one thing it says it cannot. Every
    // other arming site already honours that through `boundedDeadlineMs`.
    env.deadline.arm(
      Math.min(this.#controls.deadline_ms ?? ACQUISITION_BUDGET_MS, ACQUISITION_BUDGET_MS),
    )

    if (!table.ok) {
      return await this.#recover(
        env,
        `the supplied transition table widens lifecycle authority: ${table.detail}`,
      )
    }
    try {
      // THE WALK IS AWAITED, not raced.
      //
      // Racing it and abandoning the loser bounded the CALLER'S WAIT and
      // nothing else: a JavaScript continuation cannot be cancelled, so
      // the abandoned walk kept reading authority, kept emitting
      // `capability.granted` after the abort, and kept mutating the
      // conclusion already handed back. The bound lives at the PORTS now
      // — see `boundPorts` — where a call site cannot forget it and a
      // port added later inherits it. Every call the walk makes settles
      // or raises, so the walk itself is always what concludes, and the
      // walk is what writes the governed record.
      return await this.#walk(env)
    } catch (error) {
      // THE ABORT, CONCLUDED WITH WHAT THE RUN ESTABLISHED.
      //
      // Failure semantics: a termination in REQUESTED owes an
      // early-terminal refusal record; one at or after PROFILE_RESOLVED
      // owes a fully sealed bundle. The abandoning path had the scope
      // and neither an `Authority` nor `Observations`, so it wrote
      // NEITHER — and which record a run received came down to whether a
      // hung port answered inside a grace window. `scope.established` is
      // the value that decides it, and it is reachable from here.
      if (error instanceof RunAborted) return await concludeAborted(env, error.reason)
      return await this.#recover(
        env,
        `the run's terminal state could not be established: ${describe(error)}`,
      )
    }
  }

  /** The declared walk. Each phase receives only what it has earned. */
  async #walk(env: RunEnvironment): Promise<RunConclusion> {
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
    const outOfOrder = (phase: string): Promise<Stop> =>
      terminateEarly(
        env,
        'indeterminate',
        `the ${phase} phase ran before the state it requires was established`,
      )

    const outcome = await walkPhases<RunConclusion>(
      env.scope.machine,
      [
        {
          name: 'requested',
          earns: 'resolve_profile',
          run: async () => {
            const result = await requested(env)
            if (result.kind === 'earned')
              env.scope.established = { at: 'authorized', authority: result.next }
            return result
          },
        },
        {
          name: 'profile-resolved',
          earns: 'decide_eligibility',
          run: () =>
            env.scope.established.at === 'requested'
              ? outOfOrder('profile-resolved')
              : profileResolved(env, env.scope.established.authority),
        },
        {
          name: 'eligible',
          earns: 'commit_spend',
          run: () =>
            env.scope.established.at === 'requested'
              ? outOfOrder('eligible')
              : eligible(env, env.scope.established.authority),
        },
        {
          name: 'sandbox-started',
          earns: 'begin_execution',
          run: () =>
            env.scope.established.at === 'requested'
              ? outOfOrder('sandbox-started')
              : sandboxStarted(env, env.scope.established.authority),
        },
        {
          name: 'running',
          earns: 'begin_verification',
          run: async () => {
            if (env.scope.established.at === 'requested') return outOfOrder('running')
            const authority = env.scope.established.authority
            const result = await running(env, authority)
            if (result.kind === 'earned') {
              env.scope.established = { at: 'observed', authority, observations: result.next }
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
            env.scope.established.at === 'observed'
              ? verifying(env, env.scope.established.authority, env.scope.established.observations)
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

    switch (outcome.kind) {
      case 'terminated':
        return outcome.value
      case 'held': {
        // The hold is the run's PENDING IDENTITY, recorded durably with
        // the state it is held at, so something can later resume it.
        const recorded = await env.ports.journal.appendHold({
          ...env.scope.fence,
          hold: {
            state: env.scope.machine.state,
            transition: 'commit_spend',
            detail: outcome.detail,
            at: env.ports.clock.now({ run_id: env.request.run_id }),
          },
        })
        if (!recorded.ok) env.scope.loseFence(recorded.detail)
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
        return await terminateFromRejection(env, env.scope.established, outcome)
      case 'walked':
        // Unreachable: the final phase always terminates. Represented
        // rather than assumed — a walk that fell off the end without
        // terminating would otherwise be a silent success.
        return await conclude(env, 'none', 'the walk ended without a terminal commit')
    }
  }

  /**
   * Recover from a port that threw, using the run's REAL state.
   *
   * The handler advances the actual machine, flushes the actual pending
   * journal, releases what the run actually held, and picks its record
   * from whether authority was actually captured. It seals no bundle:
   * that belongs to the finalization transaction, and the exception may
   * have come from inside it.
   */
  async #recover(env: RunEnvironment, detail: string): Promise<RunConclusion> {
    const { scope, request } = env
    // OWNERSHIP IS CHECKED BEFORE THE MACHINE IS TOUCHED.
    //
    // A stale holder terminalizing is the one verdict it may not give,
    // and this reached for a terminal first and consulted the fence
    // afterwards — so a dispossessed attempt minted OPERATIONAL_FAILURE
    // locally and then reported `ownership_lost` carrying it.
    const dispossessed = scope.fenceLost !== undefined
    const reached = dispossessed
      ? { ok: false as const, detail: scope.fenceLost ?? 'ownership moved' }
      : scope.reachTerminal('indeterminate', detail)
    const reported = reached.ok ? detail : `${detail}; ${reached.detail}`

    await this.#flushJournal(scope)
    await scope.release(this.#ports)

    let produced: 'evidence_bundle' | 'early_termination_record' | 'none' = 'none'
    if (!scope.authorityCaptured && !dispossessed) {
      // The machine was terminalized above, so this WRITES rather than
      // transitioning again. Calling `terminateEarly` here asked for a
      // second terminal, which the machine refused — and the refusal
      // path concluded before the record was ever built, so a run with
      // no identities produced nothing at all.
      // Guarded: this IS the last-resort handler, and a sink that
      // throws here is exactly the fault it exists to absorb. `run()`
      // always resolving is what every caller relies on to know the run
      // is over — a rejection would end the run in no state at all.
      try {
        const early = await writeEarlyTerminalRecord(env, reported)
        produced = early.value.produced
      } catch {
        // The conclusion below still reports a terminal state.
      }
    }
    const base = {
      run_id: request.run_id,
      detail: reported,
      transitions: scope.machine.transitionRecord,
      rejections: scope.machine.rejections,
    }
    const state = scope.machine.state
    if (dispossessed) return { ...base, kind: 'ownership_lost', state, produced: 'none' }
    // A machine that granted no terminal did not reach one, and saying
    // `terminal` alongside a progress state is the lie the union exists
    // to make unrepresentable — it was being told in the very proof that
    // asserts no terminal was granted.
    if (!isTerminal(state)) return { ...base, kind: 'unterminated', state, produced: 'none' }
    return { ...base, kind: 'terminal', state, produced }
  }

  /**
   * Append everything the machine has recorded since the last tick.
   *
   * Called after every machine mutation during the walk, and again by
   * the exception handler — so a run that died mid-phase leaves the same
   * durable trail as one that concluded.
   */
  async #flushJournal(scope: RunScope): Promise<void> {
    if (scope.fenceLost !== undefined) return
    const pending = scope.machine.pendingJournal()
    let transitions = 0
    let rejections = 0
    try {
      for (const transition of pending.transitions) {
        const appended = await this.#ports.journal.appendTransition({ ...scope.fence, transition })
        // A refused append is NOT left pending: pending means "retry",
        // and a fence refusal is the one failure retrying cannot fix.
        if (!appended.ok) return scope.loseFence(appended.detail)
        transitions += 1
      }
      for (const rejection of pending.rejections) {
        const appended = await this.#ports.journal.appendRejection({ ...scope.fence, rejection })
        if (!appended.ok) return scope.loseFence(appended.detail)
        rejections += 1
      }
    } catch {
      // Swallowed on purpose: an append that fails leaves its entry
      // PENDING and the next tick retries it. Propagating would end the
      // run over a transient journal fault, and the entry would still be
      // unwritten.
    } finally {
      // Only what LANDED is confirmed, so a rejected append cannot
      // silently remove a transition from the record.
      scope.machine.confirmJournaled(transitions, rejections)
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
