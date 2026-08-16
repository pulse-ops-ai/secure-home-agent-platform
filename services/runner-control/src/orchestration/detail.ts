/**
 * Turning a decision into words a record can carry.
 *
 * Formatting only. Nothing here decides anything — a refusal is
 * described exactly as the core returned it, never softened, and never
 * recomputed into a different one.
 */
import type { Refusal } from '@secure-home/runner-core'

export const describeRefusal = (refusal: Refusal): string =>
  `${refusal.code} on ${refusal.violated.element}: ${refusal.detail}`

export const emissionFailure = (outcome: {
  readonly ok: false
  readonly reason: string
  readonly detail: string
}): string => `run event could not be emitted (${outcome.reason}): ${outcome.detail}`
