/**
 * The declared transition table — DATA, not control flow (design D1).
 *
 * A transition exists if and only if it appears here. The table is
 * exhaustive over the progress states by construction: `TRANSITIONS` is
 * typed as a total record over `ProgressState`, so adding a state to the
 * vocabulary without declaring its transitions fails to compile rather
 * than silently producing a state nothing can leave.
 *
 * Terminal states appear nowhere as a source. That is why "a terminal
 * accepts nothing" needs no runtime guard of its own: there is no entry
 * to find.
 */
import type { LifecycleState, ProgressState } from './states.js'

export const TRANSITIONS_KINDS = [
  'resolve_profile',
  'decide_eligibility',
  'commit_spend',
  'begin_execution',
  'begin_verification',
  'seal_evidence',
  'complete',
  'refuse',
  'operational_fault',
  'cancel',
  'timeout',
  'indeterminate',
] as const

export type TransitionKind = (typeof TRANSITIONS_KINDS)[number]

/**
 * Terminal branches available from every non-terminal state.
 *
 * `cancel` and `timeout` are declared from `REQUESTED` as well as from
 * `PROFILE_RESOLVED` onward. The spec requires them from
 * `PROFILE_RESOLVED` and later *because those states can seal a full
 * bundle*; a cancellation or an elapsed acquisition budget in `REQUESTED`
 * is a real event that still has to land somewhere, and the governed
 * landing place is the early-terminal refusal record, whose outcome
 * vocabulary admits exactly these five. Refusing to declare them would
 * not prevent the event — it would only leave the run abandoned in a
 * non-terminal state, which the lifecycle requirement forbids outright.
 */
const TERMINAL_BRANCHES = {
  refuse: 'REFUSED',
  operational_fault: 'OPERATIONAL_FAILURE',
  cancel: 'CANCELLED',
  timeout: 'TIMED_OUT',
  indeterminate: 'INDETERMINATE',
} as const satisfies Partial<Record<TransitionKind, LifecycleState>>

const withTerminals = <T extends Partial<Record<TransitionKind, LifecycleState>>>(
  progress: T,
): T & typeof TERMINAL_BRANCHES => ({ ...progress, ...TERMINAL_BRANCHES })

export type TransitionTable = Readonly<
  Record<ProgressState, Readonly<Partial<Record<TransitionKind, LifecycleState>>>>
>

/**
 * Deep-freeze a table so it cannot become mutable authority.
 *
 * `TRANSITIONS` is exported from the package root and `RunMachine`
 * defaults to it directly, so an ordinary object here is lifecycle
 * authority any holder can widen mid-run — the same time-of-check hole
 * the supplied-table path closes, surviving on the canonical branch.
 * Freezing inside `Runner` would not reach the public machine path;
 * freezing at the source does.
 */
const frozen = (table: TransitionTable): TransitionTable => {
  for (const row of Object.values(table)) Object.freeze(row)
  return Object.freeze(table)
}

export const TRANSITIONS: TransitionTable = frozen({
  REQUESTED: withTerminals({ resolve_profile: 'PROFILE_RESOLVED' }),
  PROFILE_RESOLVED: withTerminals({ decide_eligibility: 'ELIGIBLE' }),
  ELIGIBLE: withTerminals({ commit_spend: 'SANDBOX_STARTED' }),
  SANDBOX_STARTED: withTerminals({ begin_execution: 'RUNNING' }),
  RUNNING: withTerminals({ begin_verification: 'VERIFYING' }),
  VERIFYING: withTerminals({ seal_evidence: 'EVIDENCE_SEALED' }),
  EVIDENCE_SEALED: withTerminals({ complete: 'COMPLETED' }),
  // COMPLETED is terminal; it is a progress state only because the
  // vocabulary lists it as the successful end of the walk.
  COMPLETED: {},
})

/** The declared next state, or `undefined` when the pair is undeclared. */
export const declaredNext = (
  table: TransitionTable,
  state: LifecycleState,
  kind: TransitionKind,
): LifecycleState | undefined => {
  const row = (table as Record<string, Readonly<Partial<Record<TransitionKind, LifecycleState>>>>)[
    state
  ]
  return row?.[kind]
}
