/**
 * One disposition per gate identity, and the single place a report
 * becomes a disposition (design D6; INV-016).
 *
 * Two rules live here, and nowhere else in the service:
 *
 *  - **The mapping is fixed at this boundary.** A toolchain-unavailable
 *    report becomes `SKIP_ENV`, a truncation becomes `FAIL` carrying the
 *    reason, a declared skip becomes `SKIP_OK`. Because this is the only
 *    mapping site, "renormalized downstream" has no site to happen at —
 *    an aggregator sees a disposition that was already decided, and
 *    `SKIP_ENV` never quietly becomes `SKIP_OK` on its way to evidence.
 *
 *  - **A second terminal disposition fails closed.** Recording twice for
 *    one identity is a duplication error naming the gate; the FIRST
 *    disposition is preserved. Last-write-wins would let a retry
 *    overwrite a failure, which is precisely the outcome a verification
 *    gate exists to prevent.
 *
 * An environmental fault is not a disposition at all. It is reported back
 * so the run can terminate operationally — a gate that could not be run
 * has not passed, and inventing a disposition for it would be a lie the
 * evidence bundle would then carry.
 */
import type { GateOutcomeT, GateResultsT } from '@secure-home/contracts'
import type { GateReport } from '../ports/index.js'

export const toDisposition = (report: GateReport): GateOutcomeT | undefined => {
  switch (report.outcome) {
    case 'passed':
      return { disposition: 'PASS', truncated: false }
    case 'failed':
      return { disposition: 'FAIL', truncated: report.truncated, reason: report.reason }
    case 'declared_skip':
      return { disposition: 'SKIP_OK', truncated: false, reason: report.reason }
    case 'toolchain_unavailable':
      return { disposition: 'SKIP_ENV', truncated: false, reason: report.reason }
    case 'environmental_fault':
      return undefined
    // Neither is a stale fence. A gate the run was not permitted to
    // execute has no disposition at all — inventing one would record a
    // verdict for work that never ran, on behalf of a caller that no
    // longer owns the run.
    case 'stale_fence':
      return undefined
  }
}

export const DISPOSITION_ERRORS = ['duplicate_disposition', 'gate_not_scheduled'] as const
export type DispositionErrorKind = (typeof DISPOSITION_ERRORS)[number]

export interface DispositionError {
  readonly kind: DispositionErrorKind
  readonly gate_id: string
  readonly detail: string
}

export type RecordOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: DispositionError }

/** A keyed recorder over exactly the scheduled identities. */
export class DispositionRecorder {
  readonly #scheduled: ReadonlySet<string>
  readonly #results = new Map<string, GateOutcomeT>()

  constructor(scheduled: readonly string[]) {
    this.#scheduled = new Set(scheduled)
  }

  get outstanding(): readonly string[] {
    return [...this.#scheduled].filter((id) => !this.#results.has(id))
  }

  record(gate_id: string, outcome: GateOutcomeT): RecordOutcome {
    if (!this.#scheduled.has(gate_id)) {
      return {
        ok: false,
        error: {
          kind: 'gate_not_scheduled',
          gate_id,
          detail: `${gate_id} was not scheduled for this run; an unscheduled result is never recorded`,
        },
      }
    }
    const existing = this.#results.get(gate_id)
    if (existing !== undefined) {
      return {
        ok: false,
        error: {
          kind: 'duplicate_disposition',
          gate_id,
          detail: `${gate_id} already has the terminal disposition ${existing.disposition}; the first is preserved`,
        },
      }
    }
    this.#results.set(gate_id, outcome)
    return { ok: true }
  }

  /** The recorded results, in the L2 result-set shape. */
  results(): GateResultsT {
    return Object.fromEntries(this.#results)
  }
}
