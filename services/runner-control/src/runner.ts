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
import { observeArtifacts, observeWorkspace } from './observation/index.js'
import type { AcquisitionEpoch, AuthorityBytes, EvidenceOperations, Ports } from './ports/index.js'
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
    try {
      return await this.#walk(request, signals)
    } catch (error) {
      const detail = `the run's terminal state could not be established: ${
        error instanceof Error ? error.message : String(error)
      }`
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

  async #walk(request: RunRequest, signals: RunSignals): Promise<RunConclusion> {
    const machine = new RunMachine(request.run_id, this.#ports.clock, signals.transitions)
    const ledger = new FinalizationLedger(request.run_id, this.#ports.evidence)
    const startedAt = this.#ports.clock.now({ run_id: request.run_id })

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
      try {
        await this.#ports.evidence.write({
          run_id: request.run_id,
          kind: 'transition_record',
          transitions: {
            run_id: request.run_id,
            transitions: machine.transitionRecord,
            rejections: machine.rejections,
          },
        })
      } catch {
        // The transition record is diagnostic. Failing to write it must
        // not turn a concluded run into an unconcluded one — the run
        // already reached its terminal state and its governed record.
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
      machine.advance(kind, detail)
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
    /** Set by the seal step; the walked branch concludes with it. */
    let sealedDetail: string | undefined
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
      const acquired = await runEpoch(production, ['profile', 'path_policy', 'gate_registry'])
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
      partial: {
        readonly gate_results?: ReturnType<DispositionRecorder['results']>
        readonly observed?: {
          readonly changes: readonly {
            path: string
            kind: 'created' | 'modified' | 'deleted'
            bytes: number
          }[]
        }
        readonly artifacts?: Awaited<ReturnType<typeof observeArtifacts>>
        readonly operations?: EvidenceOperations
        readonly verification?: readonly ConsumedArtifact[]
      } = {},
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

      const terminated = await emit({
        event_type: 'run.terminated',
        outcome: assembled.outcome,
      })
      if (!terminated.ok) return await failClosed(emissionFailure(terminated))

      // The seal is IRREVERSIBLE and earns its transition afterwards, so
      // the engine's gating cannot cover it: by the time a rejected
      // `seal_evidence` could halt the walk, the bundle would already be
      // in the sink. Ask the machine first. This is not a second state
      // machine — it is declining to perform an irreversible act the
      // authority has already said it will not honour.
      if (kind === 'complete' && !machine.permits('seal_evidence')) {
        return await failClosed(
          'the machine does not declare seal_evidence from this state; no bundle is written',
        )
      }

      const sealed = await ledger.seal({ bundle: assembled.bundle, outcome: assembled.outcome })
      if (!sealed.ok) return await failClosed(`${sealed.refused}: ${sealed.detail}`)

      // Sealed — and only now may EVIDENCE_SEALED be recorded. On the
      // success path the transition is EARNED and applied by the engine,
      // which is what keeps the record from ever claiming a seal that
      // did not happen: there is no code path that advances it early.
      if (kind === 'complete') {
        // Deliberately NOT concluding here. The conclusion snapshots the
        // machine's state, and on this path two transitions are still
        // outstanding — `seal_evidence`, which these effects just
        // earned, and `complete`. Concluding now would report VERIFYING
        // for a run that goes on to complete. The engine applies them;
        // the walked branch concludes afterwards.
        sealedDetail = detail
        return { kind: 'earned', cause: 'evidence sealed' }
      }
      machine.advance(kind, detail)
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

    const interrupted = (): 'cancel' | 'timeout' | undefined => signals.interrupt?.()

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

    // Not async: consent is a decision over data the run already holds,
    // so this phase performs no effect at all. Its whole content is the
    // command it returns.
    const eligible = (): Promise<PhaseCommand<RunConclusion>> => {
      const spend = decideSpendGate(request.run_id, request.consent)
      if (!spend.ok) {
        // HELD, not refused, and not abandoned. The engine records the
        // hold against this phase's transition and stops the walk, so the
        // machine stays at ELIGIBLE and nothing downstream runs.
        held = `${spend.held}: ${spend.detail}`
        return Promise.resolve({ kind: 'hold', detail: spend.detail })
      }
      return Promise.resolve({
        kind: 'earned',
        cause: `consent recorded by ${request.consent?.by ?? 'unknown'}`,
      })
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
      const base = await this.#ports.workspace.observeBase({
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
      const invocation = await this.#ports.adapter.invoke({
        run_id: request.run_id,
        adapter,
        profile_ref: profile.value.identity,
      })
      if (invocation.outcome === 'environmental_fault') {
        return finish(
          'operational_fault',
          `adapter invocation faulted: ${invocation.detail}`,
          'OPERATIONAL_FAILURE',
        )
      }
      // Every call the adapter reports becomes BOTH an event pair and an
      // evidence operation. Discarding them would mean a permitted or
      // denied action left no trace anywhere — the exact question the
      // evidence bundle exists to answer ("what was this allowed to do,
      // and what did it do?") would have no answer.
      operations = emptyOperations()
      for (const [index, call] of invocation.calls.entries()) {
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
        const report = await this.#ports.execution.runGate({
          run_id: request.run_id,
          gate_id: entry.gate_id,
          spec: entry.spec,
        })
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

      const workspace = await observeWorkspace(this.#ports.workspace, {
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
      const reacquired = await runEpoch(verificationSet, [
        'profile',
        'path_policy',
        'gate_registry',
      ])
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

      return await finish('complete', 'the run completed', 'COMPLETED', {
        gate_results: recorder.results(),
        observed,
        artifacts,
        operations,
        verification,
      })
    }

    /**
     * EVIDENCE_SEALED. The bundle is written; nothing remains but to
     * record that the run completed. The phase has no effects, which is
     * the point — every effect happened while earning the transition
     * into this state.
     */
    const evidenceSealed = (): Promise<PhaseCommand<RunConclusion>> =>
      Promise.resolve({ kind: 'earned', cause: 'the run completed' })

    const outcome = await walkPhases(machine, [
      { name: 'requested', earns: 'resolve_profile', run: requested },
      { name: 'profile-resolved', earns: 'decide_eligibility', run: profileResolved },
      { name: 'eligible', earns: 'commit_spend', run: eligible },
      { name: 'sandbox-started', earns: 'begin_execution', run: sandboxStarted },
      { name: 'running', earns: 'begin_verification', run: running },
      { name: 'verifying', earns: 'seal_evidence', run: verifying },
      { name: 'evidence-sealed', earns: 'complete', run: evidenceSealed },
    ])

    switch (outcome.kind) {
      case 'terminated':
        return outcome.value
      case 'held':
        return await conclude('none', held ?? outcome.detail)
      case 'halted':
        return await terminateFromRejection(outcome)
      case 'walked':
        // Every phase earned its transition, so the bundle is sealed and
        // the machine has reached COMPLETED. Concluding here — after the
        // last transition — is what makes the reported state the state
        // the run actually ended in.
        return await conclude('evidence_bundle', sealedDetail ?? 'the run completed')
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

const emissionFailure = (outcome: {
  readonly ok: false
  readonly reason: string
  readonly detail: string
}): string => `run event could not be emitted (${outcome.reason}): ${outcome.detail}`

const describeRefusal = (refusal: Refusal): string =>
  `${refusal.code} on ${refusal.violated.element}: ${refusal.detail}`
