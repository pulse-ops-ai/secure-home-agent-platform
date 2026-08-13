/**
 * SANDBOX_STARTED → RUNNING: announce the run, then assert the base.
 *
 * BASE IDENTITY IS ASSERTED BEFORE ANY PROVIDER INVOCATION, and the
 * order is the whole point: observing a substituted workspace after the
 * model has already run cannot un-run it. The comparison belongs to the
 * core; what belongs here is doing it at the right moment — before the
 * adapter, before spend has any effect the outside world can see.
 */
import { compareBaseIdentity, isProceed } from '@secure-home/runner-core'
import type { PhaseCommand } from '../../lifecycle/index.js'
import { describeRefusal, emissionFailure } from '../detail.js'
import type { RunEnvironment } from '../environment.js'
import type { RunConclusion } from '../result.js'
import { noObservations, type Authority } from '../state.js'
import { abortRun, emit, finish } from '../terminate.js'

export const sandboxStarted = async (
  env: RunEnvironment,
  authority: Authority,
): Promise<PhaseCommand<RunConclusion>> => {
  const { request, ports } = env
  const nothingYet = noObservations()
  const fault = (detail: string): Promise<PhaseCommand<RunConclusion>> =>
    finish(env, authority, nothingYet, 'operational_fault', detail, 'OPERATIONAL_FAILURE')

  // The digest-bound identity, not the pre-resolution reference: the
  // event records WHICH profile bytes governed, which is the point of
  // emitting it at all.
  const started = await emit(env, authority, {
    event_type: 'run.started',
    profile: { ...authority.profile.value.identity, digest: authority.profile.digest },
  })
  if (!started.ok) return fault(emissionFailure(started))

  const granted = await emit(env, authority, {
    event_type: 'capability.granted',
    grant: authority.profile.value.capability,
  })
  if (!granted.ok) return fault(emissionFailure(granted))

  // The session is OPEN by now, so this aborts rather than finishes.
  // `finish` closes the session; only `abortRun` interrupts it first,
  // and a session left running while the run reports CANCELLED is
  // cancellation in name only.
  if (env.deadline.interrupted() !== undefined) return abortRun(env, authority, nothingYet)

  const base = await ports.observer.observeBase({
    run_id: request.run_id,
    root: request.workspace_root,
  })
  if (!base.ok) {
    return fault(`the workspace base identity could not be observed: ${base.failure}`)
  }

  const baseMatch = compareBaseIdentity(request.pinned_base, base.digest)
  if (!isProceed(baseMatch)) {
    return finish(env, authority, nothingYet, 'refuse', describeRefusal(baseMatch), 'REFUSED')
  }

  return { kind: 'earned', cause: 'the workspace base matches; execution may begin' }
}
