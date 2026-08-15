/**
 * Finalization as ONE publication, over the journal, the event sink, and
 * the evidence sink.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO GO. The previous implementation
 * wrote the journal tail, emitted the terminal event, wrote the bundle,
 * and undid whatever had landed if a later step failed. That is
 * compensation, and it cannot deliver what `FinalizationPort` promises:
 *
 *  - for the duration of the commit, a reader saw a new journal tail
 *    with no terminal event and no bundle — a run sealed according to
 *    one participant and unfinished according to the other two;
 *  - a retraction that itself failed left the invariant broken outright,
 *    which no amount of care in the rollback path can fix, because the
 *    rollback path is the thing that failed.
 *
 * Neither is a bug in the rollback. Both follow from having written
 * before knowing whether the commit could succeed.
 *
 * SO NOTHING IS WRITTEN UNTIL EVERYTHING IS READY. Each participant
 * stages — preparing its write where no reader can reach it — and only
 * once all three have staged does one publication make them visible.
 *
 *   stage journal tail      (invisible)
 *   stage terminal event    (invisible)
 *   stage sealed bundle     (invisible)
 *          ↓
 *   ONE publication point   (all three, at once)
 *
 * A failure at any point before publication abandons what was staged.
 * Abandoning cannot fail in a way that matters, because it removes
 * nothing anybody could see — "the rollback failed" is not handled
 * better here, it is unreachable.
 *
 * WHY THE PUBLICATION IS ATOMIC. `publish()` is synchronous by contract
 * and the loop below contains no `await`. JavaScript runs a synchronous
 * block to completion, so no reader — no timer, no I/O callback, no
 * other run — can observe the interval between the first and last
 * publication. That is a real guarantee in one isolate, and it is the
 * whole of the guarantee: it says nothing about a durable store, which
 * is U11's and must reach for a genuine transaction of its own. What
 * this ships is a deterministic in-memory implementation whose atomicity
 * is a property of the language, disclosed rather than assumed.
 */
import type {
  CommitOutcome,
  CommitVisibility,
  EventSinkPort,
  EvidenceSinkPort,
  FinalizationCommit,
  FinalizationPort,
  RunJournalPort,
  RunLeasePort,
  StagedWrite,
} from '../ports/index.js'

export interface CommitParticipants {
  readonly journal: RunJournalPort
  readonly events: EventSinkPort
  readonly evidence: EvidenceSinkPort
  /**
   * The visibility authority the three participants SHARE. It is the
   * only thing they share; their stores stay separate.
   */
  readonly visibility: CommitVisibility
  /**
   * Consulted once more immediately before the commit marker.
   *
   * Every fence check happens during the asynchronous staging phase, so
   * ownership can move after the last of them. The per-resource fence
   * cannot close that window on its own — a `FenceLedger` only learns of
   * a newer generation when that generation reaches it, and a run that
   * simply stops writing never delivers one. This is the last moment a
   * terminal record can still be withheld, so it is asked here.
   */
  readonly lease: RunLeasePort
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class TransactionalFinalization implements FinalizationPort {
  readonly #participants: CommitParticipants
  /** Which logical commit each generation PUBLISHED, for reconciliation. */
  readonly #finalized = new Map<string, string>()
  /** The canonical intent each published identity carried. */
  readonly #intents = new Map<string, string>()

  constructor(participants: CommitParticipants) {
    this.#participants = participants
  }

  /**
   * The commit's CANONICAL LOGICAL INTENT — everything the commit would
   * make durable, serialized deterministically.
   *
   * The identity alone cannot establish equivalence: two different
   * intents from one generation can wear the same derived identity
   * merely because both end CANCELLED. Reconciliation therefore compares
   * the stored canonical intent of the published identity: an exact
   * replay is the same intent and reconciles `ok`; anything else is a
   * DIFFERENT commit that must never be answered as a replay.
   */
  static #canonical(commit: FinalizationCommit): string {
    return JSON.stringify({
      terminal: commit.terminal,
      transitions: commit.transitions,
      event: commit.event,
      bundle: commit.bundle,
    })
  }

  /**
   * Whether the commit's absolute expiry has passed.
   *
   * Consulted SYNCHRONOUSLY at every checkpoint and — decisively —
   * immediately before publication. The signal cannot carry this: its
   * abort is raised by a timer callback, and wall time crosses the
   * expiry before the callback runs. A boundary rejecting the RESULT
   * instead would be rejecting a publication that already happened.
   */
  static #expired(commit: FinalizationCommit): boolean {
    return commit.expires_at_epoch_ms !== undefined && Date.now() >= commit.expires_at_epoch_ms
  }

  /**
   * The expiry refusal, carrying its PROVENANCE. A governed expiry is
   * the run's timeout; an attempt-scoped ceiling is a recording bound
   * whose refusal must never be relabelled into lifecycle TIMED_OUT.
   */
  static #expiredOutcome(commit: FinalizationCommit, what: string): CommitOutcome {
    return {
      ok: false,
      reason: commit.expires_at_bound === 'attempt' ? 'attempt_expired' : 'expired',
      detail: `finalization did not commit: the ${
        commit.expires_at_bound === 'attempt' ? "attempt's recording bound" : "run's budget"
      } elapsed before ${what}`,
    }
  }

  async commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    const { journal, events, evidence, visibility, lease } = this.#participants
    const fence = { run_id: commit.run_id, generation: commit.generation }
    const staged: StagedWrite[] = []
    // THE LOGICAL COMMIT IDENTITY IS THE CALLER'S — required by the
    // contract, never minted and never derived here. A per-call counter
    // is what turned a lost acknowledgement into a second terminal, and
    // a derived (run, generation, terminal) identity is what let two
    // different intents alias one another; both fallbacks are gone.
    const commit_id = commit.commit_id
    const holder = `${commit.run_id}#g${String(commit.generation)}`

    // ---- RECONCILE BEFORE ANYTHING ELSE --------------------------
    // A repeat of an identity that already PUBLISHED is only a lost
    // acknowledgement being resolved when it is THE SAME LOGICAL
    // INTENT. Equivalence is established by the stored canonical
    // intent, not by the identity string: a different intent wearing
    // the same derived identity — same generation, same terminal state,
    // different content — is a different commit, and answering it `ok`
    // would report success over durable records describing something
    // else.
    if (visibility.isPublished(commit_id)) {
      if (this.#intents.get(commit_id) === TransactionalFinalization.#canonical(commit)) {
        return { ok: true }
      }
      return {
        ok: false,
        reason: 'already_committed',
        detail: `finalization did not commit: identity ${commit_id} is already published with a different logical intent; the durable record is the truth`,
      }
    }
    // A DIFFERENT logical commit for a generation that already
    // published one may never publish a second terminal. The durable
    // record holds the truth this caller cannot see.
    if (this.#finalized.has(holder)) {
      return {
        ok: false,
        reason: 'already_committed',
        detail: `finalization did not commit: generation ${String(commit.generation)} of run ${commit.run_id} already published commit ${this.#finalized.get(holder) ?? ''}`,
      }
    }

    const abandon = (): void => {
      // Reverse order for symmetry with publication. It makes no
      // observable difference — that is the point of abandoning state
      // nobody could see — but a participant that holds a resource
      // should release it in the opposite order it took it.
      for (const write of [...staged].reverse()) write.abandon()
    }

    // ---- STAGE ---------------------------------------------------
    // The bundle is staged LAST, so the participant most likely to
    // refuse refuses while refusing is still free.
    const preparations: readonly (readonly [string, () => Promise<unknown>])[] = [
      [
        'journal tail',
        () => journal.stageTransitions({ ...fence, commit_id, transitions: commit.transitions }),
      ],
      ['terminal event', () => events.stageEmit({ ...fence, commit_id, event: commit.event })],
      [
        'sealed bundle',
        () =>
          evidence.stageWrite({
            ...fence,
            commit_id,
            kind: 'evidence_bundle',
            bundle: commit.bundle,
          }),
      ],
    ]

    for (const [what, prepare] of preparations) {
      if (commit.signal.aborted) {
        abandon()
        return {
          ok: false,
          detail: `finalization did not commit: the run was interrupted before the ${what} was prepared`,
        }
      }
      if (TransactionalFinalization.#expired(commit)) {
        abandon()
        return TransactionalFinalization.#expiredOutcome(commit, `the ${what} was prepared`)
      }
      let outcome
      try {
        outcome = (await prepare()) as
          | { ok: true; staged: StagedWrite }
          // The participant's reason is PRESERVED to the caller — a
          // conflicting replay from staging must reach the commit's
          // public outcome as itself, never as generic failure or
          // ownership loss.
          | { ok: false; reason?: 'stale_fence' | 'conflicting_replay'; detail: string }
      } catch (error) {
        abandon()
        return {
          ok: false,
          detail: `finalization did not commit: the ${what} could not be prepared: ${describe(error)}`,
        }
      }
      if (!outcome.ok) {
        abandon()
        return {
          ok: false,
          ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
          detail: `finalization did not commit: the ${what} was refused: ${outcome.detail}`,
        }
      }
      staged.push(outcome.staged)
      // Every participant must stage under the SAME commit. Two ids in
      // one finalization would publish half a run and leave the other
      // half waiting for a marker that never comes.
      if (outcome.staged.commitId !== commit_id) {
        abandon()
        return {
          ok: false,
          detail: `finalization did not commit: the ${what} staged under ${outcome.staged.commitId}, not ${commit_id}`,
        }
      }
    }

    if (commit.signal.aborted) {
      abandon()
      return {
        ok: false,
        detail:
          'finalization did not commit: the run was interrupted before ownership confirmation',
      }
    }

    // ---- FINAL OWNERSHIP CHECK -----------------------------------
    // The last `await` before the marker, so nothing can interleave
    // between this answer and the publication that depends on it.
    let owned: boolean
    try {
      owned = await lease.renew({ run_id: commit.run_id, generation: commit.generation })
    } catch (error) {
      abandon()
      return {
        ok: false,
        detail: `finalization did not commit: ownership could not be confirmed: ${describe(error)}`,
      }
    }
    if (!owned) {
      abandon()
      return {
        ok: false,
        reason: 'stale_fence',
        detail: `finalization did not commit: run ${commit.run_id} moved on before the commit marker`,
      }
    }

    if (commit.signal.aborted) {
      abandon()
      return {
        ok: false,
        detail: 'finalization did not commit: the run was interrupted before the commit marker',
      }
    }
    // THE LAST CHECK, SYNCHRONOUS WITH THE PUBLICATION IT GUARDS.
    // Nothing can interleave between this answer and the marker, so
    // either the commit publishes inside its budget or it publishes
    // nothing — the write-side twin of the lease's abandoned attempt.
    if (TransactionalFinalization.#expired(commit)) {
      abandon()
      return TransactionalFinalization.#expiredOutcome(commit, 'the commit marker')
    }

    // ---- PUBLISH -------------------------------------------------
    // THE ENTIRE COMMIT, IN ONE MUTATION.
    //
    // Not a loop over participants: a set insertion. Before this line
    // every staged record is invisible to every reader; after it, all of
    // them are readable. There is no sequence for an observer to catch
    // half-done and no participant call that could throw partway.
    visibility.publish(commit_id)
    this.#finalized.set(holder, commit_id)
    this.#intents.set(commit_id, TransactionalFinalization.#canonical(commit))
    return { ok: true }
  }
}
