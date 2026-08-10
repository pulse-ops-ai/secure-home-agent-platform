/**
 * The trusted-decision result algebra (design D5).
 *
 * Every trusted operation returns a `Decision<T>` — proceed or refusal —
 * and never throws for a contract reason. A refusal is DATA: it carries a
 * stable machine-readable code and the specific violated element, so
 * refusal evidence can be written without re-deriving the decision
 * (INV-003).
 *
 * Operational failures — the orchestrator reported that acquisition or
 * observation failed — are a SEPARATE variant, never a `Refusal`: a result
 * must never claim a contract decision that was never made. The
 * distinction is structural, not conventional.
 */

/** Stable, closed refusal vocabulary. Reviewable; growing it is a diff. */
export const REFUSAL_CODES = [
  'missing_authority',
  'invalid_authority',
  'contract_mismatch',
  'undecidable',
  'undeclared_gate',
  'duplicate_gate',
  'base_identity_mismatch',
  'path_outside_roots',
  'protected_path',
  'path_undecidable',
  'over_bound',
  'unrecognized_rule',
  'claim_parse',
  'incomplete_evidence',
  'inconsistent_evidence',
  'seal_prerequisite',
  'consumption_digest_mismatch',
] as const

export type RefusalCode = (typeof REFUSAL_CODES)[number]

/** The specific violated element a refusal names. */
export interface Violated {
  /** The missing input, undeclared identity, offending path, or bound name. */
  readonly element: string
  /** The observed value, where one exists (e.g. the measured bound value). */
  readonly observed?: string
}

export interface Proceed<T> {
  readonly kind: 'proceed'
  readonly value: T
}

export interface Refusal {
  readonly kind: 'refusal'
  readonly code: RefusalCode
  readonly violated: Violated
  readonly detail: string
}

/**
 * An environmental fault reported by the orchestrator's acquisition or
 * observation, carried through as data. Never carries a refusal code.
 */
export interface OperationalFailure {
  readonly kind: 'operational_failure'
  readonly source: string
  readonly detail: string
}

export type Decision<T> = Proceed<T> | Refusal

/** A decision over inputs that may carry a reported environmental fault. */
export type ObservedDecision<T> = Decision<T> | OperationalFailure

export const proceed = <T>(value: T): Proceed<T> => ({ kind: 'proceed', value })

export const refuse = (code: RefusalCode, violated: Violated, detail: string): Refusal => ({
  kind: 'refusal',
  code,
  violated,
  detail,
})

export const operationalFailure = (source: string, detail: string): OperationalFailure => ({
  kind: 'operational_failure',
  source,
  detail,
})

/**
 * Fail-closed pass-through of a reported refusal from an untyped caller:
 * a value claiming to be a refusal but with an unestablishable shape
 * becomes an undecidable refusal — never `undefined`, never a crash.
 */
export const coerceRefusal = (candidate: unknown, element: string): Refusal =>
  candidate !== null &&
  typeof candidate === 'object' &&
  (candidate as { kind?: unknown }).kind === 'refusal' &&
  typeof (candidate as { code?: unknown }).code === 'string' &&
  typeof (candidate as { detail?: unknown }).detail === 'string'
    ? (candidate as Refusal)
    : refuse(
        'undecidable',
        { element },
        'a refusal was reported but its shape cannot be established',
      )

export const isProceed = <T>(decision: ObservedDecision<T>): decision is Proceed<T> =>
  decision.kind === 'proceed'

export const isRefusal = <T>(decision: ObservedDecision<T>): decision is Refusal =>
  decision.kind === 'refusal'

export const isOperationalFailure = <T>(
  decision: ObservedDecision<T>,
): decision is OperationalFailure => decision.kind === 'operational_failure'
