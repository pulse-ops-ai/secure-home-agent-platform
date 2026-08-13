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
import type { Retractable } from '../ports/finalization.js'
import type { AcquisitionEpoch, RunScoped } from '../ports/values.js'

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

export interface RunJournalPort extends Retractable {
  appendTransition(request: RunScoped & { readonly transition: TransitionEntry }): Promise<void>
  appendRejection(request: RunScoped & { readonly rejection: RejectionEntry }): Promise<void>
  appendAcquisition(
    request: RunScoped & { readonly acquisition: JournaledAcquisition },
  ): Promise<void>
  appendHold(request: RunScoped & { readonly hold: JournaledHold }): Promise<void>
  /** `undefined` when the run has no journal — it never started here. */
  readCurrentState(request: RunScoped): Promise<JournaledState | undefined>
}

/**
 * A lease result. `generation` is a fencing token: it increases on every
 * successful claim, so a holder that lost its lease and kept working can
 * be told apart from the one that actually holds it. Without the token a
 * stale holder's renew would succeed after the lease moved on.
 */
export type LeaseClaim =
  | { readonly ok: true; readonly generation: number }
  | { readonly ok: false; readonly reason: 'already_leased'; readonly detail: string }

export interface RunLeasePort {
  claim(request: RunScoped): Promise<LeaseClaim>
  /** `false` once this generation no longer holds the run. */
  renew(request: RunScoped & { readonly generation: number }): Promise<boolean>
  release(request: RunScoped & { readonly generation: number }): Promise<void>
}
