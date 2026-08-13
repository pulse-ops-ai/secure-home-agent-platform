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
  decideEligibility,
  isProceed,
  reconcileClaims,
  type AuthoritySnapshots,
  type ClaimedChange,
  type Refusal,
} from '@secure-home/runner-core'
import { AcquisitionSet, describeEpochFailure, runEpoch } from './acquisition/index.js'
import { decideSpendGate, type ConsentRecord } from './consent/index.js'
import { RunEventEmitter } from './events/index.js'
import { FinalizationLedger } from './finalization/index.js'
import { RunMachine, type LifecycleState, type TransitionKind } from './lifecycle/index.js'
import { observeArtifacts, observeWorkspace } from './observation/index.js'
import type { Ports } from './ports/index.js'
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

    const adapter = profile.value.runtime.adapter
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
      } = {},
    ): Promise<RunConclusion> => {
      machine.advance(kind, detail)
      const assembled = assembleEvidence({
        snapshots,
        run_id: request.run_id,
        requester: request.requester,
        adapter,
        terminal,
        detail,
        gate_results: partial.gate_results ?? {},
        observed: partial.observed ?? { changes: [] },
        artifacts: partial.artifacts ?? { ok: true, artifacts: [] },
        reconciliation: reconcileClaims(
          partial.observed ?? { changes: [] },
          request.claimed_changes ?? [],
        ),
        started_at: startedAt,
        finished_at: this.#ports.clock.now({ run_id: request.run_id }),
      })
      if (!assembled.ok) return conclude('none', assembled.detail)
      const sealed = await ledger.seal({ bundle: assembled.bundle, outcome: assembled.outcome })
      if (!sealed.ok) return conclude('none', `${sealed.refused}: ${sealed.detail}`)
      const terminated = await emitter.emit({
        event_type: 'run.terminated',
        outcome: assembled.outcome,
      })
      // The run has already terminated and sealed; there is no state to
      // move it to. A failed terminal emission is surfaced on the
      // conclusion rather than swallowed — the bundle is the durable
      // record, and the caller learns the stream is incomplete.
      return terminated.ok
        ? conclude('evidence_bundle', detail)
        : conclude(
            'evidence_bundle',
            `${detail} (terminal event not emitted: ${emissionFailure(terminated)})`,
          )
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
    const spend = decideSpendGate(request.consent)
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
    const started = await emitter.emit({
      event_type: 'run.started',
      profile: { ...profile.value.identity, digest: profile.digest },
    })
    if (!started.ok)
      return finish('operational_fault', emissionFailure(started), 'OPERATIONAL_FAILURE')
    const granted = await emitter.emit({
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
    const adapterStarted = await emitter.emit({ event_type: 'adapter.started' })
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
    const adapterCompleted = await emitter.emit({ event_type: 'adapter.completed' })
    if (!adapterCompleted.ok) {
      return finish('operational_fault', emissionFailure(adapterCompleted), 'OPERATIONAL_FAILURE', {
        gate_results: {},
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
          { gate_results: recorder.results() },
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
        { gate_results: recorder.results() },
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
        })
      }
    }
    machine.advance('begin_verification', 'independent verification begins')

    // ---- VERIFYING: a SECOND, independent acquisition epoch ---------
    const verification = new AcquisitionSet(request.run_id, 'verification', this.#ports.authority, [
      'profile',
      'path_policy',
      'gate_registry',
    ])
    const reacquired = await runEpoch(verification, ['profile', 'path_policy', 'gate_registry'])
    if (!reacquired.ok) {
      return finish(
        'operational_fault',
        `verification re-acquisition failed: ${describeEpochFailure(reacquired.failure)}`,
        'OPERATIONAL_FAILURE',
        { gate_results: recorder.results(), observed: observed.value, artifacts },
      )
    }

    machine.advance('seal_evidence', 'evidence assembled and sealed last')
    const completed = await finish('complete', 'the run completed', 'COMPLETED', {
      gate_results: recorder.results(),
      observed: observed.value,
      artifacts,
    })
    return completed
  }
}

const emissionFailure = (outcome: {
  readonly ok: false
  readonly reason: string
  readonly detail: string
}): string => `run event could not be emitted (${outcome.reason}): ${outcome.detail}`

const describeRefusal = (refusal: Refusal): string =>
  `${refusal.code} on ${refusal.violated.element}: ${refusal.detail}`
