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
  /**
   * IN-FLIGHT logical commits: identity → its canonical intent and the
   * ONE underlying outcome. Bound synchronously before the first await,
   * because the defect this closes exists specifically BEFORE
   * publication: two different intents wearing one identity, or one
   * intent finalized twice, while neither is visible yet. An exact
   * concurrent replay JOINS this outcome (single-flight) rather than
   * independently mutating participant staging state.
   */
  readonly #inFlightByCommit = new Map<
    string,
    { readonly canonical: string; readonly outcome: Promise<CommitOutcome> }
  >()
  /** IN-FLIGHT terminal ownership: (run, generation) → the finalizing commit. */
  readonly #inFlightByGeneration = new Map<string, string>()

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

  commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    // THE ENTRY LEDGER IS SYNCHRONOUS. Every binding below exists
    // before the first await, because the defects it closes live
    // specifically BEFORE publication: two intents wearing one
    // identity, or one generation finalized twice, while nothing is
    // visible yet. Three identities, three jobs, never collapsed:
    // (run, sequence) is the event's, commit_id is the transaction's,
    // (run, generation) is ownership's.
    const canonical = TransactionalFinalization.#canonical(commit)
    // THE LOGICAL COMMIT IDENTITY IS THE CALLER'S — required by the
    // contract, never minted and never derived here.
    const commit_id = commit.commit_id
    const holder = `${commit.run_id}#g${String(commit.generation)}`
    const { visibility } = this.#participants

    // A repeat of an identity that already PUBLISHED is only a lost
    // acknowledgement being resolved when it is THE SAME LOGICAL
    // INTENT — equivalence by stored canonical intent, never by the
    // identity string.
    if (visibility.isPublished(commit_id)) {
      if (this.#intents.get(commit_id) === canonical) {
        return Promise.resolve({ ok: true })
      }
      return Promise.resolve({
        ok: false,
        reason: 'already_committed',
        detail: `finalization did not commit: identity ${commit_id} is already published with a different logical intent; the durable record is the truth`,
      })
    }
    // A DIFFERENT logical commit for a generation that already
    // published one may never publish a second terminal.
    if (this.#finalized.has(holder)) {
      return Promise.resolve({
        ok: false,
        reason: 'already_committed',
        detail: `finalization did not commit: generation ${String(commit.generation)} of run ${commit.run_id} already published commit ${this.#finalized.get(holder) ?? ''}`,
      })
    }
    // ONE IN-FLIGHT COMMIT IDENTITY BINDS ONE CANONICAL INTENT, from
    // the instant the commit is in flight. An exact concurrent replay
    // joins the one underlying operation; a different intent wearing
    // the in-flight identity is refused with NO participant staging.
    const inFlight = this.#inFlightByCommit.get(commit_id)
    if (inFlight !== undefined) {
      if (inFlight.canonical === canonical) return inFlight.outcome
      return Promise.resolve({
        ok: false,
        reason: 'conflicting_replay',
        detail: `finalization did not commit: identity ${commit_id} is already in flight with a different logical intent`,
      })
    }
    // Claim the generation when it is free. A COMPETING commit on a
    // claimed generation still stages invisibly — that is what staging
    // is for — and is refused at the publication gate, where nothing
    // can interleave before the marker.
    if (!this.#inFlightByGeneration.has(holder)) {
      this.#inFlightByGeneration.set(holder, commit_id)
    }
    const outcome = this.#run(commit, canonical, commit_id, holder)
    this.#inFlightByCommit.set(commit_id, { canonical, outcome })
    return outcome
  }

  async #run(
    commit: FinalizationCommit,
    canonical: string,
    commit_id: string,
    holder: string,
  ): Promise<CommitOutcome> {
    try {
      return await this.#attempt(commit, canonical, commit_id, holder)
    } finally {
      // Retire only what THIS operation still owns. After a successful
      // publish the persistent authority was established in the same
      // synchronous section as the marker, so releasing the in-flight
      // claim here opens no FREE window; after a pre-publication
      // failure the release is what lets a legitimate retry proceed.
      // The guard keeps a newer owner's claim untouched.
      if (this.#inFlightByGeneration.get(holder) === commit_id) {
        this.#inFlightByGeneration.delete(holder)
      }
      this.#inFlightByCommit.delete(commit_id)
    }
  }

  async #attempt(
    commit: FinalizationCommit,
    canonical: string,
    commit_id: string,
    holder: string,
  ): Promise<CommitOutcome> {
    const { journal, events, evidence, visibility, lease } = this.#participants
    const fence = { run_id: commit.run_id, generation: commit.generation }
    const staged: StagedWrite[] = []

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
    // ---- GENERATION GATE, SYNCHRONOUS WITH THE MARKER ------------
    // One in-flight generation has ONE terminal transaction. The claim
    // was taken at entry when free; here — where nothing can
    // interleave before the marker — it is verified or retaken: a
    // competing commit that staged invisibly is refused before it can
    // become a second terminal, a generation another commit already
    // finalized refuses the same way, and a claim released by a failed
    // predecessor is retaken so a legitimate retry proceeds.
    if (this.#finalized.has(holder)) {
      abandon()
      return {
        ok: false,
        reason: 'already_committed',
        detail: `finalization did not commit: generation ${String(commit.generation)} of run ${commit.run_id} already published commit ${this.#finalized.get(holder) ?? ''}`,
      }
    }
    const owner = this.#inFlightByGeneration.get(holder)
    if (owner !== undefined && owner !== commit_id) {
      abandon()
      return {
        ok: false,
        reason: 'already_committed',
        detail: `finalization did not commit: generation ${String(commit.generation)} of run ${commit.run_id} is being finalized by commit ${owner}`,
      }
    }
    if (owner === undefined) this.#inFlightByGeneration.set(holder, commit_id)

    // THE LAST CHECK, SYNCHRONOUS WITH THE PUBLICATION IT GUARDS.
    // Nothing can interleave between this answer and the marker, so
    // either the commit publishes inside its budget or it publishes
    // nothing — the write-side twin of the lease's abandoned attempt.
    if (TransactionalFinalization.#expired(commit)) {
      abandon()
      return TransactionalFinalization.#expiredOutcome(commit, 'the commit marker')
    }

    // ---- PUBLISH -------------------------------------------------
    // THE ENTIRE COMMIT, IN ONE MUTATION — and the persistent
    // authority in the SAME synchronous section, so the state
    // transition is IN_FLIGHT(X) → PUBLISHED(X) with no FREE interval
    // in which another commit could enter.
    //
    // Not a loop over participants: a set insertion. Before this line
    // every staged record is invisible to every reader; after it, all of
    // them are readable. There is no sequence for an observer to catch
    // half-done and no participant call that could throw partway.
    visibility.publish(commit_id)
    this.#finalized.set(holder, commit_id)
    this.#intents.set(commit_id, canonical)
    return { ok: true }
  }
}
