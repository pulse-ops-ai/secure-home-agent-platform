/**
 * PROFILE_RESOLVED → ELIGIBLE: ask the core whether the run may proceed.
 *
 * It has authority and nothing else. There are no observations to pass
 * to a terminal here because the run has made none — `noObservations()`
 * is the true record, not a placeholder.
 */
import { decideEligibility, isProceed } from '@secure-home/runner-core'
import type { PhaseCommand } from '../../lifecycle/index.js'
import { boundedDeadlineMs } from '../controls.js'
import { INTERRUPT_TERMINAL } from '../deadline.js'
import { describeRefusal } from '../detail.js'
import type { RunEnvironment } from '../environment.js'
import type { RunConclusion } from '../result.js'
import { noObservations, type Authority } from '../state.js'
import { finish } from '../terminate.js'

export const profileResolved = async (
  env: RunEnvironment,
  authority: Authority,
): Promise<PhaseCommand<RunConclusion>> => {
  // AUTHORITY NOW EXISTS, so the captured profile replaces the standing
  // acquisition ceiling before the first post-capture effect. Its
  // absolute expiry is anchored at run start; session narrowing later
  // retains the time already spent.
  env.deadline.armProfile(
    boundedDeadlineMs(
      authority.profile.value.limits.wall_clock_seconds,
      authority.profile.value.limits.wall_clock_seconds,
      env.controls.deadline_ms,
    ),
  )

  const signal = env.deadline.interrupted()
  if (signal !== undefined) {
    return finish(
      env,
      authority,
      noObservations(),
      signal,
      `run ${signal}led before eligibility`,
      INTERRUPT_TERMINAL[signal],
    )
  }

  const eligibility = decideEligibility(authority.snapshots, env.request.gates)
  if (!isProceed(eligibility)) {
    return finish(
      env,
      authority,
      noObservations(),
      'refuse',
      describeRefusal(eligibility),
      'REFUSED',
    )
  }
  return { kind: 'earned', cause: 'the core decided the run eligible' }
}
