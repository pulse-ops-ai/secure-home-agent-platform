/**
 * Letting a run's changes leave isolation — or refusing.
 *
 * The CORE decides whether what the host observed may escape;
 * orchestration asks and obeys. `decideMaterialization` had existed
 * since L3 and nothing called it, which meant nothing decided whether a
 * run's changes were allowed out of the sandbox at all.
 *
 * Returns a terminal when the run must stop, and `undefined` when it may
 * seal — so the caller cannot proceed past a refusal by ignoring a
 * boolean.
 */
import { decideMaterialization, isProceed } from '@secure-home/runner-core'
import type { PhaseCommand } from '../lifecycle/index.js'
import { describeRefusal } from './detail.js'
import type { RunEnvironment } from './environment.js'
import { stop, type RunConclusion } from './result.js'
import type { Authority, Observations } from './state.js'
import { conclude, finish } from './terminate.js'

export const materialize = async (
  env: RunEnvironment,
  authority: Authority,
  seen: Observations,
): Promise<PhaseCommand<RunConclusion> | undefined> => {
  const { scope, ports, request } = env
  // The type-level narrowing that matches RO-EX-76: an empty change set
  // is never an apply-back, and `ApplyBackRequest.changes` is non-empty
  // BY TYPE — a materialization with nothing in it is unrepresentable
  // rather than merely skipped.
  const [head, ...rest] = seen.observed.changes
  if (head === undefined) return undefined

  const policy = authority.snapshots.path_policy
  const decision = decideMaterialization(policy, seen.observed, [
    authority.snapshots.profile?.source.source ?? 'profile',
    policy?.source.source ?? 'path-policy',
    authority.snapshots.gate_registry?.source.source ?? 'gate-registry',
  ])
  if (!isProceed(decision)) {
    return finish(env, authority, seen, 'refuse', describeRefusal(decision), 'REFUSED')
  }
  if (scope.workspace === undefined || policy?.ok !== true) return undefined

  // WHAT THIS RUN ALREADY KNOWS, BEFORE ASKING ANYONE ELSE.
  //
  // `fenceLost` is a fact this attempt owns: a resource refused its
  // generation, so ownership has moved. `renew` is a QUESTION put to a
  // store that may be stale, partitioned, or simply wrong — and a store
  // that answers yes cannot restore an ownership the run has already
  // been told it lost. Asking first meant a permissive lease could talk
  // a dispossessed run into the one write that escapes isolation.
  //
  // Round 4's finding 3 named two holes here and only one was closed;
  // this is the other. No port between the verification epoch and this
  // point can refuse a fence, so nothing reaches it today — that is what
  // defence in depth is, and the day a port is added between them is
  // exactly when nobody will remember to add this check.
  if (scope.fenceLost !== undefined) {
    return stop(await conclude(env, 'none', scope.fenceLost))
  }

  // OWNERSHIP, RE-ASKED IMMEDIATELY BEFORE THE WRITE THAT ESCAPES.
  //
  // The fence alone cannot cover this one: a resource can only refuse a
  // generation it has already been SUPERSEDED by, and the workspace may
  // never have served the new owner. Apply-back is where a run's changes
  // become real, so it gets the belt as well as the braces.
  const generation = scope.fence.generation
  if (!(await ports.lease.renew({ run_id: request.run_id, generation }))) {
    const detail = `the run lease was lost at generation ${String(generation)}; nothing was materialized`
    scope.loseFence(detail)
    return stop(await conclude(env, 'none', detail))
  }

  const applied = await ports.workspace.applyBack({
    ...scope.fence,
    workspace_ref: scope.workspace.workspace_ref,
    // The AUTHORITATIVE observation — not the model's claims.
    changes: [head, ...rest],
    authorized_by: { contract_id: policy.contract.contract_id, digest: policy.digest },
  })
  if (!applied.ok) {
    if (applied.reason === 'stale_fence') {
      scope.loseFence(applied.detail)
      return stop(await conclude(env, 'none', applied.detail))
    }
    // A run whose changes did not land has not completed. Sealing would
    // describe a repository state that never happened.
    return finish(
      env,
      authority,
      seen,
      'operational_fault',
      `apply-back failed: ${applied.detail}`,
      'OPERATIONAL_FAILURE',
    )
  }
  return undefined
}
