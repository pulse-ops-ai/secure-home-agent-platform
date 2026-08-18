/**
 * The in-memory commit-visibility authority.
 *
 * This is the whole atomicity mechanism, and it is deliberately the
 * smallest thing that could be one:
 *
 *     publish(commitId) → this.#published.add(commitId)
 *
 * One set insertion. No branch, no loop, no I/O, no call into any
 * participant, nothing that can partially succeed. Before it, every
 * record carrying that commit id is invisible to every reader; after it,
 * all of them are readable. There is no interval in between for anyone
 * to observe, because there is no second step.
 *
 * WHY THIS AND NOT THREE PUBLICATIONS. Three synchronous mutations are
 * safe against the event loop and nothing else. A participant's
 * publication can throw halfway through the sequence, and a
 * participant's publication can synchronously read another participant.
 * Neither hazard involves scheduling, so neither is removed by the
 * absence of `await`. Making finalization one mutation removes both by
 * removing the sequence.
 *
 * WHAT STAYS SEPARATE. The journal, the event stream, and the evidence
 * sink remain distinct stores with distinct ports. They share a
 * visibility marker, not a state object — which is exactly the seam a
 * durable implementation replaces with a transaction (U11).
 *
 * Records with NO commit id are visible immediately. Most of a run's
 * writes are ordinary appends that were never part of a finalization,
 * and making them wait for a commit that will never come would hide the
 * live journal the walk depends on.
 */
import type { CommitVisibility } from '../ports/finalization.js'

export class CommitLedger implements CommitVisibility {
  readonly #published = new Set<string>()

  publish(commitId: string): void {
    this.#published.add(commitId)
  }

  isPublished(commitId: string): boolean {
    return this.#published.has(commitId)
  }

  /** How many commits are visible. For proofs, never for decisions. */
  get publishedCount(): number {
    return this.#published.size
  }
}

/**
 * Whether a stored record may be read.
 *
 * `undefined` means the record was never part of a commit — an ordinary
 * append — and is visible on its own account.
 */
export const isVisible = (visibility: CommitVisibility, commitId: string | undefined): boolean =>
  commitId === undefined || visibility.isPublished(commitId)
