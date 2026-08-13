/**
 * The framework-free composition root: one run's walk through the
 * declared machine.
 *
 * This module is wiring and sequencing. It decides NOTHING that carries
 * trust: every judgement — is this authority valid, is this run eligible,
 * what does this observation authoritatively say, may this be sealed — is
 * a call into `@secure-home/runner-core`, and the result is used as
 * returned. There is no place here that inspects a refusal and softens
 * it, recomputes a digest, or reaches a conclusion the core declined to
 * reach (design D8).
 *
 * Two shapes a run can end in, and only two:
 *
 *  - a **sealed L2 evidence bundle**, for any run that reached
 *    `PROFILE_RESOLVED` — including cancelled and timed-out ones, whose
 *    bundles carry empty observation, artifact, and gate sets, an empty
 *    set being the true record of a run that changed nothing;
 *  - an **early-terminal refusal record**, for a run that terminated in
 *    `REQUESTED` before authority completed and therefore has no
 *    identities to put in a bundle.
 *
 * A fabricated bundle is not a third shape. It is unreachable: the
 * evidence path requires captured snapshots, and a `REQUESTED` terminal
 * has none.
 */
import type { PrincipalT, ProfileRefT } from './ports/contract-types.js'
import {
  compareBaseIdentity,
  decideEligibility,
  decideMaterialization,
  isProceed,
  reconcileClaims,
  verifyEvidence,
  type AuthoritativeChangeSet,
  type AuthoritySnapshots,
  type ClaimedChange,
  type ConsumedArtifact,
  type Refusal,
} from '@secure-home/runner-core'
import {
  AcquisitionSet,
  describeEpochFailure,
  isCaptureRefusal,
  runEpoch,
  type EpochValue,
} from './acquisition/index.js'
import { decideSpendGate, type ConsentRecord } from './consent/index.js'
import { RunEventEmitter } from './events/index.js'
import { FinalizationLedger } from './finalization/index.js'
import {
  canConstructEvidence,
  RunMachine,
  walk as walkPhases,
  type LifecycleState,
  type PhaseCommand,
  type RejectionEntry,
  type TransitionEntry,
  type TransitionKind,
  type TransitionTable,
} from './lifecycle/index.js'
import { observeArtifacts, observeWorkspace } from './workspace/index.js'
import type {
  AcquisitionEpoch,
  ArtifactObservation,
  AuthorityBytes,
  EvidenceOperations,
  LeaseClaim,
  Ports,
  RunInput,
  SessionHandle,
  TerminalObservations,
  WorkspaceHandle,
} from './ports/index.js'
import type { GateResultsT } from '@secure-home/contracts'
import { buildPlan, DispositionRecorder, toDisposition } from './scheduling/index.js'
import {
  assembleEvidence,
  buildEarlyTerminationRecord,
  executionPrincipal,
} from './finalization/records.js'

export interface RunRequest {
  readonly run_id: string
  /**
   * The principal that asked for this run. MANDATORY: attribution is not
   * partial execution authority, so it is recorded even on a run that
   * terminated before any authority was established (RO-INV-09).
   */
  readonly requester: PrincipalT
  /** `null` is a request naming no profile — a refusal, never a default. */
  readonly profile_ref: ProfileRefT | null
  /**
   * The workload. The canonical runner model says a run request carries
   * a profile reference, an actor, and INPUTS; there was no input at
   * all, which made every run a request to do nothing in particular.
   */
  readonly input: RunInput
  readonly gates: readonly string[]
  readonly workspace_root: string
  /**
   * The base identity the workspace is pinned to. Compared against the
   * observed base BEFORE the adapter runs; a mismatch refuses.
   */
  readonly pinned_base: string
  readonly artifact_paths: readonly string[]
  readonly claimed_changes?: readonly ClaimedChange[]
  readonly consent?: ConsentRecord
}

/** Cancellation and timeout arrive as declared signals, not exceptions. */
export interface RunSignals {
  /** Consulted before each declared transition; the run terminates on it. */
  readonly interrupt?: () => 'cancel' | 'timeout' | undefined
  /**
   * The transition table this run is governed by. Defaults to the
   * declared one; overridable so a proof can NARROW the table and
   * observe that the effects downstream of a removed transition stop
   * happening — which is what makes "the walk is driven by the table" a
   * claim that can fail.
   */
  readonly transitions?: TransitionTable
  /**
   * Milliseconds before the run's deadline fires. Defaults to the
   * profile's declared wall clock. Overridable so a proof can make a
   * hung call time out in milliseconds rather than minutes.
   */
  readonly deadline_ms?: number
  /** Raise cancellation after this many milliseconds, mid-flight. */
  readonly cancelAfterMs?: number
}

/** What a terminal carries forward from the parts of the run that ran. */
interface FinishPartial {
  readonly gate_results?: GateResultsT
  readonly observed?: AuthoritativeChangeSet
  readonly artifacts?: ArtifactObservation
  readonly operations?: EvidenceOperations
  readonly verification?: readonly ConsumedArtifact[]
}

/** A phase command that ends the run with a finished conclusion. */
type Stop = { readonly kind: 'terminate'; readonly value: RunConclusion }

const stop = (value: RunConclusion): Stop => ({ kind: 'terminate', value })

export interface RunConclusion {
  readonly run_id: string
  readonly state: LifecycleState
  readonly produced: 'evidence_bundle' | 'early_termination_record' | 'none'
  readonly detail: string
  /** The full declared walk — durable, and returned to the caller (D9). */
  readonly transitions: readonly TransitionEntry[]
  readonly rejections: readonly RejectionEntry[]
}

export class Runner {
  readonly #ports: Ports

  constructor(ports: Ports) {
    this.#ports = ports
  }

  /**
   * Orchestrate one run.
   *
   * This wrapper exists because a port is an interface someone else
   * implements, and an implementation that THROWS is not a case the
   * lifecycle can otherwise see: `run()` would reject and the run would
   * end in no state at all, which the lifecycle requirement forbids
   * outright ("never abandon a run in a non-terminal state"). An escaped
   * exception is a run whose outcome could not be established, which is
   * exactly what INDETERMINATE means — and INDETERMINATE classifies as a
   * failure everywhere, so this cannot launder a fault into a success.
   */
  async run(request: RunRequest, signals: RunSignals = {}): Promise<RunConclusion> {
    // ONE OWNER, BEFORE ANYTHING ELSE.
    //
    // `RunMachine` gives one writer per machine instance, which says
    // nothing about two `run()` calls handed the same `run_id`: two
    // instances, two machines, both believing they own the run, both
    // writing through the shared keyed sinks that cross-run isolation
    // legitimately permits. The claim happens before the first effect —
    // a run we do not own must not even read authority.
    let claim: LeaseClaim
    try {
      claim = await this.#ports.lease.claim({ run_id: request.run_id })
    } catch (error) {
      // A lease store that throws is not a run that failed — it is a run
      // that never started. Reported as a conclusion rather than a
      // rejection, because `run()` resolving is what every caller relies
      // on to know the run is over.
      return {
        run_id: request.run_id,
        state: 'REQUESTED',
        produced: 'none',
        detail: `the run lease could not be claimed: ${error instanceof Error ? error.message : String(error)}`,
        transitions: [],
        rejections: [],
      }
    }
    if (!claim.ok) {
      return {
        run_id: request.run_id,
        state: 'REQUESTED',
        produced: 'none',
        detail: `this run is owned elsewhere: ${claim.detail} (lease not acquired)`,
        transitions: [],
        rejections: [],
      }
    }
    try {
      return await this.#walkOwned(request, signals, claim.generation)
    } finally {
      // Released even on the throw path: a concluded run must not hold
      // its lease, and neither must a crashed one — otherwise a fault
      // makes the run unrecoverable rather than merely failed.
      //
      // And a release that THROWS must not replace the run's result. The
      // run is over either way; a stuck lease is a lease problem, not a
      // reason to lose the conclusion that was already reached.
      try {
        await this.#ports.lease.release({ run_id: request.run_id, generation: claim.generation })
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
    // The open session is tracked HERE rather than only inside the walk,
    // so a session method that throws — `start`, `interrupt` — cannot
    // carry the reference out of scope with it. A prepared session that
    // nobody can close is a leak, and the throw path is exactly where
    // leaks happen.
    const open: { handle: { session_ref: string } | undefined } = { handle: undefined }
    try {
      return await this.#walk(request, signals, generation, open)
    } catch (error) {
      const detail = `the run's terminal state could not be established: ${
        error instanceof Error ? error.message : String(error)
      }`
      if (open.handle !== undefined) {
        const leaked = open.handle
        open.handle = undefined
        try {
          await this.#ports.session.close({
            run_id: request.run_id,
            session_ref: leaked.session_ref,
          })
        } catch {
          // The session port is what failed. Reported through the
          // conclusion rather than by failing to conclude.
        }
      }
      // A clock that throws is one of the ports this catch exists for,
      // so the fallback must not call it again.
      const safeClock = {
        now: (scoped: { run_id: string }) => {
          try {
            return this.#ports.clock.now(scoped)
          } catch {
            return UNESTABLISHED_INSTANT
          }
        },
      }
      const machine = new RunMachine(request.run_id, safeClock)
      machine.advance('indeterminate', detail)
      const record = buildEarlyTerminationRecord({
        run_id: request.run_id,
        requester: request.requester,
        requested_profile: request.profile_ref,
        state: machine.state,
        detail,
        started_at: safeClock.now({ run_id: request.run_id }),
        finished_at: safeClock.now({ run_id: request.run_id }),
      })
      if (record.ok) {
        try {
          await this.#ports.evidence.write({
            run_id: request.run_id,
            kind: 'early_termination_record',
            record: record.record,
          })
        } catch {
          // The sink is the thing that failed. The conclusion below
          // still reports a terminal state rather than rejecting.
        }
      }
      return {
        run_id: request.run_id,
        state: machine.state,
        produced: record.ok ? 'early_termination_record' : 'none',
        detail,
        transitions: machine.transitionRecord,
        rejections: machine.rejections,
      }
    }
  }

  async #walk(
    request: RunRequest,
    signals: RunSignals,
    generation: number,
    open: { handle: { session_ref: string } | undefined },
  ): Promise<RunConclusion> {
    const machine = new RunMachine(request.run_id, this.#ports.clock, signals.transitions)
    const ledger = new FinalizationLedger(request.run_id)
    const startedAt = this.#ports.clock.now({ run_id: request.run_id })

    /**
     * Append everything the machine has recorded since the last tick.
     *
     * Called after every machine mutation, so the journal is written AS
     * THE WALK HAPPENS rather than assembled and flushed at the end. A
     * run that dies at RUNNING leaves behind what actually occurred; a
     * batched write would leave nothing.
     */
    const journalTick = async (): Promise<void> => {
      const pending = machine.pendingJournal()
      let transitions = 0
      let rejections = 0
      try {
        for (const transition of pending.transitions) {
          await this.#ports.journal.appendTransition({ run_id: request.run_id, transition })
          transitions += 1
        }
        for (const rejection of pending.rejections) {
          await this.#ports.journal.appendRejection({ run_id: request.run_id, rejection })
          rejections += 1
        }
      } catch {
        // Swallowed on purpose: an append that fails leaves its entry
        // PENDING, and the next tick retries it. Propagating would end
        // the run over a transient journal fault, and — worse — the
        // entry would still be unwritten. `conclude` reports anything
        // still pending at the end, so a permanently failing journal is
        // visible rather than silent.
      } finally {
        // Only what LANDED is confirmed. Anything after the failure
        // stays pending and is retried at the next tick, so a rejected
        // append cannot silently remove a transition from the record.
        machine.confirmJournaled(transitions, rejections)
      }
    }

    /**
     * Conclude the run: persist the transition record, then report.
     *
     * Every exit from `run()` goes through here, so the durable walk is
     * written on the refusal and hold paths too — those are precisely
     * the runs whose walk someone will want to reconstruct.
     */
    const conclude = async (
      produced: RunConclusion['produced'],
      detail: string,
    ): Promise<RunConclusion> => {
      // NOTE: nothing is written to the evidence sink here.
      //
      // A transition record written after the seal made the seal not the
      // run's last write — and the proof could not see it, because the
      // helper that gathered "the run's writes" filtered that kind out.
      // The journal is the durable transition record now, so there is
      // nothing left for this to duplicate.
      await journalTick()
      // One more attempt for anything a failed append left pending, so
      // the durable record is as complete as the journal allowed.
      await journalTick()
      disarm()
      if (workspace !== undefined) {
        const discarding = workspace
        workspace = undefined
        try {
          await this.#ports.workspace.discard({
            run_id: request.run_id,
            workspace_ref: discarding.workspace_ref,
          })
        } catch {
          // Reported by the implementation; not a reason to fail a run
          // that has already concluded.
        }
      }
      if (session !== undefined) {
        const closing = session
        session = undefined
        open.handle = undefined
        try {
          await this.#ports.session.close({
            run_id: request.run_id,
            session_ref: closing.session_ref,
          })
        } catch {
          // A session that will not close is reported by L9's
          // implementation, not by failing an already-concluded run.
        }
      }
      return {
        run_id: request.run_id,
        state: machine.state,
        produced,
        detail,
        transitions: machine.transitionRecord,
        rejections: machine.rejections,
      }
    }

    /**
     * Terminate before authority completed: the early-terminal record,
     * never a bundle. The requester is carried through verbatim from the
     * request — never derived from a captured profile, which a run that
     * got this far may nonetheless have (RO-INV-09).
     */
    const terminateEarly = async (
      kind: Extract<
        TransitionKind,
        'refuse' | 'operational_fault' | 'cancel' | 'timeout' | 'indeterminate'
      >,
      detail: string,
    ): Promise<Stop> => {
      // Checked, like every other transition. A narrowed table can
      // reject a terminal too, and writing an early-terminal record for
      // a refusal the machine did not authorize would record a fact
      // that did not happen.
      if (machine.advance(kind, detail).kind === 'rejected') {
        return stop(await conclude('none', `the machine refused the ${kind} terminal: ${detail}`))
      }
      const record = buildEarlyTerminationRecord({
        run_id: request.run_id,
        requester: request.requester,
        requested_profile: request.profile_ref,
        state: machine.state,
        detail,
        started_at: startedAt,
        finished_at: this.#ports.clock.now({ run_id: request.run_id }),
      })
      if (!record.ok) return stop(await conclude('none', record.detail))
      await this.#ports.evidence.write({
        run_id: request.run_id,
        kind: 'early_termination_record',
        record: record.record,
      })
      return stop(await conclude('early_termination_record', detail))
    }

    // The bindings the first phase establishes. Declared here so the
    // shared terminators can close over them: they are only ever READ
    // after the phase that sets them earned its transition, which the
    // engine guarantees by refusing to run a later phase otherwise.
    let snapshots: AuthoritySnapshots = {}
    let profile!: NonNullable<AuthoritySnapshots['profile']> & { ok: true }
    let principal!: PrincipalT
    let adapter = '(unresolved)'
    let emitter!: RunEventEmitter
    // Every emission is registered with the ledger, so "the seal is the
    // final write" is a claim about the writes that actually happened.
    const emit = async (body: Record<string, unknown>) => {
      ledger.open('event', String(body['event_type']))
      const outcome = await emitter.emit(body)
      ledger.close()
      return outcome
    }
    /** Set by the consent phase so a hold can report which kind it was. */
    let held: string | undefined
    /** The open execution session, once one exists. */
    let session: SessionHandle | undefined
    /** The isolated workspace, once provisioned. */
    let workspace: WorkspaceHandle | undefined
    // Accumulated while RUNNING, read while VERIFYING and at every
    // terminal: the run's observations so far.
    let recorder = new DispositionRecorder([])
    let observed: AuthoritativeChangeSet = { changes: [] }
    let artifacts: Awaited<ReturnType<typeof observeArtifacts>> = { ok: true, artifacts: [] }
    let operations: EvidenceOperations = emptyOperations()

    const requested = async (): Promise<PhaseCommand<RunConclusion>> => {
      if (request.profile_ref === null) {
        // Consent is deliberately not consulted: the refusal names the
        // missing profile, because that is what is actually wrong.
        return terminateEarly('refuse', 'the run request names no execution profile')
      }

      const production = new AcquisitionSet(request.run_id, 'production', this.#ports.authority, [
        'profile',
        'path_policy',
        'gate_registry',
      ])
      const acquired = await runEpoch(
        production,
        ['profile', 'path_policy', 'gate_registry'],
        (acquisition) =>
          this.#ports.journal.appendAcquisition({ run_id: request.run_id, acquisition }),
      )
      if (!acquired.ok) {
        return terminateEarly(
          isCaptureRefusal(acquired.failure) ? 'refuse' : 'operational_fault',
          describeEpochFailure(acquired.failure),
        )
      }
      snapshots = acquired.snapshots
      const resolved = snapshots.profile
      if (resolved === undefined || !resolved.ok) {
        return terminateEarly(
          'refuse',
          resolved === undefined
            ? 'the execution profile did not resolve'
            : `the execution profile did not resolve: ${resolved.refusal.detail}`,
        )
      }

      // The captured profile must be the profile that was ASKED FOR.
      // Without this, the configured source could return any valid
      // profile and the run would execute under it — a request for a
      // narrow profile silently running with a broader grant. Capture
      // proves the bytes are a valid profile; it cannot know which one was
      // requested, so the binding has to be checked here, before
      // PROFILE_RESOLVED and long before spend.
      profile = resolved
      const captured = profile.value.identity
      if (
        captured.name !== request.profile_ref.name ||
        captured.version !== request.profile_ref.version
      ) {
        return terminateEarly(
          'refuse',
          `the acquired profile is ${captured.name}@${captured.version} but the request named ${request.profile_ref.name}@${request.profile_ref.version}; a run never executes under a profile it did not request`,
        )
      }

      const executing = executionPrincipal(
        profile.value.principal.sub,
        profile.value.principal.actor_required,
        request.requester,
      )
      if (!executing.ok) return terminateEarly('refuse', executing.detail)
      principal = executing.principal

      adapter = profile.value.runtime.adapter
      // Every emission is registered with the ledger, so "the seal is the
      // final write" is a claim about the writes that actually happened.
      // Without this the ledger's sequence was empty and seal-last held
      // vacuously — true, and worth nothing.
      emitter = new RunEventEmitter(
        { run_id: request.run_id, adapter },
        this.#ports.events,
        this.#ports.clock,
      )
      return { kind: 'earned', cause: `profile ${captured.name}@${captured.version} resolved` }
    }

    // Beyond this point every terminal can construct a full bundle.
    const finish = async (
      kind: TransitionKind,
      detail: string,
      terminal: LifecycleState,
      partial: FinishPartial = {},
    ): Promise<PhaseCommand<RunConclusion>> => {
      // ORDER MATTERS HERE, twice over.
      //
      // The terminal transition is taken LAST, after the bundle is
      // assembled and sealed. Advancing first would let assembly or a
      // sink fault leave the run reporting COMPLETED with nothing
      // sealed — a run classified successful while its evidence is
      // unsealed, which the execution-boundary requirement forbids
      // outright. A failure before the seal terminates the run
      // OPERATIONAL_FAILURE instead, which is the fail-closed reading.
      //
      // And `run.terminated` is emitted BEFORE the seal, not after.
      // Seal-last means last among this run's writes; an event written
      // after the seal makes the seal not-last and leaves a failed
      // terminal emission permanently absent from an already-sealed
      // record.
      const assembled = assembleEvidence({
        snapshots,
        run_id: request.run_id,
        principal,
        adapter,
        terminal,
        detail,
        gate_results: partial.gate_results ?? {},
        operations: partial.operations ?? emptyOperations(),
        observed: partial.observed ?? { changes: [] },
        artifacts: partial.artifacts ?? { ok: true, artifacts: [] },
        reconciliation: reconcileClaims(
          partial.observed ?? { changes: [] },
          request.claimed_changes ?? [],
        ),
        started_at: startedAt,
        finished_at: this.#ports.clock.now({ run_id: request.run_id }),
      })
      // ---- PREPARE ------------------------------------------------
      // Nothing below writes until every part of the finalization is in
      // hand and the machine has authorized the whole terminal
      // sequence. The point of preparing first is that a refusal here
      // costs nothing: no event was announced, no bundle was written,
      // and the run terminates on what actually happened.
      const failClosed = async (
        why: string,
        as: TransitionKind = 'operational_fault',
      ): Promise<Stop> => {
        machine.advance(as, why)
        return stop(await conclude('none', why))
      }
      if (!assembled.ok) {
        // A contract refusal terminates REFUSED; only an environmental
        // fault terminates OPERATIONAL_FAILURE. Mapping both to the
        // latter would relabel a policy decision as an infrastructure
        // problem in the run's own record.
        return await failClosed(
          assembled.detail,
          assembled.failure === 'refusal' ? 'refuse' : 'operational_fault',
        )
      }

      // The full terminal sequence, projected but NOT applied. A run
      // that completes takes two transitions, and both must be declared
      // before either is committed: sealing the bundle and only then
      // discovering `complete` is undeclared would leave a sealed run
      // that cannot be completed.
      const sequence =
        kind === 'complete'
          ? ([
              { kind: 'seal_evidence' as const, cause: 'evidence sealed' },
              { kind: 'complete' as const, cause: detail },
            ] as const)
          : ([{ kind, cause: detail }] as const)
      const projected = machine.project([...sequence])
      if (!projected.ok) {
        return await failClosed(
          `the machine declares no ${projected.kind} transition from ${projected.from}; nothing is committed`,
        )
      }

      // Seal ELIGIBILITY and seal ORDER, both decided before the commit.
      // The ledger performs no write now: it answers whether this run's
      // other writes are all in, and asks the core whether the bundle
      // may be sealed at all.
      const eligible = ledger.prepareSeal({
        bundle: assembled.bundle,
        outcome: assembled.outcome,
      })
      if (!eligible.ok) return await failClosed(`${eligible.refused}: ${eligible.detail}`)

      // ---- COMMIT -------------------------------------------------
      // One transition. The journal tail, the terminal event, and the
      // sealed bundle land together or not at all — so the event can
      // never announce an outcome the run did not reach.
      const committed = await this.#ports.finalization.commit({
        run_id: request.run_id,
        terminal,
        transitions: projected.entries,
        event: emitter.envelope({ event_type: 'run.terminated', outcome: assembled.outcome }),
        bundle: eligible.bundle,
      })
      if (!committed.ok) return await failClosed(committed.detail)
      ledger.markSealed()

      // ---- REFLECT ------------------------------------------------
      // The machine adopts the entries that were COMMITTED, verbatim.
      machine.commitProjected(projected.entries)
      return stop(await conclude('evidence_bundle', detail))
    }

    /**
     * A phase earned a transition the machine REFUSED.
     *
     * This is the case the engine exists to make representable. The walk
     * has stopped — no later phase ran — but the run is still sitting in
     * a non-terminal state, and the lifecycle requirement forbids
     * abandoning it there. So it terminates, fail-closed, and the
     * rejection it terminates on is already in the record.
     *
     * `canConstructEvidence` chooses the shape: a run past REQUESTED has
     * the authority identities a bundle needs; one still in REQUESTED
     * does not, and gets the early-terminal record instead.
     */
    const terminateFromRejection = async (halt: {
      readonly phase: string
      readonly rejection: RejectionEntry
    }): Promise<RunConclusion> => {
      const why = `the ${halt.phase} phase earned ${halt.rejection.attempted}, which the machine refused from ${halt.rejection.state}: ${halt.rejection.detail}`
      const stopped = canConstructEvidence(machine.state)
        ? await finish('operational_fault', why, 'OPERATIONAL_FAILURE')
        : await terminateEarly('operational_fault', why)
      return stopped.kind === 'terminate' ? stopped.value : await conclude('none', why)
    }

    /**
     * CANCELLATION THAT CAN REACH WORK IN FLIGHT.
     *
     * Polling between phases cannot interrupt a hung `invoke()` or
     * `runGate()` — the two calls most likely to hang. So the run owns an
     * abort signal, hands it to those calls, AND races them against it.
     * Handing it over lets an implementation stop immediately; racing it
     * means an implementation that ignores the signal still cannot hold
     * the run open. Effective, rather than advisory.
     */
    const aborter = new AbortController()
    let abortReason: 'cancel' | 'timeout' | undefined
    const timers: ReturnType<typeof setTimeout>[] = []
    const raise = (reason: 'cancel' | 'timeout'): void => {
      if (abortReason !== undefined) return
      abortReason = reason
      aborter.abort()
    }
    const disarm = (): void => {
      for (const timer of timers) clearTimeout(timer)
      timers.length = 0
    }

    /**
     * Await `work`, or give up when the run is aborted.
     *
     * Returns `undefined` on abort. The abandoned call may still be
     * running — which is exactly why the session is INTERRUPTED rather
     * than merely abandoned: stopping it is the session's job, and
     * proving the stop worked is L9's.
     */
    const untilAborted = async <T>(work: Promise<T>): Promise<T | undefined> => {
      if (aborter.signal.aborted) return undefined
      return await Promise.race([
        work,
        new Promise<undefined>((resolve) => {
          aborter.signal.addEventListener('abort', () => {
            resolve(undefined)
          })
        }),
      ])
    }

    /**
     * Terminate a run whose in-flight work was abandoned.
     *
     * The session is INTERRUPTED first. Abandoning the call would leave
     * whatever it started still running, which is the difference between
     * cancellation that is effective and cancellation that is a note in
     * a log. Proving the interrupt actually stops things is L9's; giving
     * it something to prove is this landing's.
     */
    const abortRun = async (partial: FinishPartial = {}): Promise<PhaseCommand<RunConclusion>> => {
      const reason = abortReason ?? 'cancel'
      if (session !== undefined) {
        try {
          await this.#ports.session.interrupt({
            run_id: request.run_id,
            session_ref: session.session_ref,
            reason,
          })
        } catch {
          // An interrupt that throws is reported by the session's own
          // implementation. It must not stop the run from terminating,
          // or a broken teardown would also cost us the record of it.
        }
      }
      return finish(
        reason,
        `the run was ${reason === 'cancel' ? 'cancelled' : 'timed out'} while work was in flight`,
        reason === 'cancel' ? 'CANCELLED' : 'TIMED_OUT',
        partial,
      )
    }

    const interrupted = (): 'cancel' | 'timeout' | undefined => abortReason ?? signals.interrupt?.()

    const interruptTerminal = { cancel: 'CANCELLED', timeout: 'TIMED_OUT' } as const

    const profileResolved = async (): Promise<PhaseCommand<RunConclusion>> => {
      {
        const signal = interrupted()
        if (signal !== undefined) {
          return finish(signal, `run ${signal}led before eligibility`, interruptTerminal[signal])
        }
      }

      const eligibility = decideEligibility(snapshots, request.gates)
      if (!isProceed(eligibility)) {
        return finish('refuse', describeRefusal(eligibility), 'REFUSED')
      }
      return { kind: 'earned', cause: 'the core decided the run eligible' }
    }

    const eligible = (): Promise<PhaseCommand<RunConclusion>> => {
      const spend = decideSpendGate(request.run_id, request.consent)
      if (!spend.ok) {
        // HELD, not refused, and not abandoned. The engine records the
        // hold against this phase's transition and stops the walk, so the
        // machine stays at ELIGIBLE and nothing downstream runs.
        held = `${spend.held}: ${spend.detail}`
        return Promise.resolve({ kind: 'hold', detail: spend.detail })
      }
      return openSession()
    }

    /**
     * Opening the session IS the spend.
     *
     * `commit_spend` is the transition into `SANDBOX_STARTED`, and that
     * state means a sandbox has started. Earning it by consent alone
     * asserted the fact; earning it by actually opening the session
     * causes it. A session that will not open therefore never reaches
     * the state, which is what makes the state mean something.
     */
    const openSession = async (): Promise<PhaseCommand<RunConclusion>> => {
      // THE ISOLATED WRITABLE WORKSPACE, before anything can write.
      //
      // A run writes into a workspace that is not the source of truth,
      // and what it did there leaves only through a materialization
      // decision. Provisioning after execution would make the isolation
      // decorative.
      const provisioned = await this.#ports.workspace.provision({
        run_id: request.run_id,
        source_ref: request.workspace_root,
      })
      if (!provisioned.ok) {
        return finish(
          'operational_fault',
          `the isolated workspace could not be provisioned: ${provisioned.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }
      workspace = provisioned.handle

      const prepared = await this.#ports.session.prepare({
        run_id: request.run_id,
        profile: { ...profile.value.identity, digest: profile.digest },
        limits: profile.value.limits,
      })
      if (!prepared.ok) {
        return finish(
          'operational_fault',
          `the execution session could not be prepared: ${prepared.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }
      session = prepared.handle
      open.handle = session
      const sessionStarted = await this.#ports.session.start({
        run_id: request.run_id,
        session_ref: session.session_ref,
      })
      if (!sessionStarted.ok) {
        return finish(
          'operational_fault',
          `the execution session could not be started: ${sessionStarted.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }

      // Arm the deadline from the session's own budget. A run with no
      // deadline is the unbounded run the model forbids.
      const deadlineMs = signals.deadline_ms ?? session.deadline.wall_clock_seconds * 1000
      timers.push(
        setTimeout(() => {
          raise('timeout')
        }, deadlineMs),
      )
      if (signals.cancelAfterMs !== undefined) {
        timers.push(
          setTimeout(() => {
            raise('cancel')
          }, signals.cancelAfterMs),
        )
      }

      return {
        kind: 'earned',
        cause: `session ${session.session_ref} started; consent recorded by ${request.consent?.by ?? 'unknown'}`,
      }
    }

    const sandboxStarted = async (): Promise<PhaseCommand<RunConclusion>> => {
      // The digest-bound identity, not the pre-resolution reference: the
      // event records WHICH profile bytes governed, which is the whole
      // point of emitting it.
      const started = await emit({
        event_type: 'run.started',
        profile: { ...profile.value.identity, digest: profile.digest },
      })
      if (!started.ok)
        return finish('operational_fault', emissionFailure(started), 'OPERATIONAL_FAILURE')
      const granted = await emit({
        event_type: 'capability.granted',
        grant: profile.value.capability,
      })
      if (!granted.ok)
        return finish('operational_fault', emissionFailure(granted), 'OPERATIONAL_FAILURE')

      {
        const signal = interrupted()
        if (signal !== undefined) {
          return finish(signal, `run ${signal}led after spend`, interruptTerminal[signal])
        }
      }
      // BASE IDENTITY, ASSERTED BEFORE ANY PROVIDER INVOCATION.
      //
      // This is an ordering property, and the order is the whole point:
      // observing a substituted workspace after the model has already run
      // cannot un-run it. The comparison itself belongs to the core; what
      // belongs here is doing it at the right moment — before the adapter,
      // before spend has any effect the outside world can see.
      const base = await this.#ports.observer.observeBase({
        run_id: request.run_id,
        root: request.workspace_root,
      })
      if (!base.ok) {
        return finish(
          'operational_fault',
          `the workspace base identity could not be observed: ${base.failure}`,
          'OPERATIONAL_FAILURE',
        )
      }
      const baseMatch = compareBaseIdentity(request.pinned_base, base.digest)
      if (!isProceed(baseMatch)) {
        return finish('refuse', describeRefusal(baseMatch), 'REFUSED')
      }

      return { kind: 'earned', cause: 'the workspace base matches; execution may begin' }
    }

    const running = async (): Promise<PhaseCommand<RunConclusion>> => {
      const adapterStarted = await emit({ event_type: 'adapter.started' })
      if (!adapterStarted.ok) {
        return finish('operational_fault', emissionFailure(adapterStarted), 'OPERATIONAL_FAILURE')
      }
      const invocation = await untilAborted(
        this.#ports.adapter.invoke({
          run_id: request.run_id,
          adapter,
          profile: { ...profile.value.identity, digest: profile.digest },
          input: request.input,
          grant: profile.value.capability,
          routing: profile.value.execution,
          limits: profile.value.limits,
          // References only — the profile's declared names, never values.
          credentials: profile.value.capability.credentials.map((credential) => ({
            env_var: credential.env_var,
          })),
          workspace: {
            session_ref: session?.session_ref ?? `session:${request.run_id}`,
            root_ref: `workspace:${request.run_id}`,
          },
          signal: aborter.signal,
        }),
      )
      if (invocation === undefined) return await abortRun({ operations })
      if (invocation.outcome === 'environmental_fault') {
        return finish(
          'operational_fault',
          `adapter invocation faulted: ${invocation.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }
      const observation = invocation.observation

      // THE LIFECYCLE DECIDES, from observations that may disagree.
      //
      // The adapter cannot say the run succeeded — its shape has no way
      // to — so the classification happens here. Where the observations
      // conflict, as they did at exit 124 versus exitCode 0, the run's
      // terminal state cannot be established, and that is INDETERMINATE:
      // a failure class, never a quiet success (ADR-0013 decision 3).
      const disagreement = describeTerminalDisagreement(observation.terminal)
      if (disagreement !== undefined) {
        return finish('indeterminate', disagreement, 'INDETERMINATE', { operations })
      }
      // Every call the adapter reports becomes BOTH an event pair and an
      // evidence operation. Discarding them would mean a permitted or
      // denied action left no trace anywhere — the exact question the
      // evidence bundle exists to answer ("what was this allowed to do,
      // and what did it do?") would have no answer.
      operations = emptyOperations()
      for (const [index, call] of observation.calls.entries()) {
        const call_id = `call-${String(index + 1).padStart(4, '0')}`
        const operation = { call_id, operation: { name: call.tool } }
        const attempted = await emit({
          event_type: 'call.attempted',
          call_id,
          operation: { name: call.tool },
        })
        if (!attempted.ok) {
          return finish('operational_fault', emissionFailure(attempted), 'OPERATIONAL_FAILURE', {
            operations,
          })
        }
        const disposed = await emit({
          event_type: 'call.disposition',
          call_id,
          disposition: call.disposition,
        })
        if (!disposed.ok) {
          // The attempt is already known and already emitted; dropping it
          // here would make the failure erase what it interrupted.
          operations.attempted.push(operation)
          return finish('operational_fault', emissionFailure(disposed), 'OPERATIONAL_FAILURE', {
            operations,
          })
        }
        operations.attempted.push(operation)
        operations[call.disposition].push(operation)
      }

      const adapterCompleted = await emit({ event_type: 'adapter.completed' })
      if (!adapterCompleted.ok) {
        return finish(
          'operational_fault',
          emissionFailure(adapterCompleted),
          'OPERATIONAL_FAILURE',
          {
            operations,
          },
        )
      }

      const registry = snapshots.gate_registry
      if (registry === undefined || !registry.ok) {
        return finish(
          'operational_fault',
          'the gate registry snapshot is unavailable at scheduling',
          'OPERATIONAL_FAILURE',
        )
      }
      const plan = buildPlan(registry.value, request.gates)
      if (!plan.ok) {
        return finish(
          'refuse',
          `unknown gate identities: ${plan.unknown_gates.join(', ')}`,
          'REFUSED',
        )
      }
      recorder = new DispositionRecorder(plan.plan.map((entry) => entry.gate_id))
      for (const entry of plan.plan) {
        const report = await untilAborted(
          this.#ports.execution.runGate({
            run_id: request.run_id,
            gate_id: entry.gate_id,
            spec: entry.spec,
            session_ref: session?.session_ref ?? `session:${request.run_id}`,
            signal: aborter.signal,
          }),
        )
        if (report === undefined) {
          return await abortRun({ gate_results: recorder.results(), operations })
        }
        const disposition = toDisposition(report)
        if (disposition === undefined) {
          return finish(
            'operational_fault',
            `gate ${entry.gate_id} could not be run: ${report.outcome === 'environmental_fault' ? report.detail : 'environmental fault'}`,
            'OPERATIONAL_FAILURE',
            { gate_results: recorder.results(), operations },
          )
        }
        const recorded = recorder.record(entry.gate_id, disposition)
        if (!recorded.ok) {
          return finish('operational_fault', recorded.error.detail, 'OPERATIONAL_FAILURE', {
            gate_results: recorder.results(),
          })
        }
      }

      const workspace = await observeWorkspace(this.#ports.observer, {
        run_id: request.run_id,
        root: request.workspace_root,
      })
      if (!isProceed(workspace)) {
        // A workspace we could not READ is operational; a workspace whose
        // contents the core refused is a contract refusal. Keeping them
        // apart here is the same INV-003 distinction the evidence
        // boundary keeps.
        const operational = workspace.kind === 'operational_failure'
        return finish(
          operational ? 'operational_fault' : 'refuse',
          operational ? workspace.detail : describeRefusal(workspace),
          operational ? 'OPERATIONAL_FAILURE' : 'REFUSED',
          { gate_results: recorder.results(), operations },
        )
      }
      observed = workspace.value
      artifacts = await observeArtifacts(this.#ports.artifacts, {
        run_id: request.run_id,
        paths: request.artifact_paths,
      })

      {
        const signal = interrupted()
        if (signal !== undefined) {
          return finish(signal, `run ${signal}led during execution`, interruptTerminal[signal], {
            gate_results: recorder.results(),
            observed,
            artifacts,
            operations,
          })
        }
      }
      return { kind: 'earned', cause: 'independent verification begins' }
    }

    const verifying = async (): Promise<PhaseCommand<RunConclusion>> => {
      const verificationSet = new AcquisitionSet(
        request.run_id,
        'verification',
        this.#ports.authority,
        ['profile', 'path_policy', 'gate_registry'],
      )
      const duringVerification = {
        gate_results: recorder.results(),
        observed,
        artifacts,
        operations,
      }
      {
        const signal = interrupted()
        if (signal !== undefined) {
          return finish(
            signal,
            `run ${signal}led before verification`,
            interruptTerminal[signal],
            duringVerification,
          )
        }
      }
      const reacquired = await runEpoch(
        verificationSet,
        ['profile', 'path_policy', 'gate_registry'],
        (acquisition) =>
          this.#ports.journal.appendAcquisition({ run_id: request.run_id, acquisition }),
      )
      if (!reacquired.ok) {
        return finish(
          'operational_fault',
          `verification re-acquisition failed: ${describeEpochFailure(reacquired.failure)}`,
          'OPERATIONAL_FAILURE',
          { gate_results: recorder.results(), observed, artifacts, operations },
        )
      }

      // The re-acquisition is only half of verification. The other half —
      // the half that was missing — is handing the candidate bundle and
      // the INDEPENDENTLY acquired values to the core's verifier and
      // acting on what it says. Re-reading the sources and discarding the
      // result would make VERIFYING a state the run passes through rather
      // than a check it passes.
      const candidate = assembleEvidence({
        snapshots,
        run_id: request.run_id,
        principal,
        adapter,
        terminal: 'COMPLETED',
        detail: 'the run completed',
        gate_results: recorder.results(),
        operations,
        observed,
        artifacts,
        reconciliation: reconcileClaims(observed, request.claimed_changes ?? []),
        started_at: startedAt,
        finished_at: this.#ports.clock.now({ run_id: request.run_id }),
      })
      if (!candidate.ok) {
        return finish(
          candidate.failure === 'refusal' ? 'refuse' : 'operational_fault',
          candidate.detail,
          candidate.failure === 'refusal' ? 'REFUSED' : 'OPERATIONAL_FAILURE',
          {
            gate_results: recorder.results(),
            observed,
            artifacts,
            operations,
          },
        )
      }

      // A FRESH artifact observation, not the production one: verification
      // that reuses the producer's reading cannot detect an artifact that
      // changed after production read it.
      const freshArtifacts = await observeArtifacts(this.#ports.artifacts, {
        run_id: request.run_id,
        paths: request.artifact_paths,
      })
      {
        const signal = interrupted()
        if (signal !== undefined) {
          return finish(
            signal,
            `run ${signal}led during verification`,
            interruptTerminal[signal],
            duringVerification,
          )
        }
      }
      const verdict = verifyEvidence(candidate.bundle, {
        profile: valueOf(reacquired.values, 'profile'),
        path_policy: valueOf(reacquired.values, 'path_policy'),
        gate_registry: valueOf(reacquired.values, 'gate_registry'),
        artifacts: freshArtifacts,
      })
      if ('kind' in verdict) {
        return finish('operational_fault', verdict.detail, 'OPERATIONAL_FAILURE', {
          gate_results: recorder.results(),
          observed,
          artifacts,
          operations,
        })
      }
      if (!verdict.verified) {
        return finish('refuse', `verification failed: ${verdict.failures.join('; ')}`, 'REFUSED', {
          gate_results: recorder.results(),
          observed,
          artifacts,
          operations,
        })
      }
      const verification = verdict.artifacts_consumed

      // ---- MATERIALIZATION ------------------------------------------
      // The core decides whether what the host observed may leave the
      // workspace. Orchestration asks and obeys; it does not judge.
      // `decideMaterialization` had existed since L3 and nothing called
      // it, which meant nothing decided whether a run's changes were
      // allowed to escape isolation.
      if (observed.changes.length > 0) {
        const policy = snapshots.path_policy
        const materialization = decideMaterialization(policy, observed, [
          snapshots.profile?.source.source ?? 'profile',
          policy?.source.source ?? 'path-policy',
          snapshots.gate_registry?.source.source ?? 'gate-registry',
        ])
        if (!isProceed(materialization)) {
          return finish('refuse', describeRefusal(materialization), 'REFUSED', {
            gate_results: recorder.results(),
            observed,
            artifacts,
            operations,
          })
        }
        if (workspace !== undefined && policy?.ok === true) {
          const applied = await this.#ports.workspace.applyBack({
            run_id: request.run_id,
            workspace_ref: workspace.workspace_ref,
            // The AUTHORITATIVE observation — not the model's claims,
            // and not a re-derivation of them.
            changes: observed.changes,
            authorized_by: {
              contract_id: policy.contract.contract_id,
              digest: policy.digest,
            },
          })
          if (!applied.ok) {
            // A run whose changes did not land has not completed. Sealing
            // it would describe a repository state that never happened.
            return finish(
              'operational_fault',
              `apply-back failed: ${applied.detail}`,
              'OPERATIONAL_FAILURE',
              { gate_results: recorder.results(), observed, artifacts, operations },
            )
          }
        }
      }

      return await finish('complete', 'the run completed', 'COMPLETED', {
        gate_results: recorder.results(),
        observed,
        artifacts,
        operations,
        verification,
      })
    }

    const outcome = await walkPhases(
      machine,
      [
        { name: 'requested', earns: 'resolve_profile', run: requested },
        { name: 'profile-resolved', earns: 'decide_eligibility', run: profileResolved },
        { name: 'eligible', earns: 'commit_spend', run: eligible },
        { name: 'sandbox-started', earns: 'begin_execution', run: sandboxStarted },
        { name: 'running', earns: 'begin_verification', run: running },
        // The last phase. Finalization is one transaction and owns both
        // of the terminal transitions, so there is no phase after it —
        // `earns` names the first of the two it commits.
        { name: 'verifying', earns: 'seal_evidence', run: verifying },
      ],
      {
        // The lease is checked BEFORE each phase's effects, for the same
        // reason the machine's transition is: a run that has lost
        // ownership must stop before it acts, not be told afterwards.
        beforePhase: async () =>
          (await this.#ports.lease.renew({ run_id: request.run_id, generation }))
            ? undefined
            : `the run lease was lost at generation ${String(generation)}`,
        afterRecord: journalTick,
      },
    )

    switch (outcome.kind) {
      case 'terminated':
        return outcome.value
      case 'held': {
        // The hold is the run's PENDING IDENTITY. Recorded durably, with
        // the state it is held at, so something can later find it and
        // resume — "recorded rather than silently dropped" is not
        // satisfied by an in-memory note the process takes to its grave.
        await this.#ports.journal.appendHold({
          run_id: request.run_id,
          hold: {
            state: machine.state,
            transition: 'commit_spend',
            detail: outcome.detail,
            at: this.#ports.clock.now({ run_id: request.run_id }),
          },
        })
        return await conclude('none', held ?? outcome.detail)
      }
      case 'lost':
        // Ownership moved while the run was walking. It has not failed a
        // contract; it has stopped being OURS. Writing a terminal record
        // now would be exactly the second writer the lease exists to
        // prevent, so this path writes NOTHING — no journal tail, no
        // event, no evidence. Whoever holds the run owns its record.
        return {
          run_id: request.run_id,
          state: machine.state,
          produced: 'none',
          detail: `${outcome.reason}; the ${outcome.phase} phase did not run, and no further write was made`,
          transitions: machine.transitionRecord,
          rejections: machine.rejections,
        }
      case 'halted':
        return await terminateFromRejection(outcome)
      case 'walked':
        // Unreachable in practice: the final phase always terminates,
        // because finalization commits the terminal sequence itself.
        // Represented rather than assumed — a walk that fell off the end
        // without terminating would otherwise be a silent success.
        return await conclude('none', 'the walk ended without a terminal commit')
    }
  }
}

/** The empty operation set — the shape evidence expects, not a stand-in. */
/**
 * The timestamp used when the clock itself is what failed. A run whose
 * time could not be read is INDETERMINATE anyway; inventing a plausible
 * "now" would make the record look more certain than the run was.
 */
const UNESTABLISHED_INSTANT = '1970-01-01T00:00:00.000Z'

const emptyOperations = (): EvidenceOperations => ({ attempted: [], permitted: [], denied: [] })

/** The bytes one epoch acquired for a named source, for the verifier. */
const valueOf = <E extends AcquisitionEpoch>(
  values: readonly EpochValue<E>[],
  source: string,
): AuthorityBytes => {
  const found = values.find((value) => value.source === source)
  if (found !== undefined) return found.bytes
  // Unreachable when the epoch completed, and honest if it ever is not:
  // an absent value is a failed acquisition, never an empty document.
  return { ok: false, source: { source }, failure: `the verification epoch produced no ${source}` }
}

/**
 * Whether the provider's terminal observations CONTRADICT one another.
 *
 * A clean exit alongside a kill signal is the spike's exit-124 case: the
 * provider reported success and the substrate saw it die. Neither
 * observation is authoritative, so the honest answer is that the
 * terminal cannot be established.
 */
const describeTerminalDisagreement = (terminal: TerminalObservations): string | undefined => {
  const clean = terminal.exit_code === 0
  const killed = terminal.signalled !== undefined
  if (clean && killed) {
    return `the provider reported exit ${String(terminal.exit_code)} but was signalled ${terminal.signalled}; the terminal state cannot be established`
  }
  if (!clean && terminal.exit_code !== undefined && terminal.reported_outcome === 'success') {
    return `the provider reported success but exited ${String(terminal.exit_code)}; the terminal state cannot be established`
  }
  return undefined
}

const emissionFailure = (outcome: {
  readonly ok: false
  readonly reason: string
  readonly detail: string
}): string => `run event could not be emitted (${outcome.reason}): ${outcome.detail}`

const describeRefusal = (refusal: Refusal): string =>
  `${refusal.code} on ${refusal.violated.element}: ${refusal.detail}`
