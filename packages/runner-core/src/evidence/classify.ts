/**
 * Outcome classification for evidence-establishment failure (requirement
 * "A failure to establish evidence is never success"; INV-003, ADV-011).
 * No output of this module classifies as success, structurally: refusals
 * map to REFUSED, reported environmental faults to OPERATIONAL_FAILURE,
 * and a terminal state that cannot be established to INDETERMINATE —
 * which the shared TERMINAL_SUCCESS authority already fixes as failure.
 */
import type { RunOutcomeT } from '@secure-home/events'
import type { OperationalFailure, Refusal } from '../decision/index.js'

export const classifyEvidenceFailure = (failure: Refusal | OperationalFailure): RunOutcomeT =>
  failure.kind === 'refusal'
    ? {
        terminal_state: 'REFUSED',
        failure: {
          class: 'contract_refusal',
          detail: `${failure.code}: ${failure.violated.element} — ${failure.detail}`,
        },
      }
    : {
        terminal_state: 'OPERATIONAL_FAILURE',
        failure: { class: 'operational', detail: `${failure.source}: ${failure.detail}` },
      }

/** The fail-closed classification when no terminal state can be established. */
export const indeterminateOutcome = (detail: string): RunOutcomeT => ({
  terminal_state: 'INDETERMINATE',
  detail,
})
