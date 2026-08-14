/**
 * Running the scheduled gates, one disposition each.
 *
 * `scheduling/` owns the plan and the keyed recorder; this sequences
 * them against the execution port and the run's deadline. The
 * distinction matters: the mechanism decides what a disposition IS, and
 * this decides when to ask for one.
 *
 * A gate that could not be RUN has no disposition. Inventing one would
 * be a lie the evidence bundle would then carry, so the outcome says so
 * and the run terminates operationally.
 */
import type { GateRegistryT } from '@secure-home/contracts'
import { buildPlan, DispositionRecorder, toDisposition } from '../scheduling/index.js'
import type { RunEnvironment } from './environment.js'

export type GateRun =
  | { readonly kind: 'passed'; readonly recorder: DispositionRecorder }
  /** The plan named a gate the captured registry does not declare. */
  | { readonly kind: 'unknown_gates'; readonly detail: string }
  /** A gate could not be run at all, or its disposition was refused. */
  | { readonly kind: 'faulted'; readonly detail: string; readonly recorder: DispositionRecorder }
  /** Ownership moved; the caller must stop writing. */
  | { readonly kind: 'stale_fence'; readonly detail: string }

export const runGates = async (
  env: RunEnvironment,
  registry: GateRegistryT,
  session_ref: string,
): Promise<GateRun> => {
  const plan = buildPlan(registry, env.request.gates)
  if (!plan.ok) {
    return {
      kind: 'unknown_gates',
      detail: `unknown gate identities: ${plan.unknown_gates.join(', ')}`,
    }
  }

  const recorder = new DispositionRecorder(plan.plan.map((entry) => entry.gate_id))
  for (const entry of plan.plan) {
    const report = await env.ports.execution.runGate({
      ...env.scope.fence,
      gate_id: entry.gate_id,
      spec: entry.spec,
      session_ref,
      signal: env.deadline.signal,
    })
    if (report.outcome === 'stale_fence') return { kind: 'stale_fence', detail: report.detail }

    const disposition = toDisposition(report)
    if (disposition === undefined) {
      const why = report.outcome === 'environmental_fault' ? report.detail : 'environmental fault'
      return { kind: 'faulted', detail: `gate ${entry.gate_id} could not be run: ${why}`, recorder }
    }

    const recorded = recorder.record(entry.gate_id, disposition)
    if (!recorded.ok) return { kind: 'faulted', detail: recorded.error.detail, recorder }
  }
  return { kind: 'passed', recorder }
}
