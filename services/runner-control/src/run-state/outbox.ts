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

/** One journal fact, by category, before it is given its identity. */
export type OutboxFact =
  | { readonly category: 'transition'; readonly transition: TransitionEntry }
  | { readonly category: 'rejection'; readonly rejection: RejectionEntry }
  | { readonly category: 'acquisition'; readonly acquisition: JournaledAcquisition }
  | { readonly category: 'hold'; readonly hold: JournaledHold }

/**
 * A fact plus its STABLE, CALLER-KNOWN identity.
 *
 * The identity is minted when the fact is RECORDED, not when it is
 * appended — so every retry of the same fact presents the same identity,
 * and a journal whose first append landed while its acknowledgement was
 * lost can recognise the retry as a replay instead of a second fact.
 * One physical fact, one durable fact, however many acknowledgements it
 * takes.
 */
export type OutboxEntry = OutboxFact & { readonly entry_id: string }

export class JournalOutbox {
  readonly #pending: OutboxEntry[] = []
  readonly #prefix: string
  #minted = 0

  /** `prefix` scopes identities to one run and one ownership generation. */
  constructor(prefix: string) {
    this.#prefix = prefix
  }

  #mint(): string {
    this.#minted += 1
    return `${this.#prefix}#j${String(this.#minted)}`
  }

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
      this.#pending.push({ entry_id: this.#mint(), category: 'transition', transition })
    }
    for (const rejection of pending.rejections) {
      this.#pending.push({ entry_id: this.#mint(), category: 'rejection', rejection })
    }
    machine.confirmJournaled(pending.transitions.length, pending.rejections.length)
  }

  /** Enqueue an orchestration-recorded fact (acquisition or hold). */
  record(fact: OutboxFact): void {
    this.#pending.push({ entry_id: this.#mint(), ...fact })
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
