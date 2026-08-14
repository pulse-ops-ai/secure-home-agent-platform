/**
 * THE ONE JOURNAL OUTBOX.
 *
 * The durable journal records four categories of fact — transitions,
 * rejections, acquisitions, holds — and the pre-seal gate promises that
 * NONE of them is still pending when evidence seals. That promise kept
 * failing one category at a time: the gate checked transitions, then a
 * rejection stayed pending outside it; the gate learned rejections, and
 * acquisitions and holds were still written directly at their call
 * sites, where a fault either vanished the fact or killed the run.
 *
 * The lesson is that category-specific tracking keeps leaving the next
 * category outside the proof. So there is one outbox: every journal
 * fact of every category enters it, one flush drains it in the order
 * facts occurred, a fault leaves the entry pending for retry, and the
 * seal gate asks one question — is the outbox empty — that cannot be
 * asked per-category. A category added later joins the gate by
 * existing, because there is nowhere else for it to go.
 */
import type { RejectionEntry, RunMachine, TransitionEntry } from '../lifecycle/index.js'
import type { JournaledAcquisition, JournaledHold } from '../ports/index.js'

export type OutboxEntry =
  | { readonly category: 'transition'; readonly transition: TransitionEntry }
  | { readonly category: 'rejection'; readonly rejection: RejectionEntry }
  | { readonly category: 'acquisition'; readonly acquisition: JournaledAcquisition }
  | { readonly category: 'hold'; readonly hold: JournaledHold }

export class JournalOutbox {
  readonly #pending: OutboxEntry[] = []

  /**
   * Pull everything the machine has recorded since the last drain.
   *
   * The machine's cursor is advanced immediately: from here the OUTBOX
   * owns durability tracking, and the machine's "journaled" means
   * "handed to the outbox". The lossless-retry property moves with the
   * entries — an append that faults leaves its entry pending HERE.
   */
  drainMachine(machine: RunMachine): void {
    const pending = machine.pendingJournal()
    for (const transition of pending.transitions) {
      this.#pending.push({ category: 'transition', transition })
    }
    for (const rejection of pending.rejections) {
      this.#pending.push({ category: 'rejection', rejection })
    }
    machine.confirmJournaled(pending.transitions.length, pending.rejections.length)
  }

  /** Enqueue an orchestration-recorded fact (acquisition or hold). */
  record(entry: OutboxEntry): void {
    this.#pending.push(entry)
  }

  /** The oldest unlanded fact, or undefined when the record is complete. */
  head(): OutboxEntry | undefined {
    return this.#pending[0]
  }

  /** The head landed durably; remove it. */
  landed(): void {
    this.#pending.shift()
  }

  /**
   * Whether every recorded fact, of every category, has landed.
   *
   * THE SEAL GATE'S ONE QUESTION. Deriving it from the single queue is
   * what makes "every category" true by construction instead of by
   * enumeration.
   */
  isEmpty(): boolean {
    return this.#pending.length === 0
  }
}
