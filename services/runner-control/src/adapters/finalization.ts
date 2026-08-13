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
  EventSinkPort,
  EvidenceSinkPort,
  FinalizationCommit,
  FinalizationPort,
  RunJournalPort,
  StagedWrite,
} from '../ports/index.js'

export interface CommitParticipants {
  readonly journal: RunJournalPort
  readonly events: EventSinkPort
  readonly evidence: EvidenceSinkPort
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class TransactionalFinalization implements FinalizationPort {
  readonly #participants: CommitParticipants

  constructor(participants: CommitParticipants) {
    this.#participants = participants
  }

  async commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    const { journal, events, evidence } = this.#participants
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
        () => journal.stageTransitions({ ...fence, transitions: commit.transitions }),
      ],
      ['terminal event', () => events.stageEmit({ ...fence, event: commit.event })],
      [
        'sealed bundle',
        () => evidence.stageWrite({ ...fence, kind: 'evidence_bundle', bundle: commit.bundle }),
      ],
    ]

    for (const [what, prepare] of preparations) {
      let outcome
      try {
        outcome = (await prepare()) as
          { ok: true; staged: StagedWrite } | { ok: false; reason?: 'stale_fence'; detail: string }
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
    }

    // ---- PUBLISH -------------------------------------------------
    // NO `await` BELOW THIS LINE. Adding one would let the event loop
    // run between two publications and reintroduce exactly the partial
    // visibility this design exists to remove.
    for (const write of staged) write.publish()
    return { ok: true }
  }
}
