/**
 * Seal eligibility (requirement "Seal eligibility is a deterministic
 * decision with named prerequisites"; design D7). A pure predicate over
 * the completeness and consistency of the evidence inputs: it performs no
 * write and sequences nothing — the ordering that actually seals last is
 * L4's, and a pure function cannot observe when it was called.
 */
import { EvidenceBundle, type EvidenceBundleT, type RunOutcomeT } from '@secure-home/events'
import { type Decision, proceed, refuse } from '../decision/index.js'

export interface SealInputs {
  readonly bundle: unknown
  readonly outcome: RunOutcomeT | undefined
}

export interface SealEligible {
  readonly prerequisites_checked: readonly string[]
  readonly bundle: EvidenceBundleT
}

const PREREQUISITES = ['evidence_bundle', 'terminal_outcome', 'outcome_consistency'] as const

export const decideSealEligibility = (inputs: SealInputs): Decision<SealEligible> => {
  if (inputs.bundle === undefined || inputs.bundle === null) {
    return refuse(
      'seal_prerequisite',
      { element: 'evidence_bundle' },
      'the evidence bundle prerequisite is undecided — nothing to seal',
    )
  }
  const bundle = EvidenceBundle.safeParse(inputs.bundle)
  if (!bundle.success) {
    return refuse(
      'seal_prerequisite',
      { element: 'evidence_bundle' },
      'the evidence bundle fails contract validation; an invalid bundle is never seal-eligible',
    )
  }
  if (inputs.outcome === undefined) {
    return refuse(
      'seal_prerequisite',
      { element: 'terminal_outcome' },
      'the terminal outcome prerequisite is undecided',
    )
  }
  if (JSON.stringify(bundle.data.outcome) !== JSON.stringify(inputs.outcome)) {
    return refuse(
      'inconsistent_evidence',
      { element: 'outcome_consistency', observed: inputs.outcome.terminal_state },
      `the bundle records terminal state "${bundle.data.outcome.terminal_state}" but the run outcome is "${inputs.outcome.terminal_state}" — irreconcilable`,
    )
  }
  return proceed({ prerequisites_checked: [...PREREQUISITES], bundle: bundle.data })
}
