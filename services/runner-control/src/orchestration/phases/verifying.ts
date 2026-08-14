/**
 * VERIFYING → sealed: re-derive independently, then materialize.
 *
 * The last phase. Finalization is one transaction and owns both terminal
 * transitions, so nothing runs after this.
 *
 * The re-acquisition is only half of verification. The other half — the
 * half that was once missing — is handing the candidate bundle and the
 * INDEPENDENTLY acquired values to the core's verifier and acting on
 * what it says. Re-reading the sources and discarding the result would
 * make VERIFYING a state the run passes through rather than one it
 * passes.
 */
import { reconcileClaims, verifyEvidence } from '@secure-home/runner-core'
import {
  AcquisitionSet,
  describeEpochFailure,
  runEpoch,
  type EpochValue,
} from '../../acquisition/index.js'
import { assembleEvidence } from '../../finalization/records.js'
import type { PhaseCommand } from '../../lifecycle/index.js'
import { observeArtifacts } from '../../workspace/index.js'
import type { AcquisitionEpoch, AuthorityBytes } from '../../ports/index.js'
import type { RunEnvironment } from '../environment.js'
import type { RunConclusion } from '../result.js'
import type { Authority, Observations } from '../state.js'
import { abortRun, finish } from '../terminate.js'
import { materialize } from '../materialize.js'

const SOURCES = ['profile', 'path_policy', 'gate_registry'] as const

/** The bytes one epoch acquired for a named source, for the verifier. */
const valueOf = <E extends AcquisitionEpoch>(
  values: readonly EpochValue<E>[],
  source: string,
): AuthorityBytes => {
  const found = values.find((value) => value.source === source)
  if (found !== undefined) return found.bytes
  // Unreachable when the epoch completed, and honest if it ever is not:
  // an absent value is a failed acquisition, never an empty document.
  return { ok: false, source: { source }, failure: `the verification epoch produced no ${source}` }
}

export const verifying = async (
  env: RunEnvironment,
  authority: Authority,
  seen: Observations,
): Promise<PhaseCommand<RunConclusion>> => {
  const { request, ports, scope } = env
  const fault = (detail: string) =>
    finish(env, authority, seen, 'operational_fault', detail, 'OPERATIONAL_FAILURE')
  // ABORTS rather than finishes: the session is still open through
  // verification, and closing one without interrupting it leaves
  // whatever it started still running.
  const interrupt = () => {
    const signal = env.deadline.interrupted()
    return signal === undefined ? undefined : abortRun(env, authority, seen, signal)
  }

  const before = interrupt()
  if (before !== undefined) return before

  const reacquired = await runEpoch(
    new AcquisitionSet(request.run_id, 'verification', ports.authority, [...SOURCES]),
    [...SOURCES],
    env.journalAcquisition,
  )
  if (!reacquired.ok) {
    return fault(`verification re-acquisition failed: ${describeEpochFailure(reacquired.failure)}`)
  }

  const candidate = assembleEvidence({
    snapshots: authority.snapshots,
    run_id: request.run_id,
    principal: authority.principal,
    adapter: authority.adapter,
    terminal: 'COMPLETED',
    detail: 'the run completed',
    gate_results: seen.gate_results,
    operations: seen.operations,
    observed: seen.observed,
    artifacts: seen.artifacts,
    reconciliation: reconcileClaims(seen.observed, request.claimed_changes ?? []),
    started_at: scope.startedAt,
    finished_at: ports.clock.now({ run_id: request.run_id }),
  })
  if (!candidate.ok) {
    const refusal = candidate.failure === 'refusal'
    return finish(
      env,
      authority,
      seen,
      refusal ? 'refuse' : 'operational_fault',
      candidate.detail,
      refusal ? 'REFUSED' : 'OPERATIONAL_FAILURE',
    )
  }

  // A FRESH artifact observation, not the production one: verification
  // that reuses the producer's reading cannot detect an artifact that
  // changed after production read it.
  const freshArtifacts = await observeArtifacts(ports.artifacts, {
    run_id: request.run_id,
    paths: request.artifact_paths,
  })
  const during = interrupt()
  if (during !== undefined) return during

  const verdict = verifyEvidence(candidate.bundle, {
    profile: valueOf(reacquired.values, 'profile'),
    path_policy: valueOf(reacquired.values, 'path_policy'),
    gate_registry: valueOf(reacquired.values, 'gate_registry'),
    artifacts: freshArtifacts,
  })
  if ('kind' in verdict) return fault(verdict.detail)
  if (!verdict.verified) {
    return finish(
      env,
      authority,
      seen,
      'refuse',
      `verification failed: ${verdict.failures.join('; ')}`,
      'REFUSED',
    )
  }

  const materialized = await materialize(env, authority, seen)
  if (materialized !== undefined) return materialized

  return await finish(
    env,
    authority,
    { ...seen, verification: verdict.artifacts_consumed },
    'complete',
    'the run completed',
    'COMPLETED',
  )
}
