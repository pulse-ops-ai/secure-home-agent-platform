/**
 * RUNNING → VERIFYING: invoke the provider, then observe what happened.
 *
 * This is the phase that spends, and the one that ESTABLISHES the run's
 * observations. Everything downstream reads them; nothing upstream can,
 * because they do not exist until this returns them.
 */
import { classifyTerminalObservations, isProceed } from '@secure-home/runner-core'
import { observeArtifacts, observeWorkspace } from '../../workspace/index.js'
import { recordCalls } from '../calls.js'
import { describeRefusal, emissionFailure } from '../detail.js'
import type { RunEnvironment } from '../environment.js'
import { runGates } from '../gates.js'
import { stop, type PhaseOutcome } from '../result.js'
import { noObservations, type Authority, type Observations } from '../state.js'
import { abortRun, conclude, emit, finish } from '../terminate.js'

export const running = async (
  env: RunEnvironment,
  authority: Authority,
): Promise<PhaseOutcome<Observations>> => {
  const { request, ports, scope } = env
  const session_ref = scope.session?.session_ref ?? `session:${request.run_id}`
  const so_far = (partial: Partial<Observations> = {}): Observations => ({
    ...noObservations(),
    ...partial,
  })
  const fault = (detail: string, seen: Observations) =>
    finish(env, authority, seen, 'operational_fault', detail, 'OPERATIONAL_FAILURE')

  const adapterStarted = await emit(env, authority, { event_type: 'adapter.started' })
  if (!adapterStarted.ok) return fault(emissionFailure(adapterStarted), so_far())

  const invocation = await env.deadline.until(() =>
    ports.adapter.invoke({
      ...scope.fence,
      adapter: authority.adapter,
      profile: { ...authority.profile.value.identity, digest: authority.profile.digest },
      input: request.input,
      grant: authority.profile.value.capability,
      routing: authority.profile.value.execution,
      limits: authority.profile.value.limits,
      // References only — the profile's declared names, never values.
      credentials: authority.profile.value.capability.credentials.map((c) => ({
        env_var: c.env_var,
      })),
      workspace: { session_ref, root_ref: `workspace:${request.run_id}` },
      signal: env.deadline.signal,
    }),
  )
  if (invocation === undefined) return abortRun(env, authority, so_far())
  if (invocation.outcome === 'stale_fence') {
    // The adapter was never engaged: the fence is checked before the
    // provider is asked to do anything, so this run has not spent.
    scope.loseFence(invocation.detail)
    return stop(await conclude(env, 'none', invocation.detail))
  }
  if (invocation.outcome === 'environmental_fault') {
    return fault(`adapter invocation faulted: ${invocation.detail}`, so_far())
  }

  // THE CORE DECIDES; THIS MODULE SEQUENCES AND OBEYS. Asked before any
  // call is recorded, and before anything downstream treats the run as
  // having a terminal (ADR-0013 decision 3).
  const classified = classifyTerminalObservations(invocation.observation.terminal)
  if (!classified.established) {
    return finish(env, authority, so_far(), 'indeterminate', classified.detail, 'INDETERMINATE')
  }

  const recorded = await recordCalls(env, authority, invocation.observation.calls)
  let operations = recorded.operations
  if (!recorded.ok) return fault(recorded.detail, so_far({ operations }))

  const adapterCompleted = await emit(env, authority, { event_type: 'adapter.completed' })
  if (!adapterCompleted.ok) return fault(emissionFailure(adapterCompleted), so_far({ operations }))

  const registry = authority.snapshots.gate_registry
  if (registry === undefined || !registry.ok) {
    return fault('the gate registry snapshot is unavailable at scheduling', so_far({ operations }))
  }

  const gates = await runGates(env, registry.value, session_ref)
  const gate_results =
    gates.kind === 'unknown_gates' || gates.kind === 'stale_fence' ? {} : gates.recorder.results()
  const seen = so_far({ gate_results, operations })
  switch (gates.kind) {
    case 'unknown_gates':
      return finish(env, authority, seen, 'refuse', gates.detail, 'REFUSED')
    case 'stale_fence':
      scope.loseFence(gates.detail)
      return stop(await conclude(env, 'none', gates.detail))
    case 'aborted':
      return abortRun(env, authority, seen)
    case 'faulted':
      return fault(gates.detail, seen)
    case 'passed':
      break
  }

  const changeSet = await observeWorkspace(ports.observer, {
    run_id: request.run_id,
    root: request.workspace_root,
  })
  if (!isProceed(changeSet)) {
    // A workspace we could not READ is operational; one whose contents
    // the core refused is a contract refusal. Keeping them apart here is
    // the same INV-003 distinction the evidence boundary keeps.
    const operational = changeSet.kind === 'operational_failure'
    return finish(
      env,
      authority,
      seen,
      operational ? 'operational_fault' : 'refuse',
      operational ? changeSet.detail : describeRefusal(changeSet),
      operational ? 'OPERATIONAL_FAILURE' : 'REFUSED',
    )
  }

  const artifacts = await observeArtifacts(ports.artifacts, {
    run_id: request.run_id,
    paths: request.artifact_paths,
  })
  operations = recorded.operations
  const observations: Observations = {
    gate_results,
    observed: changeSet.value,
    artifacts,
    operations,
  }

  const signal = env.deadline.interrupted()
  // A session is open here, so this ABORTS. `finish` closes a session
  // without ever asking it to stop, and a session still running while
  // the run reports CANCELLED is cancellation in name only.
  if (signal !== undefined) return abortRun(env, authority, observations, signal)
  return { kind: 'earned', cause: 'independent verification begins', next: observations }
}
