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
  JournaledAcquisition,
  JournaledHold,
  JournaledState,
  LeaseClaim,
  RejectionEntry,
  RunJournalPort,
  RunLeasePort,
  RunScoped,
  TransitionEntry,
} from '../ports/index.js'

interface JournalPages {
  transitions: TransitionEntry[]
  rejections: RejectionEntry[]
  acquisitions: JournaledAcquisition[]
  held?: JournaledHold
}

export class InMemoryRunJournal implements RunJournalPort {
  readonly #pages = new Map<string, JournalPages>()

  #page(run_id: string): JournalPages {
    const existing = this.#pages.get(run_id)
    if (existing !== undefined) return existing
    const page: JournalPages = { transitions: [], rejections: [], acquisitions: [] }
    this.#pages.set(run_id, page)
    return page
  }

  appendTransition(request: RunScoped & { readonly transition: TransitionEntry }): Promise<void> {
    const page = this.#page(request.run_id)
    page.transitions.push(request.transition)
    // A run that moves is no longer held. Leaving a stale hold would
    // advertise a pending run that has since gone somewhere else.
    delete page.held
    return Promise.resolve()
  }

  appendRejection(request: RunScoped & { readonly rejection: RejectionEntry }): Promise<void> {
    this.#page(request.run_id).rejections.push(request.rejection)
    return Promise.resolve()
  }

  appendAcquisition(
    request: RunScoped & { readonly acquisition: JournaledAcquisition },
  ): Promise<void> {
    this.#page(request.run_id).acquisitions.push(request.acquisition)
    return Promise.resolve()
  }

  appendHold(request: RunScoped & { readonly hold: JournaledHold }): Promise<void> {
    this.#page(request.run_id).held = request.hold
    return Promise.resolve()
  }

  mark(request: RunScoped): Promise<string> {
    return Promise.resolve(String(this.#page(request.run_id).transitions.length))
  }

  /**
   * Rewind this run's transitions to the mark, leaving everything that
   * preceded the attempt.
   *
   * Scoped to the ATTEMPT, not the run. Clearing everything a run ever
   * journaled is wrong the moment a run is attempted twice: a later
   * attempt's rollback would erase an earlier attempt's committed
   * terminal, turning a failure into data loss.
   */
  retractTo(request: RunScoped & { readonly token: string }): Promise<void> {
    const page = this.#pages.get(request.run_id)
    if (page !== undefined) {
      const keep = Number(request.token)
      if (Number.isInteger(keep) && keep >= 0) page.transitions = page.transitions.slice(0, keep)
    }
    return Promise.resolve()
  }

  readCurrentState(request: RunScoped): Promise<JournaledState | undefined> {
    const page = this.#pages.get(request.run_id)
    if (page === undefined) return Promise.resolve(undefined)
    const last = page.transitions.at(-1)
    return Promise.resolve({
      run_id: request.run_id,
      state: last?.to ?? 'REQUESTED',
      transitions: page.transitions,
      rejections: page.rejections,
      acquisitions: page.acquisitions,
      ...(page.held === undefined ? {} : { held: page.held }),
    })
  }
}

export class InMemoryRunLease implements RunLeasePort {
  readonly #held = new Map<string, number>()
  #generation = 0

  claim(request: RunScoped): Promise<LeaseClaim> {
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

  /** Test seam: forcibly move the lease on, simulating a lost lease. */
  steal(run_id: string): number {
    this.#generation += 1
    this.#held.set(run_id, this.#generation)
    return this.#generation
  }
}
