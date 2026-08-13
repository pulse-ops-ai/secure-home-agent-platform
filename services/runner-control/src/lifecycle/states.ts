/**
 * The closed lifecycle vocabulary (requirement "A run is a typed walk
 * through the declared state machine").
 *
 * States are data and the sets below are the single source of truth for
 * "is this terminal?" and "can this still be cancelled?". Nothing in this
 * service answers those questions by comparing strings inline — that is
 * the lifecycle-by-grep shape this design exists to make impossible.
 */

export const PROGRESS_STATES = [
  'REQUESTED',
  'PROFILE_RESOLVED',
  'ELIGIBLE',
  'SANDBOX_STARTED',
  'RUNNING',
  'VERIFYING',
  'EVIDENCE_SEALED',
  'COMPLETED',
] as const

export const TERMINAL_STATES = [
  'COMPLETED',
  'REFUSED',
  'OPERATIONAL_FAILURE',
  'CANCELLED',
  'TIMED_OUT',
  'INDETERMINATE',
] as const

export type ProgressState = (typeof PROGRESS_STATES)[number]
export type TerminalState = (typeof TERMINAL_STATES)[number]
export type LifecycleState = ProgressState | TerminalState

const TERMINALS: ReadonlySet<string> = new Set(TERMINAL_STATES)

export const isTerminal = (state: LifecycleState): state is TerminalState => TERMINALS.has(state)

/**
 * Whether a terminal reached from `state` can construct the full evidence
 * bundle. Entering `PROFILE_RESOLVED` requires the completed production
 * acquisition, so every state from there on has the authority identities
 * a bundle needs; `REQUESTED` does not, and its terminals produce the
 * early-terminal refusal record instead (design D11). This is the one
 * place that distinction is decided.
 */
export const canConstructEvidence = (state: LifecycleState): boolean => state !== 'REQUESTED'
