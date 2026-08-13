/**
 * The public shape of one run: what is asked for, what may interrupt it,
 * and what comes back.
 *
 * These types are the contract between a caller and the engine. They
 * live apart from the engine so that reading "what is a run request"
 * does not mean reading the orchestration that services one.
 */
import type { PrincipalT, ProfileRefT } from '../ports/contract-types.js'
import type {
  AuthoritativeChangeSet,
  ClaimedChange,
  ConsumedArtifact,
} from '@secure-home/runner-core'
import type { ConsentRecord } from '../consent/index.js'
import type { ArtifactObservation, EvidenceOperations, RunInput } from '../ports/index.js'
import type { GateResultsT } from '@secure-home/contracts'
import type {
  LifecycleState,
  RejectionEntry,
  TransitionEntry,
  TransitionTable,
} from '../lifecycle/index.js'

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
export interface FinishPartial {
  readonly gate_results?: GateResultsT
  readonly observed?: AuthoritativeChangeSet
  readonly artifacts?: ArtifactObservation
  readonly operations?: EvidenceOperations
  readonly verification?: readonly ConsumedArtifact[]
}

/** A phase command that ends the run with a finished conclusion. */
export type Stop = { readonly kind: 'terminate'; readonly value: RunConclusion }

export const stop = (value: RunConclusion): Stop => ({ kind: 'terminate', value })

export interface RunConclusion {
  readonly run_id: string
  readonly state: LifecycleState
  readonly produced: 'evidence_bundle' | 'early_termination_record' | 'none'
  readonly detail: string
  /** The full declared walk — durable, and returned to the caller (D9). */
  readonly transitions: readonly TransitionEntry[]
  readonly rejections: readonly RejectionEntry[]
}
