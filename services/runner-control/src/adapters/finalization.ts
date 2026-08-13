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

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class TransactionalFinalization implements FinalizationPort {
  readonly #participants: CommitParticipants

  constructor(participants: CommitParticipants) {
    this.#participants = participants
  }

  async commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    const { journal, events, evidence } = this.#participants
    const scoped = { run_id: commit.run_id }
    // The fence travels with every write this transaction makes. It is
    // NOT checked once up front: ownership can move between the mark and
    // the seal, and a transaction that validated the fence and then wrote
    // three times would have exactly the window the fence exists to close.
    const fence = { run_id: commit.run_id, generation: commit.generation }

    // MARK EVERY PARTICIPANT FIRST.
    //
    // Registering a rollback only after a write returned left three
    // holes: a tail that failed part way through was already partly
    // written, a sink that landed a write and then reported failure kept
    // it, and the evidence write — the last and most consequential —
    // had no rollback registered at all. A mark taken before anything is
    // attempted has none of those cases, because it does not depend on
    // any write having succeeded.
    let marks: { journal: string; events: string; evidence: string }
    try {
      marks = {
        journal: await journal.mark(scoped),
        events: await events.mark(scoped),
        evidence: await evidence.mark(scoped),
      }
    } catch (error) {
      return {
        ok: false,
        detail: `finalization could not begin: a participant could not be marked: ${describe(error)}`,
      }
    }

    const rollback = async (why: string, stale = false): Promise<CommitOutcome> => {
      const failures: string[] = []
      // Reverse of the apply order, so the seal is undone first.
      for (const [participant, token] of [
        [evidence, marks.evidence],
        [events, marks.events],
        [journal, marks.journal],
      ] as const) {
        try {
          const retracted = await participant.retractTo({ ...fence, token })
          // A retraction the fence refuses is not a rollback failure to
          // paper over: it means this caller may no longer touch that
          // participant at all. Reported, because a partially unwound
          // commit is a state the caller has to know it is in.
          if (!retracted.ok) failures.push(retracted.detail)
        } catch (error) {
          failures.push(describe(error))
        }
      }
      return {
        ok: false,
        ...(stale ? { reason: 'stale_fence' as const } : {}),
        detail:
          failures.length === 0
            ? `finalization did not commit: ${why}`
            : `finalization did not commit: ${why}; and the rollback did not fully unwind: ${failures.join('; ')}`,
      }
    }

    try {
      for (const transition of commit.transitions) {
        const appended = await journal.appendTransition({ ...fence, transition })
        if (!appended.ok) return await rollback(appended.detail, true)
      }
      const emitted = await events.emit({ ...fence, event: commit.event })
      if (!emitted.ok) return await rollback(emitted.detail, true)
      // LAST: the seal is the run's final write.
      const sealed = await evidence.write({
        ...fence,
        kind: 'evidence_bundle',
        bundle: commit.bundle,
      })
      if (!sealed.ok) return await rollback(sealed.detail, true)
      return { ok: true }
    } catch (error) {
      return await rollback(describe(error))
    }
  }
}
