/**
 * Whether a provider's terminal observations CONTRADICT one another.
 *
 * WHY THIS IS A CORE DECISION AND NOT ORCHESTRATION'S. It decides
 * whether a run's terminal state can be established at all, which is a
 * trust judgement about untrusted input. `runner-execution-boundary`
 * requires trust decisions to originate in the trusted core and
 * orchestration to decide nothing; ADR-0013 decision 3 makes provider
 * terminal observations observational INPUT and gives classification to
 * the platform lifecycle. The rule previously lived as a local helper
 * inside the orchestrator — correct in substance, wrong in ownership,
 * and exactly what a provider adapter landing would have inherited.
 *
 * WHAT IT DOES NOT DO. It never names a terminal state. An adapter has
 * no way to report that a run succeeded (decision 3), and a function
 * that returned `COMPLETED` here would hand that power back through the
 * classification. It answers one question — do these observations
 * contradict each other — and the lifecycle decides what the answer
 * means for the run.
 *
 * The input is structural rather than the adapter SPI's own type: the
 * SPI is frozen in the orchestration package by ADR-0013, and the
 * dependency direction is inward only, so the core cannot import it.
 * Any observation set with these fields is classifiable.
 */

export interface TerminalObservationInput {
  readonly exit_code?: number
  /** The provider's own words about its outcome. Opaque, untrusted. */
  readonly reported_outcome?: string
  readonly transcript_terminal?: string
  readonly signalled?: string
}

/** The closed vocabulary of ways terminal observations can disagree. */
export const TERMINAL_CONFLICTS = [
  'clean_exit_with_signal',
  'success_claim_with_failure_exit',
  'transcript_contradicts_exit',
] as const
export type TerminalConflict = (typeof TERMINAL_CONFLICTS)[number]

export type TerminalClassification =
  | { readonly established: true }
  | {
      readonly established: false
      readonly conflict: TerminalConflict
      readonly detail: string
    }

const ESTABLISHED: TerminalClassification = { established: true }

export const classifyTerminalObservations = (
  observations: TerminalObservationInput,
): TerminalClassification => {
  const { exit_code, reported_outcome, signalled, transcript_terminal } = observations

  // A clean exit alongside a kill signal. The provider reported success
  // and the substrate saw it die; neither observation outranks the
  // other, so nothing can be established from the pair.
  if (exit_code === 0 && signalled !== undefined) {
    return {
      established: false,
      conflict: 'clean_exit_with_signal',
      detail: `the provider reported exit ${String(exit_code)} but was signalled ${signalled}; the terminal state cannot be established`,
    }
  }

  // A success claim alongside a failing exit code. The claim is
  // untrusted on its own — it becomes a conflict only when the observed
  // exit contradicts it.
  if (exit_code !== undefined && exit_code !== 0 && reported_outcome === 'success') {
    return {
      established: false,
      conflict: 'success_claim_with_failure_exit',
      detail: `the provider reported success but exited ${String(exit_code)}; the terminal state cannot be established`,
    }
  }

  // THE TRANSCRIPT IS THE THIRD OBSERVATION, and it was declared and
  // never read. ADR-0013 carries these apart "precisely so they can
  // DISAGREE" — a transcript ending in error while the exit code says 0
  // is exactly such a disagreement, and reading two of the three pairs
  // let it seal COMPLETED. An observation nothing classifies is not an
  // observation; it is a field.
  if (transcript_terminal !== undefined && exit_code === 0 && transcript_terminal !== 'success') {
    return {
      established: false,
      conflict: 'transcript_contradicts_exit',
      detail: `the provider reported exit ${String(exit_code)} but its transcript terminated ${transcript_terminal}; the terminal state cannot be established`,
    }
  }

  // Everything else agrees, INCLUDING the cases that look like failure.
  // A non-zero exit with no success claim is a run that failed, which
  // its observations concur on; a signal alongside a non-zero exit is
  // the same. An absent exit code contradicts nothing — "we were not
  // told" is not a disagreement, and treating it as one would refuse
  // every provider that reports no code.
  return ESTABLISHED
}
