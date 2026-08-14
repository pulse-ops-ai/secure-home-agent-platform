/**
 * How a run ends. Every path, in one module.
 *
 * These were local closures inside the walk, which is why they could
 * read state nobody passed them and why two of them skipped the machine.
 * As functions they take what they need: `terminateEarly` needs no
 * authority because a run without one is precisely what it is for, and
 * `finish` needs authority AND observations because a bundle is made of
 * both. What a terminal can say is now visible in its signature.
 */
import { reconcileClaims } from '@secure-home/runner-core'
import {
  canConstructEvidence,
  isTerminal,
  type LifecycleState,
  type PhaseCommand,
  type RejectionEntry,
  type TransitionKind,
} from '../lifecycle/index.js'
import { assembleEvidence, buildEarlyTerminationRecord } from '../finalization/records.js'
import type { EmitOutcome } from '../events/index.js'
import type { RunEnvironment } from './environment.js'
import { stop, type RunConclusion, type Stop } from './result.js'
import type { Authority, Observations } from './state.js'
import { noObservations, type WalkState } from './state.js'

/** The terminals a run without authority can reach. */
export type EarlyTerminal = Extract<
  TransitionKind,
  'refuse' | 'operational_fault' | 'cancel' | 'timeout' | 'indeterminate'
>

/**
 * Conclude the run: persist the transition record, then report.
 *
 * Every exit goes through here, so the durable walk is written on the
 * refusal and hold paths too — those are precisely the runs whose walk
 * someone will want to reconstruct.
 *
 * Nothing is written to the evidence sink here. The journal is the
 * durable transition record; a second write after the seal made the seal
 * not the run's last write.
 */
export const conclude = async (
  env: RunEnvironment,
  produced: RunConclusion['produced'],
  detail: string,
): Promise<RunConclusion> => {
  // THE RUN IS WRITING ITS ENDING. Its ports stop being bound by
  // the interruption they are recording, and are bounded by the
  // cleanup budget instead — see `RunDeadline.settle`.
  env.deadline.settle()
  const { scope, request } = env
  await env.journalTick()
  // One more attempt for anything a failed append left pending, so the
  // durable record is as complete as the journal allowed.
  await env.journalTick()
  // One release path, shared with the exception handler. Releasing here
  // and separately there is how the two drifted: the handler's version
  // discarded nothing, so every throw leaked the workspace and timer.
  await scope.release(env.ports)
  const base = {
    run_id: request.run_id,
    transitions: scope.machine.transitionRecord,
    rejections: scope.machine.rejections,
  }
  const state = scope.machine.state
  if (scope.fenceLost !== undefined) {
    // OWNERSHIP MOVED. Everything a conclusion would write is refused by
    // the fence — including the cleanup, which `release` therefore
    // skips: the workspace and session belong to whoever holds the run
    // now, and discarding them would destroy a run in progress. Leaking
    // is recoverable; deleting a live workspace is not.
    return {
      ...base,
      kind: 'ownership_lost',
      state,
      produced: 'none',
      detail: `${scope.fenceLost}; no further write was made (this attempt had reached: ${detail})`,
    }
  }
  // A NON-TERMINAL CONCLUSION IS NOT AUTOMATICALLY A HOLD. `held` means a
  // precondition is unmet and the run waits; a machine that granted no
  // terminal at all is `unterminated`, which is what RO-INV-50 requires
  // the conclusion to report and what the flat shape had no way to say.
  if (isTerminal(state)) return { ...base, kind: 'terminal', state, produced, detail }
  return {
    ...base,
    kind: scope.held ? 'held' : 'unterminated',
    state,
    produced: 'none',
    detail,
  }
}

/**
 * Terminate before authority completed: the early-terminal record, never
 * a bundle.
 *
 * The requester is carried verbatim from the request — never derived
 * from a captured profile, which a run that got this far may nonetheless
 * have (RO-INV-09).
 */
export const terminateEarly = async (
  env: RunEnvironment,
  kind: EarlyTerminal,
  detail: string,
): Promise<Stop> => {
  // THE RUN IS WRITING ITS ENDING. Its ports stop being bound by
  // the interruption they are recording, and are bounded by the
  // cleanup budget instead — see `RunDeadline.settle`.
  env.deadline.settle()
  // OWNERSHIP FIRST, BEFORE THE MACHINE IS TOUCHED.
  //
  // The write guard further down caught the record; it did not catch the
  // TRANSITION. So a run that already knew it had been dispossessed
  // still minted a terminal locally — OPERATIONAL_FAILURE on its own
  // machine — and then reported `ownership_lost` carrying that state.
  // Declaring the logical run's terminal is the one thing a stale holder
  // may not do, and it was doing it before anything asked.
  if (env.scope.fenceLost !== undefined) return stop(await conclude(env, 'none', detail))
  const reached = env.scope.reachTerminal(kind, detail)
  if (!reached.ok) return stop(await conclude(env, 'none', `${reached.detail}: ${detail}`))
  return writeEarlyTerminalRecord(env, detail)
}

/**
 * Write the early-terminal record for a machine that is ALREADY terminal.
 *
 * Split from `terminateEarly` because terminalizing twice is not
 * idempotent — it is refused. The exception handler advances the machine
 * itself (it has to: the terminal must reflect the state the run
 * actually reached), and then called `terminateEarly`, whose own
 * transition was refused for exactly that reason. The function concluded
 * `none` before ever building the record, so a run that terminated in
 * REQUESTED produced no governed record at all.
 *
 * One terminalization, then one write. Callers do the first; this does
 * the second.
 */
export const writeEarlyTerminalRecord = async (
  env: RunEnvironment,
  detail: string,
): Promise<Stop> => {
  // THE RUN IS WRITING ITS ENDING. Its ports stop being bound by
  // the interruption they are recording, and are bounded by the
  // cleanup budget instead — see `RunDeadline.settle`.
  env.deadline.settle()
  const { scope, request, ports } = env
  // THE SAME GUARD `finish` HAS. Without it a dispossessed run wrote its
  // governed record and then reported, in the same conclusion, that no
  // further write was made — the record landing strictly after ownership
  // moved.
  if (scope.fenceLost !== undefined) return stop(await conclude(env, 'none', detail))
  const record = buildEarlyTerminationRecord({
    run_id: request.run_id,
    requester: request.requester,
    requested_profile: request.profile_ref,
    state: scope.machine.state,
    detail,
    started_at: scope.startedAt,
    finished_at: ports.clock.now({ run_id: request.run_id }),
  })
  if (!record.ok) return stop(await conclude(env, 'none', record.detail))

  const written = await ports.evidence.write({
    ...scope.fence,
    kind: 'early_termination_record',
    record: record.record,
  })
  if (!written.ok) {
    scope.loseFence(written.detail)
    return stop(await conclude(env, 'none', detail))
  }
  return stop(await conclude(env, 'early_termination_record', detail))
}

/**
 * Emit one run event.
 *
 * Registered with the ledger, so "the seal is the final write" is a
 * claim about the writes that actually happened. Without it the ledger's
 * sequence was empty and seal-last held vacuously.
 */
export const emit = async (
  env: RunEnvironment,
  authority: Authority,
  body: Record<string, unknown>,
): Promise<EmitOutcome> => {
  env.ledger.open('event', String(body['event_type']))
  // CLOSED EVEN WHEN THE EMIT RAISES. An abort reaching an outstanding
  // emission left the entry open forever, so the run's own terminal path
  // then found an outstanding write, refused to seal, and reported
  // OPERATIONAL_FAILURE — a run that timed out describing itself as
  // broken. An emission that raised is not a write still in flight from
  // this run's point of view; it is a write that did not land.
  let outcome: EmitOutcome
  try {
    outcome = await authority.emitter.emit(body)
  } finally {
    env.ledger.close()
  }
  // An emission the fence refused is not an emission failure to
  // terminate on — it is the run ceasing to be ours mid-phase.
  if (!outcome.ok && outcome.reason === 'stale_fence') env.scope.loseFence(outcome.detail)
  return outcome
}

/**
 * Terminate a run that has authority: assemble, seal, and commit.
 *
 * Beyond `PROFILE_RESOLVED` every terminal can construct a full bundle,
 * which is why this takes an `Authority` rather than checking for one.
 */
export const finish = async (
  env: RunEnvironment,
  authority: Authority,
  observations: Observations,
  kind: TransitionKind,
  detail: string,
  terminal: LifecycleState,
  // Always a Stop: every path here ends the run. Saying so in the type
  // is what lets a phase return `finish(...)` directly, whatever that
  // phase's own outcome type promises to establish.
): Promise<Stop> => {
  // THE RUN IS WRITING ITS ENDING. Its ports stop being bound by
  // the interruption they are recording, and are bounded by the
  // cleanup budget instead — see `RunDeadline.settle`.
  env.deadline.settle()
  const { scope, request, ports, ledger } = env
  // THE FENCE IS CHECKED BEFORE ANY TERMINAL IS ASSEMBLED. One guard
  // here covers every terminal, because they all funnel through this.
  if (scope.fenceLost !== undefined) return stop(await conclude(env, 'none', detail))

  // ORDER MATTERS, twice over. The terminal transition is taken LAST,
  // after the bundle is sealed: advancing first would let a sink fault
  // leave the run reporting COMPLETED with nothing sealed. And
  // `run.terminated` is committed WITH the seal, not before it — an
  // event written after the seal makes the seal not-last.
  const assembled = assembleEvidence({
    snapshots: authority.snapshots,
    run_id: request.run_id,
    principal: authority.principal,
    adapter: authority.adapter,
    terminal,
    detail,
    gate_results: observations.gate_results,
    operations: observations.operations,
    observed: observations.observed,
    artifacts: observations.artifacts,
    reconciliation: reconcileClaims(observations.observed, request.claimed_changes ?? []),
    started_at: scope.startedAt,
    finished_at: ports.clock.now({ run_id: request.run_id }),
  })

  const failClosed = async (
    why: string,
    as: TransitionKind = 'operational_fault',
  ): Promise<Stop> => {
    const reached = scope.reachTerminal(as, why)
    return stop(await conclude(env, 'none', reached.ok ? why : `${why}; ${reached.detail}`))
  }

  if (!assembled.ok) {
    // A contract refusal terminates REFUSED; only an environmental fault
    // terminates OPERATIONAL_FAILURE. Mapping both to the latter would
    // relabel a policy decision as an infrastructure problem.
    return await failClosed(
      assembled.detail,
      assembled.failure === 'refusal' ? 'refuse' : 'operational_fault',
    )
  }

  // The full terminal sequence, projected but NOT applied. A completing
  // run takes two transitions and both must be declared before either is
  // committed: sealing and only then finding `complete` undeclared would
  // leave a sealed run that cannot be completed.
  const sequence =
    kind === 'complete'
      ? ([
          { kind: 'seal_evidence' as const, cause: 'evidence sealed' },
          { kind: 'complete' as const, cause: detail },
        ] as const)
      : ([{ kind, cause: detail }] as const)
  const projected = scope.machine.project([...sequence])
  if (!projected.ok) {
    return await failClosed(
      `the machine declares no ${projected.kind} transition from ${projected.from}; nothing is committed`,
    )
  }

  // THE DURABLE RECORD MUST BE COMPLETE BEFORE THE SEAL.
  //
  // A journal append that failed stays pending for retry, and the
  // cursor that tracks it is a PREFIX marker — it cannot represent
  // "journaled, pending, journaled". The commit used to assign the
  // total, which marked the pending entry journaled and dropped it: the
  // run completed with its durable walk silently short one transition,
  // no rejection and no hold marking the gap.
  //
  // So the pending set is flushed here, before anything is staged, and
  // a run whose walk cannot be made durable does not seal. That is the
  // same rule the ledger already applies to the run's other writes.
  await env.journalTick()
  if (scope.machine.pendingJournal().transitions.length > 0) {
    return await failClosed(
      'the run walk could not be made durable; a transition is missing from the journal and the seal would describe an incomplete record',
    )
  }

  // Seal ELIGIBILITY and seal ORDER, both decided before the commit. The
  // ledger writes nothing now: it answers whether this run's other
  // writes are all in, and asks the core whether the bundle may seal.
  const eligible = ledger.prepareSeal({ bundle: assembled.bundle, outcome: assembled.outcome })
  if (!eligible.ok) return await failClosed(`${eligible.refused}: ${eligible.detail}`)

  const committed = await ports.finalization.commit({
    ...scope.fence,
    terminal,
    transitions: projected.entries,
    event: authority.emitter.envelope({
      event_type: 'run.terminated',
      outcome: assembled.outcome,
    }),
    bundle: eligible.bundle,
  })
  if (!committed.ok) {
    // A commit the fence refused did not fail — it was declined. The run
    // is not terminated OPERATIONAL_FAILURE on it, because that would be
    // this attempt writing a verdict about a run that has moved on.
    if (committed.reason === 'stale_fence') {
      scope.loseFence(committed.detail)
      return stop(await conclude(env, 'none', committed.detail))
    }
    return await failClosed(committed.detail)
  }
  ledger.markSealed()
  // The machine adopts the entries that were COMMITTED, verbatim —
  // through the terminal owner, like every other machine mutation.
  scope.adoptCommitted(projected.capability)
  return stop(await conclude(env, 'evidence_bundle', detail))
}

/**
 * Terminate a run whose in-flight work was abandoned.
 *
 * The session is INTERRUPTED first. Abandoning the call would leave
 * whatever it started still running, which is the difference between
 * cancellation that is effective and cancellation that is a note in a
 * log. Proving the interrupt stops things is L9's; giving it something
 * to prove is this landing's.
 */
/**
 * Conclude a run whose budget or cancellation reached an outstanding
 * call, with the governed record its established state owes.
 *
 * Failure semantics: a termination in REQUESTED owes an early-terminal
 * refusal record; one at or after PROFILE_RESOLVED owes a fully sealed
 * bundle, with empty sets where nothing ran. The path that used to
 * handle this held the scope and neither an `Authority` nor
 * `Observations`, so it wrote NEITHER — and which record a run received
 * came down to whether a hung port answered inside a grace window.
 * `scope.established` is the value that decides it.
 */
export const concludeAborted = async (
  env: RunEnvironment,
  reason: 'cancel' | 'timeout',
): Promise<RunConclusion> => {
  const established = env.scope.established
  if (established.at === 'requested') {
    return (await terminateEarly(env, reason, `the run was ${describeReason(reason)}`)).value
  }
  return (
    await abortRun(
      env,
      established.authority,
      established.at === 'observed' ? established.observations : noObservations(),
      reason,
    )
  ).value
}

/** How a run states the reason it stopped. */
export const describeReason = (reason: 'cancel' | 'timeout'): string =>
  reason === 'cancel' ? 'cancelled' : 'timed out'

export const abortRun = async (
  env: RunEnvironment,
  authority: Authority,
  observations: Observations,
  // The raised deadline knows its own reason; a POLLED interrupt does
  // not set one, so the caller passes what it was told. Defaulting to
  // 'cancel' would report a timeout as a cancellation.
  reason: 'cancel' | 'timeout' = env.deadline.reason ?? 'cancel',
): Promise<Stop> => {
  // THE RUN IS WRITING ITS ENDING. Its ports stop being bound by
  // the interruption they are recording, and are bounded by the
  // cleanup budget instead — see `RunDeadline.settle`.
  env.deadline.settle()
  const { scope, ports } = env
  if (scope.session !== undefined) {
    try {
      await ports.session.interrupt({
        ...scope.fence,
        session_ref: scope.session.session_ref,
        reason,
      })
    } catch {
      // An interrupt that throws is reported by the session's own
      // implementation. It must not stop the run terminating, or a
      // broken teardown would also cost us the record of it.
    }
  }
  return finish(
    env,
    authority,
    observations,
    reason,
    `the run was ${reason === 'cancel' ? 'cancelled' : 'timed out'} while work was in flight`,
    reason === 'cancel' ? 'CANCELLED' : 'TIMED_OUT',
  )
}

/**
 * Terminate a run halted by a REJECTED transition, with the record its
 * established state can construct.
 */
/**
 * A phase earned a transition the machine REFUSED.
 *
 * The walk has stopped and no later phase ran, but the run is still in
 * a non-terminal state and the lifecycle requirement forbids
 * abandoning it there. `canConstructEvidence` chooses the shape: a run
 * past REQUESTED has the identities a bundle needs; one still in
 * REQUESTED does not.
 */
export const terminateFromRejection = async (
  env: RunEnvironment,
  state: WalkState,
  halt: { readonly phase: string; readonly rejection: RejectionEntry },
): Promise<RunConclusion> => {
  const why = `the ${halt.phase} phase earned ${halt.rejection.attempted}, which the machine refused from ${halt.rejection.state}: ${halt.rejection.detail}`
  const stopped: PhaseCommand<RunConclusion> =
    canConstructEvidence(env.scope.machine.state) && state.at !== 'requested'
      ? await finish(
          env,
          state.authority,
          state.at === 'observed' ? state.observations : noObservations(),
          'operational_fault',
          why,
          'OPERATIONAL_FAILURE',
        )
      : await terminateEarly(env, 'operational_fault', why)
  return stopped.kind === 'terminate' ? stopped.value : await conclude(env, 'none', why)
}
