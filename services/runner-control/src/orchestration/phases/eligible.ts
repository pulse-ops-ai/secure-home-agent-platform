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
import { abortRun, conclude, finish } from '../terminate.js'

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
    //
    // Recorded on the scope so the conclusion can tell a HOLD from a run
    // the machine simply granted no terminal for — two different
    // non-terminal endings that the flat shape called the same thing.
    scope.held = spend.detail
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

  // ARMED BEFORE THE FIRST CALL THAT CAN HANG, not after the last one.
  //
  // The wall clock used to start once `session.start()` had returned, so
  // a session port that never settled left `run()` unresolved forever
  // with the machine stuck at ELIGIBLE and no terminal recorded — the
  // unbounded run the model forbids. There is no chicken-and-egg here:
  // the profile's budget is already captured, and it is the authority on
  // the wall clock anyway.
  env.deadline.arm(
    boundedDeadlineMs(
      authority.profile.value.limits.wall_clock_seconds,
      authority.profile.value.limits.wall_clock_seconds,
      env.controls.deadline_ms,
    ),
    env.controls.cancelAfterMs,
  )

  const prepared = await env.deadline.until(
    ports.session.prepare({
      ...scope.fence,
      profile: { ...authority.profile.value.identity, digest: authority.profile.digest },
      limits: authority.profile.value.limits,
    }),
  )
  if (prepared === undefined) return abortRun(env, authority, noObservations())
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

  const started = await env.deadline.until(
    ports.session.start({ ...scope.fence, session_ref: prepared.handle.session_ref }),
  )
  if (started === undefined) return abortRun(env, authority, noObservations())
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

  // The session may narrow the budget it was armed with; it may never
  // widen it. Re-arming with the minimum keeps the profile authoritative
  // while honouring a sandbox that offers less.
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
