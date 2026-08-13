/**
 * The all-or-none finalization commit over the journal, the event sink,
 * and the evidence sink.
 *
 * Apply order is journal tail → terminal event → sealed bundle. That is
 * not arbitrary: the seal must remain the run's final write, so it goes
 * last, which also means the participant most likely to reject has
 * nothing after it to undo. On any failure the applied steps are
 * retracted in reverse, so what a reader can observe is either the whole
 * finalization or none of it.
 *
 * A retraction that itself fails is reported, not swallowed — a commit
 * that half-unwound is a worse state than either outcome, and the caller
 * needs to know the run is in it.
 */
import type {
  CommitOutcome,
  EventSinkPort,
  EvidenceSinkPort,
  FinalizationCommit,
  FinalizationPort,
  RunJournalPort,
} from '../ports/index.js'

export interface CommitParticipants {
  readonly journal: RunJournalPort
  readonly events: EventSinkPort
  readonly evidence: EvidenceSinkPort
}

export class TransactionalFinalization implements FinalizationPort {
  readonly #participants: CommitParticipants

  constructor(participants: CommitParticipants) {
    this.#participants = participants
  }

  async commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    const { journal, events, evidence } = this.#participants
    const undo: (() => Promise<void>)[] = []
    const scoped = { run_id: commit.run_id }

    try {
      for (const transition of commit.transitions) {
        await journal.appendTransition({ run_id: commit.run_id, transition })
      }
      undo.push(() => journal.retractRun(scoped))

      await events.emit({ run_id: commit.run_id, event: commit.event })
      undo.push(() => events.retractRun(scoped))

      // LAST: the seal is the run's final write.
      await evidence.write({
        run_id: commit.run_id,
        kind: 'evidence_bundle',
        bundle: commit.bundle,
      })
      return { ok: true }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const failures: string[] = []
      for (const retract of undo.reverse()) {
        try {
          await retract()
        } catch (unwound) {
          failures.push(unwound instanceof Error ? unwound.message : String(unwound))
        }
      }
      return {
        ok: false,
        detail:
          failures.length === 0
            ? `finalization did not commit: ${detail}`
            : `finalization did not commit: ${detail}; and the rollback did not fully unwind: ${failures.join('; ')}`,
      }
    }
  }
}
