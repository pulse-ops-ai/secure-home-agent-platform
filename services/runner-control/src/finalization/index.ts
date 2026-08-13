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
import type { EvidenceSinkPort } from '../ports/index.js'

export const WRITE_KINDS = ['event', 'artifact', 'transition', 'seal'] as const
export type WriteKind = (typeof WRITE_KINDS)[number]

export interface WriteEntry {
  readonly run_id: string
  readonly kind: WriteKind
  readonly label: string
}

export type SealResult =
  | { readonly ok: true; readonly sequence: readonly WriteEntry[] }
  | {
      readonly ok: false
      readonly refused: 'outstanding_writes' | 'not_eligible' | 'already_sealed' | 'sink_failed'
      readonly detail: string
    }

/**
 * One run's write ledger. Submissions are recorded in order; the seal is
 * admitted only when nothing else of this run is still outstanding.
 */
export class FinalizationLedger {
  readonly #runId: string
  readonly #sink: EvidenceSinkPort
  readonly #sequence: WriteEntry[] = []
  #outstanding = 0
  #sealed = false

  constructor(runId: string, sink: EvidenceSinkPort) {
    this.#runId = runId
    this.#sink = sink
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

  async seal(inputs: SealInputs): Promise<SealResult> {
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
    try {
      await this.#sink.write({
        run_id: this.#runId,
        kind: 'evidence_bundle',
        bundle: eligibility.value.bundle,
      })
    } catch (error) {
      return {
        ok: false,
        refused: 'sink_failed',
        detail: error instanceof Error ? error.message : String(error),
      }
    }
    this.#sealed = true
    this.#sequence.push({ run_id: this.#runId, kind: 'seal', label: 'evidence_bundle' })
    return { ok: true, sequence: this.#sequence }
  }
}
