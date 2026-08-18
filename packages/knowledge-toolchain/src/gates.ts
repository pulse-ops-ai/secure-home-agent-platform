/**
 * THE TWO STRUCTURAL GATES, AND THE THREE STAGES THEY OPEN.
 *
 * `blockedByToolchain` and `blockedByRollout` are independent facts (ADR-0016
 * §7). All four combinations are reachable and each names its own refusal —
 * a module refused for the wrong stated reason sends someone to fix the wrong
 * thing.
 *
 * Opening both gates is **authoring eligibility** and nothing more. Admission
 * follows only once candidate bytes exist, and publication only once Proof B
 * binds (ADR-0016 §9a). No function here returns a single `valid`.
 */

export interface GateState {
  readonly blockedByToolchain: boolean
  readonly blockedByRollout: boolean
}

export type AuthoringDecision =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly refusedBy: 'toolchain' | 'rollout' | 'both' }

/** May candidate source be authored? Gates only — never attestation. */
export const authoringEligibility = (gates: GateState): AuthoringDecision => {
  const { blockedByToolchain: toolchain, blockedByRollout: rollout } = gates
  if (toolchain && rollout) return { eligible: false, refusedBy: 'both' }
  if (toolchain) return { eligible: false, refusedBy: 'toolchain' }
  if (rollout) return { eligible: false, refusedBy: 'rollout' }
  return { eligible: true }
}

export interface SetResolution {
  readonly resolved: readonly string[]
  readonly refused: readonly {
    readonly module: string
    readonly refusedBy: 'toolchain' | 'rollout' | 'both'
  }[]
}

/**
 * Resolve a set's members under both gates.
 *
 * **An unblocked set never resolves a blocked module.** A set's own gate means
 * the COMPOSITION has been released for profile use — a different question from
 * whether each member may author — so releasing a set must not become a back
 * door around the per-module control it sits above (ADR-0016 §7a).
 */
export const resolveSet = (
  set: GateState,
  members: readonly { readonly id: string; readonly gates: GateState }[],
): SetResolution | { readonly refusedBy: 'set-toolchain' | 'set-rollout' | 'set-both' } => {
  // BOTH set gates, before any member is considered. Consulting only rollout
  // made the set's toolchain gate decorative: a set could resolve members while
  // the toolchain that would admit them did not exist.
  if (set.blockedByToolchain && set.blockedByRollout) return { refusedBy: 'set-both' }
  if (set.blockedByToolchain) return { refusedBy: 'set-toolchain' }
  if (set.blockedByRollout) return { refusedBy: 'set-rollout' }
  const resolved: string[] = []
  const refused: { module: string; refusedBy: 'toolchain' | 'rollout' | 'both' }[] = []
  for (const member of members) {
    const decision = authoringEligibility(member.gates)
    if (decision.eligible) resolved.push(member.id)
    else refused.push({ module: member.id, refusedBy: decision.refusedBy })
  }
  return { resolved, refused }
}
