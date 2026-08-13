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
 * tail, the terminal event, and the sealed bundle. After `commit`
 * returns, either all three are observable or none of them are. An
 * implementation that cannot guarantee that must FAIL the commit rather
 * than apply part of it — a partially finalized run is the state every
 * one of these contracts exists to make unrepresentable.
 *
 * Ordering inside the commit is not free either: the seal is still the
 * run's final write, so the bundle is applied last. Retraction therefore
 * unwinds in reverse, and the seal — the write most likely to be
 * rejected — has nothing after it to undo.
 *
 * WHERE THE TRANSACTION PERSISTS IS NOT DECIDED HERE. That is U11's.
 * What it must guarantee is this landing's, and a port whose contract
 * waits for its store is a port whose contract gets written by the store.
 */
import type { TransitionEntry } from '../lifecycle/machine.js'
import type { LifecycleState } from '../lifecycle/states.js'
import type { RunScoped } from './values.js'

export interface FinalizationCommit extends RunScoped {
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
}

export type CommitOutcome = { readonly ok: true } | { readonly ok: false; readonly detail: string }

export interface FinalizationPort {
  commit(commit: FinalizationCommit): Promise<CommitOutcome>
}

/**
 * Undo the writes ONE COMMIT ATTEMPT made.
 *
 * Scoped to an attempt, not to a run. Retracting everything a run ever
 * wrote is wrong the moment a run is attempted twice: a later attempt's
 * rollback would erase an earlier attempt's committed terminal record,
 * turning a failure into data loss.
 *
 * So a participant is MARKED before the attempt writes anything, and
 * retraction rewinds to that mark. Required rather than optional: a sink
 * that cannot say "these particular writes are not observable" cannot
 * take part in an all-or-none commit, and discovering that at rollback
 * time is discovering it too late.
 */
export interface Retractable {
  /** A token naming this participant's state before an attempt writes. */
  mark(request: RunScoped): Promise<string>
  /** Discard everything this run wrote after `token`. */
  retractTo(request: RunScoped & { readonly token: string }): Promise<void>
}
