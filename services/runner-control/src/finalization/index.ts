/**
 * Seal-last ordering (design D7).
 *
 * The ordering property this module owns is scoped to ONE RUN. Seal-last
 * means last among *this run's* writes — never globally last — because a
 * port implementation may be a single instance shared by concurrent runs
 * and their writes may legitimately interleave. The write ledger below is
 * therefore per run, and the recorded sequence it yields is already
 * filtered by construction (RO-INV-10, `runner-execution-boundary`).
 *
 * A pure predicate cannot enforce ordering — it cannot observe when it
 * was called. So the core decides seal ELIGIBILITY over the completed
 * inputs, and this ledger decides seal ORDER. Both must agree before a
 * seal happens: an out-of-order seal is refused and recorded even when
 * the core would have proceeded, and an ineligible seal is refused even
 * when the order is right.
 */
import { decideSealEligibility, isProceed, type SealInputs } from '@secure-home/runner-core'

export const WRITE_KINDS = ['event', 'artifact', 'transition', 'seal'] as const
export type WriteKind = (typeof WRITE_KINDS)[number]

export interface WriteEntry {
  readonly run_id: string
  readonly kind: WriteKind
  readonly label: string
}

export type SealPreparation =
  | { readonly ok: true; readonly bundle: unknown }
  | {
      readonly ok: false
      readonly refused: 'outstanding_writes' | 'not_eligible' | 'already_sealed'
      readonly detail: string
    }

/**
 * One run's write ledger. Submissions are recorded in order; the seal is
 * admitted only when nothing else of this run is still outstanding.
 */
export class FinalizationLedger {
  readonly #runId: string
  readonly #sequence: WriteEntry[] = []
  #outstanding = 0
  #sealed = false

  constructor(runId: string) {
    this.#runId = runId
  }

  /** The run's writes in submission order — already run-filtered. */
  get sequence(): readonly WriteEntry[] {
    return this.#sequence
  }

  get sealed(): boolean {
    return this.#sealed
  }

  /** Declare a write of this run pending. */
  open(kind: Exclude<WriteKind, 'seal'>, label: string): void {
    this.#outstanding += 1
    this.#sequence.push({ run_id: this.#runId, kind, label })
  }

  /** Mark a previously declared write submitted. */
  close(): void {
    if (this.#outstanding > 0) this.#outstanding -= 1
  }

  /**
   * Decide whether this run MAY seal, writing nothing.
   *
   * Both conditions are preconditions of the finalization commit rather
   * than steps inside it: the run's other writes must all be in (seal
   * ORDER, per run), and the core must find the bundle seal-eligible
   * (seal ELIGIBILITY). Refusing here costs nothing, because nothing has
   * been announced or written yet.
   */
  prepareSeal(inputs: SealInputs): SealPreparation {
    if (this.#sealed) {
      return {
        ok: false,
        refused: 'already_sealed',
        detail: `run ${this.#runId} is already sealed; a second seal is never written`,
      }
    }
    if (this.#outstanding > 0) {
      return {
        ok: false,
        refused: 'outstanding_writes',
        detail: `${String(this.#outstanding)} write(s) of run ${this.#runId} are still outstanding; the seal is not the final write`,
      }
    }
    const eligibility = decideSealEligibility(inputs)
    if (!isProceed(eligibility)) {
      return {
        ok: false,
        refused: 'not_eligible',
        detail: `${eligibility.code}: ${eligibility.detail}`,
      }
    }
    return { ok: true, bundle: eligibility.value.bundle }
  }

  /** Record that the commit made the seal durable. */
  markSealed(): void {
    this.#sealed = true
    this.#sequence.push({ run_id: this.#runId, kind: 'seal', label: 'evidence_bundle' })
  }
}
