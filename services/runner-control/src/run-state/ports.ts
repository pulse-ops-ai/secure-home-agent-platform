/**
 * The orchestration-owned run journal and the run lease (design D9's
 * durable transition record; D10's per-run single writer made real
 * across processes).
 *
 * WHY A JOURNAL AND NOT A FINAL WRITE. `runner-lifecycle` requires every
 * declared transition to land in a durable, reconstructable record, and
 * requires an unconsented run held at `ELIGIBLE` to be RECORDED rather
 * than silently dropped. A record assembled in memory and written once at
 * the end satisfies neither: a run that dies at `RUNNING` leaves nothing
 * to reconstruct, and a held run leaves no pending identity anything
 * could later resume. The journal is append-only and written AS THE WALK
 * HAPPENS, so what survives a crash is what actually occurred.
 *
 * WHY A LEASE. `RunMachine` guarantees one writer per machine INSTANCE.
 * Nothing prevented two `Runner.run()` calls from being handed the same
 * `run_id`: two instances, two machines, both believing they own the run,
 * interleaving through the shared keyed sinks that cross-run isolation
 * legitimately permits. The per-run single-writer guarantee has to exist
 * above the machine, or it only holds for runs nobody duplicated.
 *
 * WHERE THIS PERSISTS IS NOT DECIDED HERE. Evidence persistence is U11's
 * and stays open. The port and its semantics do not wait on that: what a
 * journal must record, and what a lease must guarantee, are properties of
 * the orchestration, not of the store behind it.
 */
import type { RejectionEntry, TransitionEntry } from '../lifecycle/machine.js'
import type { LifecycleState } from '../lifecycle/states.js'
import type { Staging } from '../ports/finalization.js'
import type { AcquisitionEpoch, FenceOutcome, RunFence, RunScoped } from '../ports/values.js'

/** One acquisition, journaled as it happens. */
export interface JournaledAcquisition {
  readonly epoch: AcquisitionEpoch
  readonly source: string
  readonly outcome: 'acquired' | 'failed' | 'refused_token'
  readonly detail?: string
}

/** A run holding at a state because a precondition is unmet. */
export interface JournaledHold {
  readonly state: LifecycleState
  readonly transition: string
  readonly detail: string
  readonly at: string
}

/**
 * The reconstructed head of a run's journal — enough to answer "what is
 * this run, and is anything waiting on it?" without replaying evidence.
 */
export interface JournaledState {
  readonly run_id: string
  readonly state: LifecycleState
  readonly transitions: readonly TransitionEntry[]
  readonly rejections: readonly RejectionEntry[]
  readonly acquisitions: readonly JournaledAcquisition[]
  /** Present while the run is held; absent once it moves or terminates. */
  readonly held?: JournaledHold
}

/**
 * Every append is FENCED: a journal is the run's durable history, and a
 * holder that lost the run must not be able to add to it. The appends
 * return an outcome rather than `void` because the walk has to know its
 * entry was refused — a rejected append that looked like a successful
 * one would leave the stale holder believing its history was recorded.
 */
export interface RunJournalPort {
  /**
   * Prepare the terminal tail as part of a finalization commit. The
   * entries are NOT observable until the returned handle is published,
   * so a reader cannot see a run whose journal says it sealed while no
   * bundle exists.
   */
  stageTransitions(
    request: RunFence & {
      readonly commit_id: string
      readonly transitions: readonly TransitionEntry[]
    },
  ): Promise<Staging>
  appendTransition(
    request: RunFence & { readonly transition: TransitionEntry },
  ): Promise<FenceOutcome>
  appendRejection(request: RunFence & { readonly rejection: RejectionEntry }): Promise<FenceOutcome>
  appendAcquisition(
    request: RunFence & { readonly acquisition: JournaledAcquisition },
  ): Promise<FenceOutcome>
  appendHold(request: RunFence & { readonly hold: JournaledHold }): Promise<FenceOutcome>
  /**
   * `undefined` when the run has no journal — it never started here.
   * Unfenced: reading someone else's run tells a stale holder nothing it
   * could act on, and refusing the read would disguise lost ownership as
   * a missing journal.
   */
  readCurrentState(request: RunScoped): Promise<JournaledState | undefined>
}

/**
 * A lease result. `generation` is a fencing token: it increases on every
 * successful claim, so a holder that lost its lease and kept working can
 * be told apart from the one that actually holds it. Without the token a
 * stale holder's renew would succeed after the lease moved on.
 *
 * The token is only a fence where it is PRESENTED — see `RunFence`. The
 * lease hands it out; every effectful port demands it; the resource
 * itself rejects a superseded one. `renew` alone would leave a window
 * one phase wide in which a dispossessed holder keeps writing.
 */
export type LeaseClaim =
  | { readonly ok: true; readonly generation: number }
  | {
      readonly ok: false
      readonly reason: 'already_leased' | 'claim_aborted'
      readonly detail: string
    }

/**
 * One ownership attempt, cancellable before it becomes current.
 *
 * The attempt identity is UNIQUE PER ATTEMPT — never derived from the
 * run id alone. It is what lets a durable implementation be idempotent
 * safely: a store may answer a REPLAYED claim of the same attempt with
 * the same successful generation, so two callers sharing an attempt id
 * would both be told they own the run. Unique ids make the replay
 * affordance safe and make every retry a new attempt with its own
 * resolution.
 *
 * The signal makes a not-yet-granted attempt ineligible for ownership at
 * the resource. It cannot resolve the other half of the ambiguity — a
 * grant the resource committed whose acknowledgement never reached the
 * caller — which is what `abandon` below exists for.
 */
export interface LeaseClaimRequest extends RunScoped {
  readonly attempt_id: string
  readonly signal: AbortSignal
}

export interface RunLeasePort {
  claim(request: LeaseClaimRequest): Promise<LeaseClaim>
  /**
   * Resolve an attempt whose outcome the caller can no longer await.
   *
   * A distributed claim has a window the signal cannot close: the
   * resource commits a generation, the acknowledgement is delayed, and
   * the caller's deadline expires before it arrives. Only the resource
   * knows what became of the attempt, so the caller TELLS it the answer
   * is "no": after `abandon`, a pending attempt must never be granted,
   * and a granted attempt whose generation still holds the run is
   * released. Idempotent — abandoning a refused, expired, or already
   * abandoned attempt is a no-op.
   *
   * This is the caller's half of resolving uncertain acquisition. The
   * resource's half is its own ownership expiry: a durable
   * implementation must bound how long an unrenewed generation holds the
   * run, so an abandon that never arrives cannot park the run id
   * forever. The in-process implementation has no such window; a durable
   * one (U11) must declare its bound.
   */
  abandon(request: RunScoped & { readonly attempt_id: string }): Promise<void>
  /** `false` once this generation no longer holds the run. */
  renew(request: RunScoped & { readonly generation: number }): Promise<boolean>
  release(request: RunScoped & { readonly generation: number }): Promise<void>
}
