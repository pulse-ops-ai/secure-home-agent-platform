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
  TerminalObservations,
} from './ports/index.js'
import type { GateResultsT } from '@secure-home/contracts'
import { buildPlan, DispositionRecorder, toDisposition } from './scheduling/index.js'
import {
  assembleEvidence,
  buildEarlyTerminationRecord,
  executionPrincipal,
} from './finalization/records.js'
import { RunScope } from './run/scope.js'

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
    // A clock that throws is one of the ports this handler exists for,
    // so the machine gets one that cannot.
    const safeClock = {
      now: (scoped: { run_id: string }) => {
        try {
          return this.#ports.clock.now(scoped)
        } catch {
          return UNESTABLISHED_INSTANT
        }
      },
    }
    // THE SCOPE IS CREATED HERE, not inside the walk.
    //
    // That single move is what makes the recovery below correct. While
    // the machine, the workspace, the session and the timers lived in
    // the walk's closures, an exception left this handler unable to
    // reach any of them — so it fabricated a fresh machine in REQUESTED
    // and reported a run that never happened.
    const scope = new RunScope(
      { run_id: request.run_id, generation },
      new RunMachine(request.run_id, safeClock, signals.transitions),
      safeClock.now({ run_id: request.run_id }),
    )
    try {
      return await this.#walk(request, signals, scope)
    } catch (error) {
      const detail = `the run's terminal state could not be established: ${
        error instanceof Error ? error.message : String(error)
      }`
      // The REAL machine, advanced from the state the run actually
      // reached. Checked like any other transition: a table that does
      // not declare `indeterminate` from here leaves the run where it
      // was rather than recording a terminal that was refused.
      scope.machine.advance('indeterminate', detail)

      // Flush what the walk had not journaled yet, so the durable record
      // carries the walk rather than stopping at the last tick before
      // the throw. Best effort — the journal may be what failed.
      await this.#flushJournal(scope)

      // Release what the run holds. This is the leak the old handler
      // could not reach: `conclude()` never ran, so the workspace and
      // the deadline timer survived every exception.
      await scope.release(this.#ports)

      // WHICH RECORD, decided from the run's real state.
      //
      // A run that never captured a profile has no identities, and the
      // early-terminal record is the only shape it can produce. A run
      // that HAD authority must not be given that shape.
      //
      // Nor is a bundle sealed from here. Sealing is the finalization
      // transaction's, and the exception may have come from inside it;
      // inventing a seal in a catch block is how a run that failed
      // acquires a record saying otherwise. For this case the journal is
      // the reconstructable record, which is what it is for.
      let produced: RunConclusion['produced'] = 'none'
      if (!scope.authorityCaptured) {
        const record = buildEarlyTerminationRecord({
          run_id: request.run_id,
          requester: request.requester,
          requested_profile: request.profile_ref,
          state: scope.machine.state,
          detail,
          started_at: scope.startedAt,
          finished_at: safeClock.now({ run_id: request.run_id }),
        })
        if (record.ok) {
          try {
            await this.#ports.evidence.write({
              ...scope.fence,
              kind: 'early_termination_record',
              record: record.record,
            })
            produced = 'early_termination_record'
          } catch {
            // The sink is the thing that failed. The conclusion below
            // still reports a terminal state rather than rejecting.
          }
        }
      }
      return {
        run_id: request.run_id,
        state: scope.machine.state,
        produced,
        detail,
        transitions: scope.machine.transitionRecord,
        rejections: scope.machine.rejections,
      }
    }
  }

  /**
   * Append everything the machine has recorded since the last tick.
   *
   * Called after every machine mutation during the walk, so the journal
   * is written AS THE WALK HAPPENS rather than assembled and flushed at
   * the end — and called again by the exception handler, so a run that
   * died mid-phase leaves the same durable trail as one that concluded.
   */
  async #flushJournal(scope: RunScope): Promise<void> {
    if (scope.fenceLost !== undefined) return
    const pending = scope.machine.pendingJournal()
    let transitions = 0
    let rejections = 0
    try {
      for (const transition of pending.transitions) {
        const appended = await this.#ports.journal.appendTransition({ ...scope.fence, transition })
        // A refused append is NOT left pending. Pending means "retry
        // next tick", and a fence refusal is the one failure mode that
        // retrying cannot fix — the entry would be re-offered forever to
        // a journal that will never take it.
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
      // PENDING, and the next tick retries it. Propagating would end the
      // run over a transient journal fault, and — worse — the entry
      // would still be unwritten.
    } finally {
      // Only what LANDED is confirmed. Anything after the failure stays
      // pending and is retried, so a rejected append cannot silently
      // remove a transition from the record.
      scope.machine.confirmJournaled(transitions, rejections)
    }
  }

  async #walk(request: RunRequest, signals: RunSignals, scope: RunScope): Promise<RunConclusion> {
    // Aliases for the parts of the scope that never change identity.
    // Everything MUTABLE is written through `scope` directly, so the
    // exception handler above sees the run that actually happened.
    const machine = scope.machine
    const fence = scope.fence
    const generation = fence.generation
    const startedAt = scope.startedAt
    const ledger = new FinalizationLedger(request.run_id)

    /**
     * Set the first time any port refuses this run's fence.
     *
     * Ownership moved while this attempt was mid-phase. Every subsequent
     * effect is a write that would be refused for the same reason, so
     * the run stops trying: it does not retry, does not terminate the
     * run, and does not write a verdict about a run it no longer owns.
     * This is the same conclusion the walk's `lost` path reaches, arrived
     * at from inside a phase rather than at its boundary.
     */
    const loseFence = (detail: string): void => {
      scope.loseFence(detail)
    }

    /**
     * Journal one acquisition, noticing a refusal.
     *
     * `runEpoch` takes this as a callback and does not inspect what it
     * returns — an epoch's job is to acquire, not to police ownership. So
     * the refusal is recognised HERE, where the fence is known, rather
     * than being dropped on the floor by a callback whose result nobody
     * reads.
     */
    const journalAcquisition = async (acquisition: {
      readonly epoch: AcquisitionEpoch
      readonly source: string
      readonly outcome: 'acquired' | 'failed' | 'refused_token'
      readonly detail?: string
    }): Promise<void> => {
      const appended = await this.#ports.journal.appendAcquisition({ ...fence, acquisition })
      if (!appended.ok) loseFence(appended.detail)
    }

    /** The walk's journal tick — the same flush the handler above uses. */
    const journalTick = (): Promise<void> => this.#flushJournal(scope)

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
      // One release path, shared with the exception handler. Releasing
      // here and separately in the handler is how the two drifted: the
      // handler's version discarded nothing, so every throw leaked the
      // workspace and the deadline timer.
      await scope.release(this.#ports)
      if (scope.fenceLost !== undefined) {
        // OWNERSHIP MOVED. Everything a conclusion would write is
        // refused by the fence — including the cleanup, which `release`
        // therefore skips: the workspace and session named here belong
        // to whoever holds the run now, and discarding them would
        // destroy the state of a run in progress. Leaking is
        // recoverable; deleting a live workspace is not.
        return {
          run_id: request.run_id,
          state: machine.state,
          produced: 'none',
          detail: `${scope.fenceLost}; no further write was made (this attempt had reached: ${detail})`,
          transitions: machine.transitionRecord,
          rejections: machine.rejections,
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
      const written = await this.#ports.evidence.write({
        ...fence,
        kind: 'early_termination_record',
        record: record.record,
      })
      if (!written.ok) {
        loseFence(written.detail)
        return stop(await conclude('none', detail))
      }
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
      // An emission the fence refused is not an emission failure to
      // terminate on — it is the run ceasing to be ours mid-phase.
      if (!outcome.ok && outcome.reason === 'stale_fence') loseFence(outcome.detail)
      return outcome
    }
    /** Set by the consent phase so a hold can report which kind it was. */
    let held: string | undefined
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
        journalAcquisition,
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
      scope.authorityCaptured = true
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
        { run_id: request.run_id, adapter, generation },
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
      // THE FENCE IS CHECKED BEFORE ANY TERMINAL IS ASSEMBLED.
      //
      // `finish` is the funnel every terminal passes through, so one
      // guard here covers all of them. A run that lost ownership mid-
      // phase must not assemble a bundle, decide seal eligibility, or
      // commit — it must stop. Reaching the commit and being refused
      // there would work too, but only by accident of which resources
      // the new owner happened to touch first.
      if (scope.fenceLost !== undefined) return stop(await conclude('none', detail))
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
        ...fence,
        terminal,
        transitions: projected.entries,
        event: emitter.envelope({ event_type: 'run.terminated', outcome: assembled.outcome }),
        bundle: eligible.bundle,
      })
      if (!committed.ok) {
        // A commit the fence refused did not fail — it was declined. The
        // run is not terminated OPERATIONAL_FAILURE on it, because that
        // would be this attempt writing a verdict about a run that has
        // moved to another holder.
        if (committed.reason === 'stale_fence') {
          loseFence(committed.detail)
          return stop(await conclude('none', committed.detail))
        }
        return await failClosed(committed.detail)
      }
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
    const raise = (reason: 'cancel' | 'timeout'): void => {
      if (abortReason !== undefined) return
      abortReason = reason
      aborter.abort()
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
      if (scope.session !== undefined) {
        try {
          await this.#ports.session.interrupt({
            ...fence,
            session_ref: scope.session.session_ref,
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
        ...fence,
        source_ref: request.workspace_root,
      })
      if (!provisioned.ok) {
        if (provisioned.reason === 'stale_fence') {
          loseFence(provisioned.detail)
          return stop(await conclude('none', provisioned.detail))
        }
        return finish(
          'operational_fault',
          `the isolated workspace could not be provisioned: ${provisioned.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }
      scope.workspace = provisioned.handle

      const prepared = await this.#ports.session.prepare({
        ...fence,
        profile: { ...profile.value.identity, digest: profile.digest },
        limits: profile.value.limits,
      })
      if (!prepared.ok) {
        if (prepared.reason === 'stale_fence') {
          loseFence(prepared.detail)
          return stop(await conclude('none', prepared.detail))
        }
        return finish(
          'operational_fault',
          `the execution session could not be prepared: ${prepared.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }
      scope.session = prepared.handle
      const sessionStarted = await this.#ports.session.start({
        ...fence,
        session_ref: scope.session.session_ref,
      })
      if (!sessionStarted.ok) {
        if (sessionStarted.reason === 'stale_fence') {
          loseFence(sessionStarted.detail)
          return stop(await conclude('none', sessionStarted.detail))
        }
        return finish(
          'operational_fault',
          `the execution session could not be started: ${sessionStarted.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }

      // Arm the deadline from the session's own budget. A run with no
      // deadline is the unbounded run the model forbids.
      const deadlineMs = signals.deadline_ms ?? scope.session.deadline.wall_clock_seconds * 1000
      scope.timers.push(
        setTimeout(() => {
          raise('timeout')
        }, deadlineMs),
      )
      if (signals.cancelAfterMs !== undefined) {
        scope.timers.push(
          setTimeout(() => {
            raise('cancel')
          }, signals.cancelAfterMs),
        )
      }

      return {
        kind: 'earned',
        cause: `session ${scope.session.session_ref} started; consent recorded by ${request.consent?.by ?? 'unknown'}`,
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
          ...fence,
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
            session_ref: scope.session?.session_ref ?? `session:${request.run_id}`,
            root_ref: `workspace:${request.run_id}`,
          },
          signal: aborter.signal,
        }),
      )
      if (invocation === undefined) return await abortRun({ operations })
      if (invocation.outcome === 'stale_fence') {
        // The adapter was never engaged: the fence is checked before the
        // provider is asked to do anything, so a run that lost ownership
        // has not spent.
        loseFence(invocation.detail)
        return stop(await conclude('none', invocation.detail))
      }
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
            ...fence,
            gate_id: entry.gate_id,
            spec: entry.spec,
            session_ref: scope.session?.session_ref ?? `session:${request.run_id}`,
            signal: aborter.signal,
          }),
        )
        if (report === undefined) {
          return await abortRun({ gate_results: recorder.results(), operations })
        }
        if (report.outcome === 'stale_fence') {
          loseFence(report.detail)
          return stop(await conclude('none', report.detail))
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

      // Named for what it is. This was `const workspace`, shadowing the
      // outer provisioned WorkspaceHandle — so this phase structurally
      // could not reach the workspace it was running in.
      const changeSet = await observeWorkspace(this.#ports.observer, {
        run_id: request.run_id,
        root: request.workspace_root,
      })
      if (!isProceed(changeSet)) {
        // A workspace we could not READ is operational; a workspace whose
        // contents the core refused is a contract refusal. Keeping them
        // apart here is the same INV-003 distinction the evidence
        // boundary keeps.
        const operational = changeSet.kind === 'operational_failure'
        return finish(
          operational ? 'operational_fault' : 'refuse',
          operational ? changeSet.detail : describeRefusal(changeSet),
          operational ? 'OPERATIONAL_FAILURE' : 'REFUSED',
          { gate_results: recorder.results(), operations },
        )
      }
      observed = changeSet.value
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
        journalAcquisition,
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
        if (scope.workspace !== undefined && policy?.ok === true) {
          // OWNERSHIP, RE-ASKED IMMEDIATELY BEFORE THE WRITE THAT ESCAPES
          // ISOLATION.
          //
          // The fence alone cannot cover this one. A resource can only
          // refuse a generation it has already been SUPERSEDED by, and
          // the workspace may never have served the new owner — so the
          // stale holder's apply-back is the first thing it sees at that
          // generation, and it is admitted. That is inherent to fencing
          // tokens, not a gap in the ledger.
          //
          // Apply-back is where a run's changes leave the sandbox and
          // become real, so it gets the belt as well as the braces: the
          // lease is asked directly, as late as possible before the
          // write, and the fence still guards the case where the
          // workspace HAS seen a newer generation. Neither mechanism
          // replaces the other.
          if (!(await this.#ports.lease.renew({ run_id: request.run_id, generation }))) {
            const detail = `the run lease was lost at generation ${String(generation)}; nothing was materialized`
            loseFence(detail)
            return stop(await conclude('none', detail))
          }
          const applied = await this.#ports.workspace.applyBack({
            ...fence,
            workspace_ref: scope.workspace.workspace_ref,
            // The AUTHORITATIVE observation — not the model's claims,
            // and not a re-derivation of them.
            changes: observed.changes,
            authorized_by: {
              contract_id: policy.contract.contract_id,
              digest: policy.digest,
            },
          })
          if (!applied.ok) {
            if (applied.reason === 'stale_fence') {
              // Nothing was materialized, which is the correct outcome:
              // this attempt's observations must not be applied over a
              // workspace another holder is now running in.
              loseFence(applied.detail)
              return stop(await conclude('none', applied.detail))
            }
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
        const recorded = await this.#ports.journal.appendHold({
          ...fence,
          hold: {
            state: machine.state,
            transition: 'commit_spend',
            detail: outcome.detail,
            at: this.#ports.clock.now({ run_id: request.run_id }),
          },
        })
        // A hold that could not be recorded is not a pending run — it is
        // a run this holder no longer owns. Reported as such, so nothing
        // later goes looking for a hold that was never written.
        if (!recorded.ok) loseFence(recorded.detail)
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
