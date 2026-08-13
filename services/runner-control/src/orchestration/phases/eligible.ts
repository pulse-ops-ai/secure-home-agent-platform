/**
 * ELIGIBLE → SANDBOX_STARTED: consent, then the spend that causes it.
 *
 * OPENING THE SESSION *IS* THE SPEND. `commit_spend` is the transition
 * into `SANDBOX_STARTED`, and that state means a sandbox has started.
 * Earning it by consent alone asserted the fact; earning it by actually
 * provisioning a workspace and opening a session CAUSES it. A session
 * that will not open therefore never reaches the state, which is what
 * makes the state mean something.
 */
import { decideSpendGate } from '../../consent/index.js'
import { boundedDeadlineMs } from '../controls.js'
import { INTERRUPT_TERMINAL } from '../deadline.js'
import type { PhaseCommand } from '../../lifecycle/index.js'
import type { RunEnvironment } from '../environment.js'
import { stop, type RunConclusion } from '../result.js'
import { noObservations, type Authority } from '../state.js'
import { conclude, finish } from '../terminate.js'

export const eligible = async (
  env: RunEnvironment,
  authority: Authority,
): Promise<PhaseCommand<RunConclusion>> => {
  const { request, ports, scope } = env

  // BEFORE THE SPEND. Opening the session IS the spend, and this phase
  // provisions a workspace and starts a session — so a cancellation that
  // became active since the last check must be seen HERE. Passing one
  // check and then spending on the strength of it is what made
  // cancellation advisory between phases.
  const signal = env.deadline.interrupted()
  if (signal !== undefined) {
    return finish(
      env,
      authority,
      noObservations(),
      signal,
      `run ${signal}led before spend`,
      INTERRUPT_TERMINAL[signal],
    )
  }

  const spend = decideSpendGate(request.run_id, request.consent)
  if (!spend.ok) {
    // HELD, not refused, and not abandoned. The engine records the hold
    // against this phase's transition and stops the walk, so the machine
    // stays at ELIGIBLE and nothing downstream runs.
    return { kind: 'hold', detail: spend.detail }
  }

  // THE ISOLATED WRITABLE WORKSPACE, before anything can write. A run
  // writes into a workspace that is not the source of truth, and what it
  // did there leaves only through a materialization decision.
  // Provisioning after execution would make the isolation decorative.
  const provisioned = await ports.workspace.provision({
    ...scope.fence,
    source_ref: request.workspace_root,
  })
  if (!provisioned.ok) {
    if (provisioned.reason === 'stale_fence') {
      scope.loseFence(provisioned.detail)
      return stop(await conclude(env, 'none', provisioned.detail))
    }
    return finish(
      env,
      authority,
      noObservations(),
      'operational_fault',
      `the isolated workspace could not be provisioned: ${provisioned.detail}`,
      'OPERATIONAL_FAILURE',
    )
  }
  scope.workspace = provisioned.handle

  const prepared = await ports.session.prepare({
    ...scope.fence,
    profile: { ...authority.profile.value.identity, digest: authority.profile.digest },
    limits: authority.profile.value.limits,
  })
  if (!prepared.ok) {
    if (prepared.reason === 'stale_fence') {
      scope.loseFence(prepared.detail)
      return stop(await conclude(env, 'none', prepared.detail))
    }
    return finish(
      env,
      authority,
      noObservations(),
      'operational_fault',
      `the execution session could not be prepared: ${prepared.detail}`,
      'OPERATIONAL_FAILURE',
    )
  }
  scope.session = prepared.handle

  const started = await ports.session.start({
    ...scope.fence,
    session_ref: prepared.handle.session_ref,
  })
  if (!started.ok) {
    if (started.reason === 'stale_fence') {
      scope.loseFence(started.detail)
      return stop(await conclude(env, 'none', started.detail))
    }
    return finish(
      env,
      authority,
      noObservations(),
      'operational_fault',
      `the execution session could not be started: ${started.detail}`,
      'OPERATIONAL_FAILURE',
    )
  }

  // THE PROFILE IS THE AUTHORITY ON THE WALL CLOCK.
  //
  // This armed the timer from the deadline the SESSION returned, and the
  // session port is an implementation someone else supplies — so the
  // run's budget was whatever the sandbox asserted rather than what was
  // captured and authorized. A session may offer less; it may never
  // grant more, and a proof control may only shorten further.
  env.deadline.arm(
    boundedDeadlineMs(
      authority.profile.value.limits.wall_clock_seconds,
      prepared.handle.deadline.wall_clock_seconds,
      env.controls.deadline_ms,
    ),
    env.controls.cancelAfterMs,
  )

  return {
    kind: 'earned',
    cause: `session ${prepared.handle.session_ref} started; consent recorded by ${request.consent?.by ?? 'unknown'}`,
  }
}
