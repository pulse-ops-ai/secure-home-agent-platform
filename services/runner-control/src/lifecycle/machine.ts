/**
 * The total transition function and the run's single writer (design
 * D1/D10).
 *
 * Two properties live here and nowhere else:
 *
 *  - **Totality.** `(state, kind)` either names a declared transition or
 *    produces a RECORDED rejection. There is no third outcome: no
 *    silent ignore, no nearest-legal-state coercion, no thrown error that
 *    a caller could swallow. A rejection returns the unchanged state, so
 *    a caller that ignores the result still cannot corrupt the run.
 *
 *  - **One writer.** Advancing requires a claim token, and the machine
 *    issues a token that is valid only against the version it was taken
 *    at. Concurrent attempts therefore serialize by construction: the
 *    first to apply wins, and every loser is a recorded rejection rather
 *    than an interleaving. This is the per-run half of D10; the machine
 *    holds state for exactly one run and is never shared between runs.
 */
import type { ClockPort } from '../ports/index.js'
import { isTerminal, type LifecycleState } from './states.js'
import {
  declaredNext,
  TRANSITIONS,
  type TransitionKind,
  type TransitionTable,
} from './transitions.js'

export interface TransitionEntry {
  readonly run_id: string
  readonly from: LifecycleState
  readonly to: LifecycleState
  readonly kind: TransitionKind
  readonly cause: string
  readonly at: string
}

export const REJECTION_REASONS = [
  'undeclared_transition',
  'terminal_state',
  'stale_writer',
  'precondition_unmet',
  'foreign_claim',
] as const
export type RejectionReason = (typeof REJECTION_REASONS)[number]

export interface RejectionEntry {
  readonly run_id: string
  readonly state: LifecycleState
  readonly attempted: TransitionKind
  readonly reason: RejectionReason
  readonly detail: string
  readonly at: string
}

/**
 * A projection this machine minted, and the only thing it will commit.
 *
 * Opaque on purpose: the entries are carried INSIDE it, so a caller
 * cannot substitute a different list for a capability it legitimately
 * holds. Held in a private set rather than validated by shape, because
 * shape is forgeable and identity is not.
 */
export interface CommitCapability {
  readonly entries: readonly TransitionEntry[]
}

export type TransitionResult =
  | { readonly kind: 'advanced'; readonly state: LifecycleState; readonly entry: TransitionEntry }
  | { readonly kind: 'rejected'; readonly state: LifecycleState; readonly entry: RejectionEntry }

/** A capability to attempt exactly one advance, bound to a version. */
export interface WriteClaim {
  readonly run_id: string
  readonly version: number
}

export class RunMachine {
  readonly #runId: string
  readonly #clock: ClockPort
  readonly #table: TransitionTable
  readonly #transitions: TransitionEntry[] = []
  readonly #rejections: RejectionEntry[] = []
  #state: LifecycleState = 'REQUESTED'
  #version = 0
  #journaledTransitions = 0
  /** Projections minted by this machine and not yet committed. */
  readonly #projections = new Set<CommitCapability>()
  #journaledRejections = 0

  /**
   * The transition table is a CONSTRUCTOR PARAMETER, not a module-level
   * constant this class reaches for. That makes "the walk is driven by
   * the declared table" a testable claim rather than an assertion: a
   * proof can delete one transition and observe that the effects
   * downstream of it stop happening. A machine that merely recorded
   * would pass such a test while the orchestration ran on.
   */
  constructor(runId: string, clock: ClockPort, table: TransitionTable = TRANSITIONS) {
    this.#runId = runId
    this.#clock = clock
    this.#table = table
  }

  get runId(): string {
    return this.#runId
  }

  get state(): LifecycleState {
    return this.#state
  }

  /** Every declared transition this run actually took, in order (D9). */
  get transitionRecord(): readonly TransitionEntry[] {
    return this.#transitions
  }

  /** Every rejected attempt. A rejection is evidence, not an error. */
  get rejections(): readonly RejectionEntry[] {
    return this.#rejections
  }

  /**
   * Whether the machine WOULD accept this transition now — a pure query
   * that changes nothing.
   *
   * The engine gates a phase's effects on the previous phase's
   * transition, which covers every reversible boundary. It cannot cover
   * an effect that is itself irreversible and earns its transition
   * afterwards: the seal write. Asking first is not a second state
   * machine — it is declining to perform an irreversible act the
   * authority has already said it will not honour.
   */
  permits(kind: TransitionKind): boolean {
    return !isTerminal(this.#state) && declaredNext(this.#table, this.#state, kind) !== undefined
  }

  /**
   * Entries recorded since the last drain, and mark them drained.
   *
   * The machine does not write the journal — advancing is synchronous
   * and a durable append is not. It reports what is outstanding, and the
   * orchestration appends it at the next await point, which is the
   * moment the transition was taken. Batching would defeat the purpose:
   * a run that dies mid-walk must leave behind what actually happened.
   */
  pendingJournal(): {
    readonly transitions: readonly TransitionEntry[]
    readonly rejections: readonly RejectionEntry[]
  } {
    return {
      transitions: this.#transitions.slice(this.#journaledTransitions),
      rejections: this.#rejections.slice(this.#journaledRejections),
    }
  }

  /**
   * Confirm that `transitions` and `rejections` entries were durably
   * appended.
   *
   * Separate from reading them, because advancing the cursor before the
   * append succeeded LOSES the entry: a rejected append would leave it
   * outside the retry set permanently, and the durable record would be
   * missing a transition that happened. The cursor moves only for what
   * actually landed.
   */
  confirmJournaled(transitions: number, rejections: number): void {
    this.#journaledTransitions += transitions
    this.#journaledRejections += rejections
  }

  /** Take the write capability as of the current version. */
  claim(): WriteClaim {
    return { run_id: this.#runId, version: this.#version }
  }

  #reject(attempted: TransitionKind, reason: RejectionReason, detail: string): TransitionResult {
    const entry: RejectionEntry = {
      run_id: this.#runId,
      state: this.#state,
      attempted,
      reason,
      detail,
      at: this.#clock.now({ run_id: this.#runId }),
    }
    this.#rejections.push(entry)
    return { kind: 'rejected', state: this.#state, entry }
  }

  apply(claim: WriteClaim, kind: TransitionKind, cause: string): TransitionResult {
    // The claim carries a run id; checking only the version let a
    // same-version claim minted for a DIFFERENT run advance this one.
    // A machine belongs to exactly one run, so a foreign claim is not a
    // stale writer — it is not a writer here at all.
    if (claim.run_id !== this.#runId) {
      return this.#reject(
        kind,
        'foreign_claim',
        `the claim was taken for run ${claim.run_id}; this machine advances run ${this.#runId}`,
      )
    }
    if (claim.version !== this.#version) {
      return this.#reject(
        kind,
        'stale_writer',
        `the run advanced to version ${String(this.#version)} after this claim was taken at ${String(claim.version)}`,
      )
    }
    if (isTerminal(this.#state)) {
      return this.#reject(
        kind,
        'terminal_state',
        `${this.#state} is terminal and accepts no further transition`,
      )
    }
    const next = declaredNext(this.#table, this.#state, kind)
    if (next === undefined) {
      return this.#reject(
        kind,
        'undeclared_transition',
        `the machine declares no ${kind} transition for ${this.#state}`,
      )
    }
    const entry: TransitionEntry = {
      run_id: this.#runId,
      from: this.#state,
      to: next,
      kind,
      cause,
      at: this.#clock.now({ run_id: this.#runId }),
    }
    this.#state = next
    this.#version += 1
    this.#transitions.push(entry)
    return { kind: 'advanced', state: next, entry }
  }

  /**
   * Record that a declared transition was NOT attempted because its
   * precondition was unmet. The state is unchanged and no transition is
   * taken — this is how a run holds rather than advances or refuses.
   * Recording it is the point: a held run that left no trace would be
   * indistinguishable from one that was silently dropped.
   */
  hold(kind: TransitionKind, detail: string): TransitionResult {
    return this.#reject(kind, 'precondition_unmet', detail)
  }

  /**
   * Project a sequence of transitions WITHOUT applying it.
   *
   * Finalization has to know two things before it writes anything: that
   * the machine declares the whole terminal sequence, and exactly what
   * the journal tail will say. Projecting answers both — the entries
   * returned here are the entries `commitProjected` will record, so the
   * committed tail and the machine's record cannot drift apart.
   */
  project(steps: readonly { readonly kind: TransitionKind; readonly cause: string }[]):
    | {
        readonly ok: true
        readonly entries: readonly TransitionEntry[]
        /** The ONLY value `commitProjected` accepts — see below. */
        readonly capability: CommitCapability
      }
    | { readonly ok: false; readonly kind: TransitionKind; readonly from: LifecycleState } {
    const entries: TransitionEntry[] = []
    let state = this.#state
    for (const step of steps) {
      if (isTerminal(state)) return { ok: false, kind: step.kind, from: state }
      const next = declaredNext(this.#table, state, step.kind)
      if (next === undefined) return { ok: false, kind: step.kind, from: state }
      entries.push({
        run_id: this.#runId,
        from: state,
        to: next,
        kind: step.kind,
        cause: step.cause,
        at: this.#clock.now({ run_id: this.#runId }),
      })
      state = next
    }
    // The capability is minted HERE and nowhere else, and this machine
    // remembers it. That is what makes committed adoption a capability
    // rather than a public mutator: a caller cannot forge one, and one
    // minted by another machine is not accepted by this one.
    const capability: CommitCapability = { entries: [...entries] }
    this.#projections.add(capability)
    return { ok: true, entries, capability }
  }

  /**
   * Adopt a projection that has been COMMITTED.
   *
   * The entries are recorded verbatim rather than regenerated, so the
   * machine reflects the fact that was committed rather than a
   * re-derivation of it. They are marked journaled because the commit
   * already wrote them — re-appending would duplicate the tail.
   */
  commitProjected(capability: CommitCapability): void {
    // UNPROJECTED ENTRIES ARE REFUSED. This used to take an arbitrary
    // array and set the state, append a transition and bump the version
    // for whatever it was handed — no claim, no terminal check, no table
    // lookup — while `RunMachine` is exported from the package root. The
    // guard that "only the declared owners advance the machine" was
    // therefore a fact about this repository's source, not about the
    // class. Now the class enforces it.
    if (!this.#projections.delete(capability)) {
      throw new Error(
        'commitProjected requires a capability minted by project() on this machine; an unprojected entry list cannot advance it',
      )
    }
    for (const entry of capability.entries) {
      this.#transitions.push(entry)
      this.#state = entry.to
      this.#version += 1
    }
    // ADVANCED BY WHAT THIS COMMIT WROTE, not to the total. Assigning
    // the length marked every pending entry journaled — including an
    // append that had FAILED and was waiting for the next tick to retry
    // it. The run then completed with that transition missing from its
    // durable record, no rejection and no hold marking the gap, which is
    // precisely what `confirmJournaled` advancing incrementally exists
    // to prevent.
    this.#journaledTransitions += capability.entries.length
  }

  /** Claim and apply in one step, for the ordinary sequential path. */
  advance(kind: TransitionKind, cause: string): TransitionResult {
    return this.apply(this.claim(), kind, cause)
  }
}
