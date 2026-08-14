/**
 * The finalization transaction.
 *
 * Three contracts were in tension, and no ordering of individual writes
 * resolves them:
 *
 *   every transition is durable
 * + `run.terminated` is truthful
 * + the evidence seal is the run's final write
 *
 * Emitting the terminal event with the INTENDED outcome and then sealing
 * satisfies the third and breaks the second — a failed seal leaves an
 * event announcing `COMPLETED` for a run that ended
 * `OPERATIONAL_FAILURE`. The problem is not the order of the two writes.
 * It is that finalization was several writes at all.
 *
 * WHAT ATOMICITY MEANS HERE. A finalization commit carries the journal
 * tail, the terminal event, and the sealed bundle. At no point may a
 * reader observe some of them and not the others — not merely after
 * `commit` returns, but at any instant during it.
 *
 * That rules out writing them in turn and undoing on failure. Rollback
 * is a different guarantee: it restores the invariant afterwards instead
 * of never breaking it, it exposes a half-finalized run for the duration
 * of the commit, and a rollback that itself fails has nowhere to go.
 *
 * So participants STAGE — preparing writes no reader can see — and one
 * publication point makes them all visible together. Ordering inside
 * the commit stops mattering, because there is no interval in which
 * order could be observed; the seal is still prepared last, so the
 * participant most likely to refuse does so before anything is
 * published.
 *
 * WHERE THE TRANSACTION PERSISTS IS NOT DECIDED HERE. That is U11's.
 * What it must guarantee is this landing's, and a port whose contract
 * waits for its store is a port whose contract gets written by the store.
 */
import type { TransitionEntry } from '../lifecycle/machine.js'
import type { LifecycleState } from '../lifecycle/states.js'
import type { RunFence } from './values.js'

export interface FinalizationCommit extends RunFence {
  /**
   * THE CALLER-OWNED LOGICAL COMMIT IDENTITY, established BEFORE the
   * port call and stable across retries of the same intent.
   *
   * An implementation must not privately mint a new logical identity per
   * call — that is precisely what made a retried commit publish a second
   * terminal after its first acknowledgement was lost. A repeat of the
   * SAME identity whose publication already happened is answered
   * `ok: true` without staging or publishing anything; that answer is
   * the reconciliation of a lost acknowledgement.
   *
   * When absent, the implementation derives the identity
   * deterministically from `(run_id, generation, terminal)` — still
   * caller-knowable, never per-call.
   */
  readonly commit_id?: string
  /** The terminal state this run is committing to. */
  readonly terminal: LifecycleState
  /**
   * The journal tail: the exact transition entries this commit makes
   * durable. Projected from the machine before anything is written, so
   * the committed tail and the state the machine adopts afterwards are
   * the same entries rather than two derivations of one intention.
   */
  readonly transitions: readonly TransitionEntry[]
  /** The `run.terminated` event body — its outcome IS the committed one. */
  readonly event: Record<string, unknown>
  /** The contract-valid, seal-eligible bundle. */
  readonly bundle: unknown
  /**
   * Aborted when the run's wall clock or caller cancellation fires.
   *
   * Staging and the final ownership check are async. An implementation
   * must observe this signal before publication so an expired attempt
   * cannot make a terminal commit visible after the orchestrator has
   * moved on to interruption settlement.
   */
  readonly signal: AbortSignal
  /**
   * The absolute wall-clock instant after which this commit must not
   * publish, in epoch milliseconds.
   *
   * A signal alone cannot close the last window: the abort is raised by
   * a timer callback, and wall time can cross the expiry before that
   * callback has an event-loop turn. The boundary rejecting the RESULT
   * after the fact — the rule that is correct for reads — is exactly
   * wrong here, because by then publication has happened. So the
   * implementation consults this instant SYNCHRONOUSLY, immediately
   * before publication: either the commit publishes inside the budget,
   * or nothing observable exists.
   */
  readonly expires_at_epoch_ms?: number
  /**
   * WHOSE bound `expires_at_epoch_ms` is. A `governed` expiry is the
   * run's own wall clock — refusing on it is the run's timeout. An
   * `attempt` expiry is a settlement/recovery recording ceiling —
   * refusing on it means this ATTEMPT could not finish recording, and
   * the refusal must never be relabelled into a lifecycle TIMED_OUT.
   */
  readonly expires_at_bound?: 'governed' | 'attempt'
}

export type CommitOutcome =
  | { readonly ok: true }
  /**
   * `stale_fence` is called out rather than folded into a generic
   * failure: a commit refused because the run moved on has NOT failed a
   * contract, and terminating it OPERATIONAL_FAILURE would write a
   * verdict about a run this caller no longer owns. `expired` is the
   * governed clock refusing — the run's TIMEOUT. `attempt_expired` is a
   * settlement/recovery ceiling refusing — the attempt's recording
   * failure, with the intended terminal left standing.
   * `already_committed` reconciles the remaining unknown: this
   * generation already published a DIFFERENT logical commit, so this
   * intent must not publish a second terminal; the durable record holds
   * the truth this attempt cannot see.
   */
  | {
      readonly ok: false
      readonly reason?: 'stale_fence' | 'expired' | 'attempt_expired' | 'already_committed'
      readonly detail: string
    }

/**
 * AN ACKNOWLEDGED COMMIT IS A FACT. `commit` is not a read: once it
 * resolves `ok: true`, publication has occurred and the caller must
 * treat the terminal as committed — it cannot re-classify the run as
 * timed out because the acknowledgement arrived late. The expiry is
 * enforced INSIDE the commit, at the publication point, which is the
 * only place it can be enforced without pretending a published record
 * does not exist.
 *
 * A DURABLE implementation (U11) inherits the stronger half of this
 * contract: its publication must be a transaction that checks the expiry
 * within the same atomic step, and because its acknowledgement can be
 * lost in transit, it must make the commit's outcome discoverable by the
 * caller-owned commit identity. An unknown acknowledgement resolves to
 * exactly one of: NOT COMMITTED (the identity was never published — a
 * retry of the same identity may proceed), COMMITTED (the identity was
 * published — the retry is answered `ok` without a second publication),
 * or ALREADY_COMMITTED (the generation published a different identity —
 * this intent is refused and the durable record is the truth). That is
 * the same resolution discipline `RunLeasePort.abandon` establishes for
 * ownership: resolved where the effect lives, never guessed at the
 * caller.
 */
export interface FinalizationPort {
  commit(commit: FinalizationCommit): Promise<CommitOutcome>
}

/**
 * A write that is PREPARED but not observable.
 *
 * This replaces retraction, and the difference is the whole point.
 * Compensation writes, discovers a problem, and unwrites — so there is a
 * window in which a reader sees a half-finalized run, and a rollback
 * that fails leaves the invariant broken with no path back. Both are
 * properties of having written at all.
 *
 * Staging removes the window rather than shrinking it. A participant
 * prepares its write somewhere no reader can see, and one publication
 * point later makes every participant's prepared state visible at once.
 * A failure before that point has nothing to undo, so "the rollback
 * failed" is not handled better — it stops being reachable.
 */
export interface StagedWrite {
  /**
   * The commit this record belongs to. A reader ignores any record whose
   * commit is unpublished, so the record may sit in its own store from
   * the moment it is staged without being observable.
   */
  readonly commitId: string
  /** Drop the prepared record. Nothing was ever visible. */
  abandon(): void
}

export type Staging =
  | { readonly ok: true; readonly staged: StagedWrite }
  | { readonly ok: false; readonly reason?: 'stale_fence'; readonly detail: string }

/**
 * THE SINGLE VISIBILITY AUTHORITY.
 *
 * Note what is NOT here: a participant has no `publish`. An earlier
 * version gave each staged write one and published them in a loop with
 * no `await` between. That is safe against the event loop and against
 * nothing else — two holes survived, and neither was about scheduling:
 *
 *  - `publish(): void` cannot express "does not throw". The first
 *    publication could succeed and the second throw, landing exactly on
 *    the partial state the design exists to remove, with no
 *    compensation available by then;
 *  - synchronous is not unobserved. A publication that synchronously
 *    reads another participant — directly or through anything it calls —
 *    sees the system between two mutations. No scheduling required.
 *
 * Both come from finalization being three mutations. So it is one. Every
 * fallible thing happens while invisible; the only state change that
 * makes a run's terminal record readable is `publish(commitId)`, a set
 * insertion with no branch, no I/O, and no participant involvement.
 *
 * The stores stay separate — journal, events, and evidence remain
 * distinct concepts with distinct ports. Only VISIBILITY is shared, and
 * a shared visibility authority is precisely what a durable
 * implementation replaces with a database transaction (U11).
 */
export interface CommitVisibility {
  /** Make every record of `commitId` observable. The one mutation. */
  publish(commitId: string): void
  /** Whether a record carrying `commitId` may be read. */
  isPublished(commitId: string): boolean
}
