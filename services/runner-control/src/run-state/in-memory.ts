/**
 * In-memory journal and lease implementations.
 *
 * Deterministic and keyed by `run_id` throughout — a single instance of
 * either may be shared by concurrent runs, and unkeyed per-run state here
 * is the defect the cross-run isolation requirement forbids (RO-INV-10).
 *
 * These are the only implementations this landing ships. A durable store
 * is U11's; nothing here writes to disk, opens a connection, or spawns
 * anything.
 */
import type {
  FenceOutcome,
  JournaledAcquisition,
  JournaledHold,
  JournaledState,
  LeaseClaim,
  LeaseClaimRequest,
  RejectionEntry,
  RunFence,
  RunJournalPort,
  RunLeasePort,
  RunScoped,
  Staging,
  TransitionEntry,
} from '../ports/index.js'
import { FenceLedger } from './fence.js'
import { SEIZE } from './seize.js'
import { CommitLedger, isVisible } from './visibility.js'
import type { CommitVisibility } from '../ports/finalization.js'

/** A transition, plus the commit that must be published to see it. */
interface StoredTransition {
  readonly entry: TransitionEntry
  readonly commit_id?: string
}

interface JournalPages {
  transitions: StoredTransition[]
  rejections: RejectionEntry[]
  acquisitions: JournaledAcquisition[]
  held?: JournaledHold
}

export class InMemoryRunJournal implements RunJournalPort {
  readonly #pages = new Map<string, JournalPages>()
  readonly #fence = new FenceLedger()
  readonly #visibility: CommitVisibility

  /**
   * The visibility authority is INJECTED and shared with the other
   * finalization participants. A journal holding its own would publish
   * commits nobody else could see, which is three transactions wearing
   * one commit id.
   */
  constructor(visibility: CommitVisibility = new CommitLedger()) {
    this.#visibility = visibility
  }

  #page(run_id: string): JournalPages {
    const existing = this.#pages.get(run_id)
    if (existing !== undefined) return existing
    const page: JournalPages = { transitions: [], rejections: [], acquisitions: [] }
    this.#pages.set(run_id, page)
    return page
  }

  appendTransition(
    request: RunFence & { readonly transition: TransitionEntry },
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    // Checked BEFORE the page is even created: a stale holder must not
    // be able to bring a journal into existence for a run it lost.
    if (!refused.ok) return Promise.resolve(refused)
    const page = this.#page(request.run_id)
    // No commit id: an ordinary append is visible on its own account.
    page.transitions.push({ entry: request.transition })
    // A run that moves is no longer held. Leaving a stale hold would
    // advertise a pending run that has since gone somewhere else.
    delete page.held
    return Promise.resolve(refused)
  }

  appendRejection(
    request: RunFence & { readonly rejection: RejectionEntry },
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    if (!refused.ok) return Promise.resolve(refused)
    this.#page(request.run_id).rejections.push(request.rejection)
    return Promise.resolve(refused)
  }

  appendAcquisition(
    request: RunFence & { readonly acquisition: JournaledAcquisition },
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    if (!refused.ok) return Promise.resolve(refused)
    this.#page(request.run_id).acquisitions.push(request.acquisition)
    return Promise.resolve(refused)
  }

  appendHold(request: RunFence & { readonly hold: JournaledHold }): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    if (!refused.ok) return Promise.resolve(refused)
    this.#page(request.run_id).held = request.hold
    return Promise.resolve(refused)
  }

  /**
   * Prepare the terminal tail without making it observable.
   *
   * The entries are copied into a private array and appended only when
   * `publish` is called. `readCurrentState` therefore sees the run
   * exactly as it was until the whole commit publishes — there is no
   * instant at which the journal says a run sealed and no bundle exists.
   */
  /**
   * Record the terminal tail against `commit_id`, invisibly.
   *
   * The entries go into the page immediately — and stay unreadable,
   * because `readCurrentState` skips any record whose commit is
   * unpublished. Storing them now is what lets publication be a single
   * set insertion later, with no participant asked to do anything.
   */
  stageTransitions(
    request: RunFence & {
      readonly commit_id: string
      readonly transitions: readonly TransitionEntry[]
    },
  ): Promise<Staging> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    const commit_id = request.commit_id
    const page = this.#page(request.run_id)
    const staged = request.transitions.map((entry) => ({ entry, commit_id }))
    page.transitions.push(...staged)
    return Promise.resolve({
      ok: true,
      staged: {
        commitId: commit_id,
        abandon: () => {
          page.transitions = page.transitions.filter((row) => row.commit_id !== commit_id)
        },
      },
    })
  }

  readCurrentState(request: RunScoped): Promise<JournaledState | undefined> {
    const page = this.#pages.get(request.run_id)
    if (page === undefined) return Promise.resolve(undefined)
    // THE READER IGNORES UNPUBLISHED RECORDS. This is the other half of
    // the commit marker: staging may put rows in the page, but until
    // their commit is published no reader can tell they are there.
    const transitions = page.transitions
      .filter((row) => isVisible(this.#visibility, row.commit_id))
      .map((row) => row.entry)
    const empty =
      transitions.length === 0 &&
      page.rejections.length === 0 &&
      page.acquisitions.length === 0 &&
      page.held === undefined
    // A page holding only staged rows is not a journal yet. Reporting one
    // would turn "this run has no journal" into "this run has an empty
    // journal", which is a smaller lie but still an observable one.
    if (empty) return Promise.resolve(undefined)
    const last = transitions.at(-1)
    return Promise.resolve({
      run_id: request.run_id,
      state: last?.to ?? 'REQUESTED',
      transitions,
      rejections: page.rejections,
      acquisitions: page.acquisitions,
      ...(page.held === undefined ? {} : { held: page.held }),
    })
  }
}

export class InMemoryRunLease implements RunLeasePort {
  readonly #held = new Map<string, number>()
  #generation = 0

  claim(request: LeaseClaimRequest): Promise<LeaseClaim> {
    if (request.signal.aborted) {
      return Promise.resolve({
        ok: false,
        reason: 'claim_aborted',
        detail: `claim attempt ${request.attempt_id} was aborted before ownership was granted`,
      })
    }
    const holder = this.#held.get(request.run_id)
    if (holder !== undefined) {
      return Promise.resolve({
        ok: false,
        reason: 'already_leased',
        detail: `run ${request.run_id} is already leased at generation ${String(holder)}`,
      })
    }
    this.#generation += 1
    this.#held.set(request.run_id, this.#generation)
    return Promise.resolve({ ok: true, generation: this.#generation })
  }

  renew(request: RunScoped & { readonly generation: number }): Promise<boolean> {
    return Promise.resolve(this.#held.get(request.run_id) === request.generation)
  }

  release(request: RunScoped & { readonly generation: number }): Promise<void> {
    // Only the CURRENT holder may release. A stale generation releasing
    // would hand the run to a third party while its real owner still
    // believed it held the lease.
    if (this.#held.get(request.run_id) === request.generation) this.#held.delete(request.run_id)
    return Promise.resolve()
  }

  /**
   * Move the lease on, as a competing holder claiming an already-held
   * run would.
   *
   * NOT a method. `steal()` was `claim()` with the refusal removed —
   * seize any run by id, no claim, no generation to present, no fence —
   * declared in production source and exported from the package root.
   * A capability that dispossesses the legitimate owner is authority no
   * composition granted, and calling it a test seam does not change what
   * it is: tests are its main consumer, which is the argument for
   * keeping it OUT of the shipped surface, not for shipping it.
   *
   * It lives in `testing-fixtures.ts` now, which is excluded from the
   * package's exports, using the same private state through a symbol
   * this class publishes to nobody.
   */
  [SEIZE](run_id: string): number {
    this.#generation += 1
    this.#held.set(run_id, this.#generation)
    return this.#generation
  }
}
