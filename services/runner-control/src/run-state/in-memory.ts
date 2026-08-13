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
  RejectionEntry,
  RunFence,
  RunJournalPort,
  RunLeasePort,
  RunScoped,
  Staging,
  TransitionEntry,
} from '../ports/index.js'
import { FenceLedger } from './fence.js'

interface JournalPages {
  transitions: TransitionEntry[]
  rejections: RejectionEntry[]
  acquisitions: JournaledAcquisition[]
  held?: JournaledHold
}

export class InMemoryRunJournal implements RunJournalPort {
  readonly #pages = new Map<string, JournalPages>()
  readonly #fence = new FenceLedger()

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
    page.transitions.push(request.transition)
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
  stageTransitions(
    request: RunFence & { readonly transitions: readonly TransitionEntry[] },
  ): Promise<Staging> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    const entries = [...request.transitions]
    const run_id = request.run_id
    return Promise.resolve({
      ok: true,
      staged: {
        publish: () => {
          // The page is created HERE, not at staging. Creating it while
          // staging would turn "this run has no journal" into "this run
          // has an empty journal" — a small change, but an observable
          // one, and staging must be observable to nobody.
          const page = this.#page(run_id)
          page.transitions.push(...entries)
          // A run that moves is no longer held.
          delete page.held
        },
        abandon: () => {
          // Nothing to do: the entries were never in the page.
        },
      },
    })
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
