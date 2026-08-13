/**
 * The two governed durable shapes a run can produce, and the single
 * mapping from a terminal state to its outcome.
 *
 * The terminal-state → outcome mapping is exhaustive by construction: it
 * switches over the closed vocabulary and TypeScript's `never` check at
 * the end fails the build if a state is ever added without a mapping. A
 * run whose outcome could not be established maps to `INDETERMINATE`,
 * which every consumer classifies as a failure — never to `COMPLETED`,
 * and never to "we'll leave it out".
 */
import {
  EarlyTerminationRecord,
  EARLY_TERMINATION_RECORD_VERSION,
  type RunOutcomeT,
} from '@secure-home/events'
import type { PrincipalT, ProfileRefT } from '../ports/contract-types.js'
import type { EvidenceOperations } from '../ports/values.js'
import {
  constructEvidence,
  isOperationalFailure,
  type ArtifactObservation,
  type AuthoritativeChangeSet,
  type AuthoritySnapshots,
  type Reconciliation,
} from '@secure-home/runner-core'
import type { GateResultsT } from '@secure-home/contracts'
import type { LifecycleState } from '../lifecycle/index.js'

export const outcomeFor = (state: LifecycleState, detail: string): RunOutcomeT => {
  switch (state) {
    case 'COMPLETED':
      return { terminal_state: 'COMPLETED' }
    case 'REFUSED':
      return { terminal_state: 'REFUSED', failure: { class: 'contract_refusal', detail } }
    case 'OPERATIONAL_FAILURE':
      return { terminal_state: 'OPERATIONAL_FAILURE', failure: { class: 'operational', detail } }
    case 'CANCELLED':
      return { terminal_state: 'CANCELLED', detail }
    case 'TIMED_OUT':
      return { terminal_state: 'TIMED_OUT', detail }
    case 'INDETERMINATE':
      return { terminal_state: 'INDETERMINATE', detail }
    // A non-terminal state has no outcome. Reaching here means the
    // orchestrator tried to finalize a run that had not terminated, which
    // is INDETERMINATE — a failure everywhere — rather than a guess.
    default:
      return {
        terminal_state: 'INDETERMINATE',
        detail: `the run's terminal state could not be established from ${state}: ${detail}`,
      }
  }
}

export type RecordResult<T> =
  { readonly ok: true; readonly record: T } | { readonly ok: false; readonly detail: string }

export interface EarlyTerminationInputs {
  readonly run_id: string
  readonly requester: PrincipalT
  readonly requested_profile: ProfileRefT | null
  readonly state: LifecycleState
  readonly detail: string
  readonly started_at: string
  readonly finished_at: string
}

/**
 * The record for a run that terminated before authority completed.
 *
 * `requester` is the run request's principal, carried through verbatim.
 * It is never derived from a captured profile — a run CAN reach an
 * early terminal after capturing one, and taking the agent principal
 * from there would silently reattribute the request to the thing it
 * asked for (RO-INV-09, normative in `runner-lifecycle`).
 */
export const buildEarlyTerminationRecord = (
  inputs: EarlyTerminationInputs,
): RecordResult<unknown> => {
  const outcome = outcomeFor(inputs.state, inputs.detail)
  if (outcome.terminal_state === 'COMPLETED') {
    return {
      ok: false,
      detail: 'a successful terminal has no early-termination record; the vocabulary omits it',
    }
  }
  const candidate = {
    contract_id: 'early-termination-record',
    contract_version: EARLY_TERMINATION_RECORD_VERSION,
    run_id: inputs.run_id,
    requester: inputs.requester,
    requested_profile: inputs.requested_profile,
    outcome,
    timing: timingOf(inputs.started_at, inputs.finished_at),
  }
  const parsed = EarlyTerminationRecord.safeParse(candidate)
  if (!parsed.success) {
    return { ok: false, detail: describeIssues(parsed.error.issues) }
  }
  return { ok: true, record: parsed.data }
}

export interface EvidenceAssemblyInputs {
  readonly snapshots: AuthoritySnapshots
  readonly run_id: string
  readonly requester: PrincipalT
  readonly adapter: string
  readonly terminal: LifecycleState
  readonly detail: string
  readonly gate_results: GateResultsT
  /**
   * The operations the adapter reported. Hard-coding these empty made
   * every permitted and denied call vanish from the audit trail — the
   * one question the bundle exists to answer.
   */
  readonly operations: EvidenceOperations
  readonly observed: AuthoritativeChangeSet
  readonly artifacts: ArtifactObservation
  readonly reconciliation: Reconciliation
  readonly started_at: string
  readonly finished_at: string
}

export type AssemblyResult =
  | { readonly ok: true; readonly bundle: unknown; readonly outcome: RunOutcomeT }
  | { readonly ok: false; readonly detail: string }

/**
 * Assemble the bundle through the core.
 *
 * The image digest comes from the captured profile, not from an observed
 * container — this landing launches nothing, so the profile's declared
 * digest is the only honest answer and the run never claims to have
 * observed an image it did not start. `argv_digest` is likewise the
 * digest of the empty plan: no argv was executed here.
 */
export const assembleEvidence = (inputs: EvidenceAssemblyInputs): AssemblyResult => {
  const profile = inputs.snapshots.profile
  if (profile === undefined || !profile.ok) {
    return { ok: false, detail: 'evidence assembly requires the captured execution profile' }
  }
  const outcome = outcomeFor(inputs.terminal, inputs.detail)
  const constructed = constructEvidence({
    snapshots: inputs.snapshots,
    run: {
      run_id: inputs.run_id,
      image_digest: profile.value.runtime.image_digest,
      argv_digest: EMPTY_ARGV_DIGEST,
      runtime: profile.value.runtime.image_digest,
      provider: profile.value.execution.model_route,
      adapter: inputs.adapter,
    },
    principal: inputs.requester,
    operations: inputs.operations,
    gate_results: inputs.gate_results,
    artifacts: inputs.artifacts,
    observed: inputs.observed,
    reconciliation: inputs.reconciliation,
    outcome,
    timing: timingOf(inputs.started_at, inputs.finished_at),
  })
  if (isOperationalFailure(constructed)) {
    return { ok: false, detail: `${constructed.source}: ${constructed.detail}` }
  }
  if (constructed.kind === 'refusal') {
    return { ok: false, detail: `${constructed.code}: ${constructed.detail}` }
  }
  return { ok: true, bundle: constructed.value, outcome }
}

/** sha256 of the empty string — the digest of an argv that never ran. */
const EMPTY_ARGV_DIGEST = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

const timingOf = (started_at: string, finished_at: string) => {
  const seconds = (Date.parse(finished_at) - Date.parse(started_at)) / 1000
  return {
    started_at,
    finished_at,
    duration_seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
  }
}

const describeIssues = (
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string =>
  issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`).join('; ')
