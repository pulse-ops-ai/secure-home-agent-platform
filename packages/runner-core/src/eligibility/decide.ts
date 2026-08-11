/**
 * Pre-spend eligibility (requirement "Eligibility refuses rather than
 * defaults"; the eligibility decision table in design.md). Decided from
 * the captured snapshots ALONE: no code path yields an eligible decision
 * from an incomplete snapshot set, and an undecidable state is never
 * mapped to eligible.
 */
import { GateId } from '@secure-home/contracts'
import { coerceRefusal, type Decision, proceed, refuse } from '../decision/index.js'
import type { AuthoritySnapshots, CapturedAuthority, CapturedIdentity } from '../authority/index.js'
import type { ContractDocument } from '../authority/capture.js'

export interface Eligible {
  readonly profile: CapturedIdentity
  readonly path_policy: CapturedIdentity
  readonly gate_registry: CapturedIdentity | null
  readonly gates: readonly string[]
}

/** Fail-closed shape check against untyped (non-TypeScript) callers. */
const isEstablished = <T extends ContractDocument>(
  snapshot: CapturedAuthority<T> | undefined,
): snapshot is CapturedAuthority<T> & { ok: true } =>
  snapshot !== undefined &&
  typeof snapshot === 'object' &&
  (snapshot as { ok?: unknown }).ok === true &&
  typeof (snapshot as { digest?: unknown }).digest === 'string'

export const decideEligibility = (
  snapshots: AuthoritySnapshots,
  requestedGates: readonly string[],
): Decision<Eligible> => {
  const { profile, path_policy, gate_registry } = snapshots

  if (profile === undefined) {
    return refuse(
      'missing_authority',
      { element: 'execution-profile' },
      'no execution profile in the snapshot set',
    )
  }
  if ((profile as { ok?: unknown }).ok === false) {
    return coerceRefusal((profile as { refusal?: unknown }).refusal, 'execution-profile')
  }
  if (!isEstablished(profile)) {
    return refuse(
      'undecidable',
      { element: 'execution-profile' },
      'profile snapshot state cannot be established',
    )
  }

  if (path_policy === undefined) {
    return refuse(
      'missing_authority',
      { element: 'path-policy' },
      'no path policy in the snapshot set — the policy is required authority',
    )
  }
  if ((path_policy as { ok?: unknown }).ok === false) {
    return coerceRefusal((path_policy as { refusal?: unknown }).refusal, 'path-policy')
  }
  if (!isEstablished(path_policy)) {
    return refuse(
      'undecidable',
      { element: 'path-policy' },
      'path-policy snapshot state cannot be established',
    )
  }

  const gates: string[] = []
  const seen = new Set<string>()
  for (const gate of requestedGates) {
    if (!GateId.safeParse(gate).success) {
      return refuse(
        'undeclared_gate',
        { element: gate },
        'requested gate identity is not a valid gate id',
      )
    }
    if (seen.has(gate)) {
      return refuse(
        'duplicate_gate',
        { element: gate },
        'requested gate identity appears more than once',
      )
    }
    seen.add(gate)
    gates.push(gate)
  }

  let registryIdentity: CapturedIdentity | null = null
  if (gates.length > 0) {
    if (gate_registry === undefined) {
      return refuse(
        'missing_authority',
        { element: 'gate-registry' },
        'gates were requested but no gate registry is in the snapshot set',
      )
    }
    if ((gate_registry as { ok?: unknown }).ok === false) {
      return coerceRefusal((gate_registry as { refusal?: unknown }).refusal, 'gate-registry')
    }
    if (!isEstablished(gate_registry)) {
      return refuse(
        'undecidable',
        { element: 'gate-registry' },
        'gate-registry snapshot state cannot be established',
      )
    }
    for (const gate of gates) {
      if (!(gate in gate_registry.value.gates)) {
        return refuse(
          'undeclared_gate',
          { element: gate },
          'requested gate identity is absent from the captured registry',
        )
      }
    }
    registryIdentity = gate_registry.contract
  }

  return proceed({
    profile: profile.contract,
    path_policy: path_policy.contract,
    gate_registry: registryIdentity,
    gates: [...gates].sort(),
  })
}
