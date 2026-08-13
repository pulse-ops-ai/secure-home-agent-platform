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
  type AuthoritySnapshots,
  type ClaimedChange,
  type ConsumedArtifact,
  type Refusal,
} from '@secure-home/runner-core'
import {
  AcquisitionSet,
  describeEpochFailure,
  runEpoch,
  type EpochValue,
} from './acquisition/index.js'
import { decideSpendGate, type ConsentRecord } from './consent/index.js'
import { RunEventEmitter } from './events/index.js'
import { FinalizationLedger } from './finalization/index.js'
import { RunMachine, type LifecycleState, type TransitionKind } from './lifecycle/index.js'
import { observeArtifacts, observeWorkspace } from './observation/index.js'
import type { AcquisitionEpoch, AuthorityBytes, EvidenceOperations, Ports } from './ports/index.js'
import { buildPlan, DispositionRecorder, toDisposition } from './scheduling/index.js'
import { assembleEvidence, buildEarlyTerminationRecord } from './finalization/records.js'

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
}

export interface RunConclusion {
  readonly run_id: string
  readonly state: LifecycleState
  readonly produced: 'evidence_bundle' | 'early_termination_record' | 'none'
  readonly detail: string
  readonly transitions: number
  readonly rejections: number
}

export class Runner {
  readonly #ports: Ports

  constructor(ports: Ports) {
    this.#ports = ports
  }

  async run(request: RunRequest, signals: RunSignals = {}): Promise<RunConclusion> {
    const machine = new RunMachine(request.run_id, this.#ports.clock)
    const ledger = new FinalizationLedger(request.run_id, this.#ports.evidence)
    const startedAt = this.#ports.clock.now({ run_id: request.run_id })

    const conclude = (produced: RunConclusion['produced'], detail: string): RunConclusion => ({
      run_id: request.run_id,
      state: machine.state,
      produced,
      detail,
      transitions: machine.transitionRecord.length,
      rejections: machine.rejections.length,
    })

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
    ): Promise<RunConclusion> => {
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
      if (!record.ok) return conclude('none', record.detail)
      await this.#ports.evidence.write({
        run_id: request.run_id,
        kind: 'early_termination_record',
        record: record.record,
      })
      return conclude('early_termination_record', detail)
    }

    // ---- REQUESTED -------------------------------------------------
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
      return terminateEarly('operational_fault', describeEpochFailure(acquired.failure))
    }
    const snapshots: AuthoritySnapshots = acquired.snapshots
    const profile = snapshots.profile
    if (profile === undefined || !profile.ok) {
      return terminateEarly(
        'refuse',
        profile === undefined
          ? 'the execution profile did not resolve'
          : `the execution profile did not resolve: ${profile.refusal.detail}`,
      )
    }

    // The captured profile must be the profile that was ASKED FOR.
    // Without this, the configured source could return any valid
    // profile and the run would execute under it — a request for a
    // narrow profile silently running with a broader grant. Capture
    // proves the bytes are a valid profile; it cannot know which one was
    // requested, so the binding has to be checked here, before
    // PROFILE_RESOLVED and long before spend.
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

    const adapter = profile.value.runtime.adapter
    // Every emission is registered with the ledger, so "the seal is the
    // final write" is a claim about the writes that actually happened.
    // Without this the ledger's sequence was empty and seal-last held
    // vacuously — true, and worth nothing.
    const emit = async (body: Record<string, unknown>) => {
      ledger.open('event', String(body['event_type']))
      const outcome = await emitter.emit(body)
      ledger.close()
      return outcome
    }
    const emitter = new RunEventEmitter(
      { run_id: request.run_id, adapter },
      this.#ports.events,
      this.#ports.clock,
    )

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
    ): Promise<RunConclusion> => {
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
        requester: request.requester,
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
      const failClosed = (why: string): RunConclusion => {
        machine.advance('operational_fault', why)
        return conclude('none', why)
      }
      if (!assembled.ok) return failClosed(assembled.detail)

      const terminated = await emit({
        event_type: 'run.terminated',
        outcome: assembled.outcome,
      })
      if (!terminated.ok) return failClosed(emissionFailure(terminated))

      const sealed = await ledger.seal({ bundle: assembled.bundle, outcome: assembled.outcome })
      if (!sealed.ok) return failClosed(`${sealed.refused}: ${sealed.detail}`)

      // Sealed. Only now is the terminal state taken.
      machine.advance(kind, detail)
      return conclude('evidence_bundle', detail)
    }

    const interrupted = (): 'cancel' | 'timeout' | undefined => signals.interrupt?.()

    const interruptTerminal = { cancel: 'CANCELLED', timeout: 'TIMED_OUT' } as const

    machine.advance('resolve_profile', `profile ${profile.value.identity.name} resolved`)

    // ---- PROFILE_RESOLVED ------------------------------------------
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
    machine.advance('decide_eligibility', 'the core decided the run eligible')

    // ---- ELIGIBLE: consent gates spend -----------------------------
    const spend = decideSpendGate(request.run_id, request.consent)
    if (!spend.ok) {
      // HELD, not refused, and not abandoned: the machine stays at
      // ELIGIBLE and the pending state is recorded. `hold` records
      // without advancing — calling `advance` here would have spent.
      machine.hold('commit_spend', spend.detail)
      return conclude('none', `${spend.held}: ${spend.detail}`)
    }
    machine.advance('commit_spend', `consent recorded by ${request.consent?.by ?? 'unknown'}`)

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

    // ---- SANDBOX_STARTED -------------------------------------------
    {
      const signal = interrupted()
      if (signal !== undefined) {
        return finish(signal, `run ${signal}led after spend`, interruptTerminal[signal])
      }
    }
    machine.advance('begin_execution', 'execution begins behind the execution port')

    // ---- RUNNING: adapter, then gates ------------------------------
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
    const operations = emptyOperations()
    for (const [index, call] of invocation.calls.entries()) {
      const call_id = `call-${String(index + 1).padStart(4, '0')}`
      const operation = { call_id, operation: { name: call.tool } }
      const attempted = await emit({
        event_type: 'call.attempted',
        call_id,
        operation: { name: call.tool },
      })
      if (!attempted.ok) {
        return finish('operational_fault', emissionFailure(attempted), 'OPERATIONAL_FAILURE')
      }
      const disposed = await emit({
        event_type: 'call.disposition',
        call_id,
        disposition: call.disposition,
      })
      if (!disposed.ok) {
        return finish('operational_fault', emissionFailure(disposed), 'OPERATIONAL_FAILURE')
      }
      operations.attempted.push(operation)
      operations[call.disposition].push(operation)
    }

    const adapterCompleted = await emit({ event_type: 'adapter.completed' })
    if (!adapterCompleted.ok) {
      return finish('operational_fault', emissionFailure(adapterCompleted), 'OPERATIONAL_FAILURE', {
        operations,
      })
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
    const recorder = new DispositionRecorder(plan.plan.map((entry) => entry.gate_id))
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

    const observed = await observeWorkspace(this.#ports.workspace, {
      run_id: request.run_id,
      root: request.workspace_root,
    })
    if (!isProceed(observed)) {
      return finish(
        'operational_fault',
        observed.kind === 'operational_failure' ? observed.detail : describeRefusal(observed),
        observed.kind === 'operational_failure' ? 'OPERATIONAL_FAILURE' : 'REFUSED',
        { gate_results: recorder.results(), operations },
      )
    }
    const artifacts = await observeArtifacts(this.#ports.artifacts, {
      run_id: request.run_id,
      paths: request.artifact_paths,
    })

    {
      const signal = interrupted()
      if (signal !== undefined) {
        return finish(signal, `run ${signal}led during execution`, interruptTerminal[signal], {
          gate_results: recorder.results(),
          observed: observed.value,
          artifacts,
          operations,
        })
      }
    }
    machine.advance('begin_verification', 'independent verification begins')

    // ---- VERIFYING: a SECOND, independent acquisition epoch ---------
    const verificationSet = new AcquisitionSet(
      request.run_id,
      'verification',
      this.#ports.authority,
      ['profile', 'path_policy', 'gate_registry'],
    )
    const reacquired = await runEpoch(verificationSet, ['profile', 'path_policy', 'gate_registry'])
    if (!reacquired.ok) {
      return finish(
        'operational_fault',
        `verification re-acquisition failed: ${describeEpochFailure(reacquired.failure)}`,
        'OPERATIONAL_FAILURE',
        { gate_results: recorder.results(), observed: observed.value, artifacts, operations },
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
      requester: request.requester,
      adapter,
      terminal: 'COMPLETED',
      detail: 'the run completed',
      gate_results: recorder.results(),
      operations,
      observed: observed.value,
      artifacts,
      reconciliation: reconcileClaims(observed.value, request.claimed_changes ?? []),
      started_at: startedAt,
      finished_at: this.#ports.clock.now({ run_id: request.run_id }),
    })
    if (!candidate.ok) {
      return finish('operational_fault', candidate.detail, 'OPERATIONAL_FAILURE', {
        gate_results: recorder.results(),
        observed: observed.value,
        artifacts,
        operations,
      })
    }

    // A FRESH artifact observation, not the production one: verification
    // that reuses the producer's reading cannot detect an artifact that
    // changed after production read it.
    const freshArtifacts = await observeArtifacts(this.#ports.artifacts, {
      run_id: request.run_id,
      paths: request.artifact_paths,
    })
    const verdict = verifyEvidence(candidate.bundle, {
      profile: valueOf(reacquired.values, 'profile'),
      path_policy: valueOf(reacquired.values, 'path_policy'),
      gate_registry: valueOf(reacquired.values, 'gate_registry'),
      artifacts: freshArtifacts,
    })
    if ('kind' in verdict) {
      return finish('operational_fault', verdict.detail, 'OPERATIONAL_FAILURE', {
        gate_results: recorder.results(),
        observed: observed.value,
        artifacts,
        operations,
      })
    }
    if (!verdict.verified) {
      return finish('refuse', `verification failed: ${verdict.failures.join('; ')}`, 'REFUSED', {
        gate_results: recorder.results(),
        observed: observed.value,
        artifacts,
        operations,
      })
    }
    const verification = verdict.artifacts_consumed

    machine.advance('seal_evidence', 'evidence assembled and sealed last')
    const completed = await finish('complete', 'the run completed', 'COMPLETED', {
      gate_results: recorder.results(),
      observed: observed.value,
      artifacts,
      operations,
      verification,
    })
    return completed
  }
}

/** The empty operation set — the shape evidence expects, not a stand-in. */
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
