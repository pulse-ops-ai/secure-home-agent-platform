/**
 * REQUESTED → PROFILE_RESOLVED: establish the run's authority.
 *
 * This phase takes no state at all, which is the typestate working: it
 * cannot read an observation, a session, or a change set, because it is
 * given none. It ESTABLISHES the authority every later phase receives.
 *
 * Composition across mechanisms, not a mechanism: `acquisition/` owns
 * epochs and tokens, `finalization/records` owns principal derivation,
 * `events/` owns emission. This sequences them for one phase.
 */
import {
  AcquisitionSet,
  describeEpochFailure,
  isCaptureRefusal,
  runEpoch,
} from '../../acquisition/index.js'
import { RunEventEmitter } from '../../events/index.js'
import { executionPrincipal } from '../../finalization/records.js'
import type { RunEnvironment } from '../environment.js'
import type { PhaseOutcome } from '../result.js'
import type { Authority } from '../state.js'
import { terminateEarly } from '../terminate.js'

const SOURCES = ['profile', 'path_policy', 'gate_registry'] as const

export const requested = async (env: RunEnvironment): Promise<PhaseOutcome<Authority>> => {
  const { request, ports, scope } = env

  // BEFORE ANY ACQUISITION. A cancelled run must not read the authority
  // it will never use — and REQUESTED is a cancellable state, so the
  // interrupt is consulted here rather than first being noticed two
  // phases later.
  const signal = env.deadline.interrupted()
  if (signal !== undefined) {
    return terminateEarly(env, signal, `run ${signal}led before authority was acquired`)
  }

  if (request.profile_ref === null) {
    // Consent is deliberately not consulted: the refusal names the
    // missing profile, because that is what is actually wrong.
    return terminateEarly(env, 'refuse', 'the run request names no execution profile')
  }

  const production = new AcquisitionSet(request.run_id, 'production', ports.authority, [...SOURCES])
  const acquired = await runEpoch(production, [...SOURCES], env.journalAcquisition)
  if (!acquired.ok) {
    return terminateEarly(
      env,
      isCaptureRefusal(acquired.failure) ? 'refuse' : 'operational_fault',
      describeEpochFailure(acquired.failure),
    )
  }

  const resolved = acquired.snapshots.profile
  if (resolved === undefined || !resolved.ok) {
    return terminateEarly(
      env,
      'refuse',
      resolved === undefined
        ? 'the execution profile did not resolve'
        : `the execution profile did not resolve: ${resolved.refusal.detail}`,
    )
  }
  scope.authorityCaptured = true

  // The captured profile must be the profile that was ASKED FOR. Capture
  // proves the bytes are a valid profile; it cannot know WHICH one was
  // requested. Without this the configured source could return any valid
  // profile and the run would execute under it — a request for a narrow
  // profile silently running with a broader grant.
  const captured = resolved.value.identity
  if (
    captured.name !== request.profile_ref.name ||
    captured.version !== request.profile_ref.version
  ) {
    return terminateEarly(
      env,
      'refuse',
      `the acquired profile is ${captured.name}@${captured.version} but the request named ${request.profile_ref.name}@${request.profile_ref.version}; a run never executes under a profile it did not request`,
    )
  }

  const executing = executionPrincipal(
    resolved.value.principal.sub,
    resolved.value.principal.actor_required,
    request.requester,
  )
  if (!executing.ok) return terminateEarly(env, 'refuse', executing.detail)

  const adapter = resolved.value.runtime.adapter
  return {
    kind: 'earned',
    cause: `profile ${captured.name}@${captured.version} resolved`,
    next: {
      snapshots: acquired.snapshots,
      profile: resolved,
      principal: executing.principal,
      adapter,
      emitter: new RunEventEmitter(
        { run_id: request.run_id, adapter, generation: scope.fence.generation },
        ports.events,
        ports.clock,
      ),
    },
  }
}
