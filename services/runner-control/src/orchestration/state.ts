/**
 * THE TYPESTATE: what a run has established, phase by phase.
 *
 * The old shape was one procedure holding fifteen `let` bindings that
 * every phase could read and write. Nothing stopped a phase touching
 * state it had not earned, and three of the four defects review found in
 * this landing came from exactly that: the recovery path could not see
 * the run, a terminal skipped its check, a decision drifted out of the
 * core — all of them invisible because the state had no shape.
 *
 * A bag of optionals would not have fixed it. `{ profile?, observed?,
 * session? }` is a set of illegal states with a type attached: every
 * reader must re-check what the walk already guarantees, and every
 * `!` re-asserts it.
 *
 * So the state is SPLIT BY WHAT ESTABLISHED IT, and a phase receives
 * only what it has. `requested` cannot read `observed` because nothing
 * it is given has one. That is a compile error, not a convention.
 */
import type { PrincipalT } from '../ports/contract-types.js'
import type {
  AuthoritativeChangeSet,
  AuthoritySnapshots,
  ConsumedArtifact,
} from '@secure-home/runner-core'
import type { GateResultsT } from '@secure-home/contracts'
import type { RunEventEmitter } from '../events/index.js'
import type { ArtifactObservation, EvidenceOperations } from '../ports/index.js'

/** A profile the core captured AND accepted. Never merely requested. */
export type CapturedProfile = NonNullable<AuthoritySnapshots['profile']> & { readonly ok: true }

/**
 * What the first phase establishes, and nothing else may invent.
 *
 * Every field here is present because `requested` earned its transition.
 * A phase holding an `Authority` needs no assertion and no null check —
 * which is why the definite-assignment assertions this replaced are gone
 * rather than relocated.
 */
export interface Authority {
  readonly snapshots: AuthoritySnapshots
  readonly profile: CapturedProfile
  readonly principal: PrincipalT
  readonly adapter: string
  readonly emitter: RunEventEmitter
}

/**
 * What the run OBSERVED, accumulated during execution.
 *
 * Total, not partial. The optional-everything version let a terminal
 * omit `operations` by forgetting to pass it, and three call sites did —
 * sealing a bundle that reported no operations for a run whose events
 * had already announced them. A caller cannot omit a field that is not
 * optional.
 */
export interface Observations {
  readonly gate_results: GateResultsT
  readonly observed: AuthoritativeChangeSet
  readonly artifacts: ArtifactObservation
  readonly operations: EvidenceOperations
  /** Present only once the verifier has consumed the artifacts. */
  readonly verification?: readonly ConsumedArtifact[]
}

/** The empty operation set — the shape evidence expects, not a stand-in. */
export const emptyOperations = (): EvidenceOperations => ({
  attempted: [],
  permitted: [],
  denied: [],
})

/**
 * A run that has observed nothing yet.
 *
 * Used by the terminals reachable before execution. An empty set is the
 * TRUE record of a run that changed nothing — it is not a placeholder,
 * which is why it is spelled out rather than defaulted.
 */
export const noObservations = (): Observations => ({
  gate_results: {},
  observed: { changes: [] },
  artifacts: { ok: true, artifacts: [] },
  operations: emptyOperations(),
})

/**
 * What the walk has established so far.
 *
 * Kept on the run scope so interruption and last-resort recovery can
 * construct the governed record owed by the real state the run reached.
 */
export type EstablishedRun =
  | { readonly at: 'requested' }
  | { readonly at: 'authorized'; readonly authority: Authority }
  | {
      readonly at: 'observed'
      readonly authority: Authority
      readonly observations: Observations
    }

/**
 * What the run has established, as a value nothing can misread.
 *
 * On the SCOPE rather than in the walk's local scope, for the same
 * reason the machine is: the handler that concludes an interrupted or
 * failed run has to know what the run had established, and a `let`
 * inside the walk is invisible to it. That was how an abandoned terminal
 * came to write no governed record at all — the path that concluded it
 * held the scope and neither an `Authority` nor `Observations`.
 */
export type WalkState =
  | { readonly at: 'requested' }
  | { readonly at: 'authorized'; readonly authority: Authority }
  | {
      readonly at: 'observed'
      readonly authority: Authority
      readonly observations: Observations
    }
