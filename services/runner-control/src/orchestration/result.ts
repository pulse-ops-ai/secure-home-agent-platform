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
  ProgressState,
  RejectionEntry,
  TerminalState,
  TransitionEntry,
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

/**
 * Cancellation and timeout arrive as declared signals, not exceptions.
 *
 * ONE FIELD, deliberately. This carried a transition table and a
 * deadline override as well, both described as proof affordances — and
 * both reached live machinery through a type the package exports. A
 * caller could forge a lifecycle by submitting a run. They are
 * constructor-time `RunControls` now, validated as narrowings.
 */
export interface RunSignals {
  /** Consulted at every declared boundary; the run terminates on it. */
  readonly interrupt?: () => 'cancel' | 'timeout' | undefined
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

/**
 * WHAT THIS CONCLUSION IS, as distinct from what state the run reached.
 *
 * The vocabulary problem this names: `runner-lifecycle` says a run is
 * never abandoned in a non-terminal state, and the ownership rule says a
 * run that loses ownership stops without writing. A dispossessed
 * attempt satisfies both only if "the attempt finished" and "the run
 * reached a terminal" stop being the same statement — the stale holder
 * has no authority to declare what happened to the logical run, and
 * inventing INDETERMINATE would be exactly that.
 *
 * So `ownership_lost` means THIS ATTEMPT is over; the new owner owns the
 * logical run's eventual terminal. `state` still reports the last state
 * this attempt actually observed, which is a fact it does own.
 *
 * Additive on purpose: `state` and `produced` keep their meanings, so
 * nothing reading them has to change to benefit from the distinction.
 */
/**
 * WHAT A CONCLUSION IS, with the state it may carry.
 *
 * A flat `{ kind, state }` let every impossible pairing type-check, and
 * two paths produced them: a dispossessed attempt reporting a terminal
 * it had no authority to declare, and the recovery path reporting
 * `terminal` alongside `RUNNING` in the very proof that no terminal was
 * granted.
 *
 * The vocabulary problem underneath: `runner-lifecycle` says a run is
 * never abandoned in a non-terminal state, and the ownership rule says a
 * run that loses ownership stops without writing. Both hold only if
 * "this attempt finished" and "the run reached a terminal" stop being
 * one statement — a stale holder owns its own ending, never the logical
 * run's.
 *
 * `unterminated` is the fifth because RO-INV-50 already requires it: when
 * the machine grants no terminal at all, the conclusion says so rather
 * than naming a state as though it were one.
 */
interface ConclusionBase {
  readonly run_id: string
  readonly detail: string
  /** The full declared walk — durable, and returned to the caller (D9). */
  readonly transitions: readonly TransitionEntry[]
  readonly rejections: readonly RejectionEntry[]
}

export type RunConclusion =
  /** The run reached a lifecycle terminal under this attempt. */
  | (ConclusionBase & {
      readonly kind: 'terminal'
      readonly state: TerminalState
      readonly produced: 'evidence_bundle' | 'early_termination_record' | 'none'
    })
  /** A precondition is unmet; the run waits where it is. */
  | (ConclusionBase & {
      readonly kind: 'held'
      readonly state: ProgressState
      readonly produced: 'none'
    })
  /** Ownership moved. This attempt is over; the run is not. */
  | (ConclusionBase & {
      readonly kind: 'ownership_lost'
      readonly state: LifecycleState
      readonly produced: 'none'
    })
  /** The attempt never began — the lease was never held. */
  | (ConclusionBase & {
      readonly kind: 'not_started'
      readonly state: 'REQUESTED'
      readonly produced: 'none'
    })
  /** The machine granted no terminal; the run ends unterminated. */
  | (ConclusionBase & {
      readonly kind: 'unterminated'
      readonly state: ProgressState
      readonly produced: 'none'
    })

export type ConclusionKind = RunConclusion['kind']

/**
 * What a phase concluded, plus whatever it ESTABLISHED.
 *
 * `next` is how the typestate is threaded: a phase that establishes
 * authority returns it, and the engine hands it to the phases that need
 * it. A phase that establishes nothing returns a plain `PhaseCommand`.
 */
export type PhaseOutcome<T> =
  | { readonly kind: 'earned'; readonly cause: string; readonly next: T }
  | { readonly kind: 'terminate'; readonly value: RunConclusion }
  | { readonly kind: 'hold'; readonly detail: string }
