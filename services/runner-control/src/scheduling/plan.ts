/**
 * Gate plan construction (design D6).
 *
 * The plan is built ONLY from the captured registry. The scheduling
 * interface takes gate IDENTITIES — there is no parameter anywhere in
 * this module through which a caller could supply an executable, an
 * argument, an environment name, or a timeout, so widening what a gate
 * actually runs is unexpressible rather than validated-and-rejected.
 *
 * A requested identity the registry does not declare is not silently
 * skipped: it is an unknown-gate error, because "the gate did not run"
 * and "the gate is not a thing" are different facts and only one of them
 * is safe to treat as a pass.
 */
import type { GateRegistryT, GateSpecT } from '@secure-home/contracts'

export interface PlannedGate {
  readonly gate_id: string
  readonly spec: GateSpecT
}

export type PlanResult =
  | { readonly ok: true; readonly plan: readonly PlannedGate[] }
  | { readonly ok: false; readonly unknown_gates: readonly string[] }

export const buildPlan = (registry: GateRegistryT, requested: readonly string[]): PlanResult => {
  const plan: PlannedGate[] = []
  const unknown: string[] = []
  for (const gate_id of requested) {
    const spec = registry.gates[gate_id]
    if (spec === undefined) {
      unknown.push(gate_id)
      continue
    }
    plan.push({ gate_id, spec })
  }
  if (unknown.length > 0) return { ok: false, unknown_gates: unknown }
  return { ok: true, plan }
}
