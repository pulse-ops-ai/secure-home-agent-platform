/**
 * THE TWO STRUCTURAL GATES — A MODULE FACT, AND ONLY A MODULE FACT.
 *
 * `blockedByToolchain` and `blockedByRollout` are independent facts about ONE
 * MODULE (ADR-0016 §7). All four combinations are reachable and each names its
 * own refusal — a module refused for the wrong stated reason sends someone to
 * fix the wrong thing.
 *
 * Opening both gates is **authoring eligibility** and nothing more. Admission
 * follows only once candidate bytes exist, and publication only once Proof B
 * binds (ADR-0016 §9a). No function here returns a single `valid`.
 *
 * **Nothing here decides whether a COMPOSITION may be used.** A set once carried
 * its own `GateState`, and `resolveSet` decided set eligibility from it. ADR-0019
 * ended that: a set family is mutable authoring intent with no gate, and release
 * state (`Released` / `Deprecated` / `Retired`) is the single authority over
 * composition use. That question now lives with the release, in `set-release.ts`,
 * where it cannot be answered by a boolean pair.
 */

export interface GateState {
  readonly blockedByToolchain: boolean
  readonly blockedByRollout: boolean
}

/** Which gate refused, when one did. */
export type GateRefusal = 'toolchain' | 'rollout' | 'both'

/**
 * The gate arithmetic itself, with no verdict attached.
 *
 * Authoring and release-time member resolution ask the same two booleans and
 * mean different things by the answer, so they share this and nothing else.
 * `undefined` means neither gate refused — deliberately not `true`, so a caller
 * cannot read it as "eligible" for a question it did not ask.
 */
export const gateRefusal = (gates: GateState): GateRefusal | undefined => {
  const { blockedByToolchain: toolchain, blockedByRollout: rollout } = gates
  if (toolchain && rollout) return 'both'
  if (toolchain) return 'toolchain'
  if (rollout) return 'rollout'
  return undefined
}

export type AuthoringDecision =
  { readonly eligible: true } | { readonly eligible: false; readonly refusedBy: GateRefusal }

/** May candidate source be authored? Gates only — never attestation. */
export const authoringEligibility = (gates: GateState): AuthoringDecision => {
  const refusedBy = gateRefusal(gates)
  return refusedBy === undefined ? { eligible: true } : { eligible: false, refusedBy }
}
