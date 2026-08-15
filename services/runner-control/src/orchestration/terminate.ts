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
import type { Ports } from '../ports/index.js'
import { isTerminal, type LifecycleState, type TransitionKind } from '../lifecycle/index.js'
import { assembleEvidence, buildEarlyTerminationRecord } from '../finalization/records.js'
import type { EmitOutcome } from '../events/index.js'
import type { RunEnvironment } from './environment.js'
import { guardPorts } from './ports.js'
import { stop, type RunConclusion, type Stop } from './result.js'
import type { Authority, Observations } from './state.js'

/**
 * The clock, as terminalization may consult it.
 *
 * A throwing clock is one of the port faults these paths exist to
 * record. Reading it raw while BUILDING the record made the recording
 * die of the fault it was recording — the machine already substitutes
 * this instant for exactly that reason, and the terminal record follows
 * the same rule rather than a stricter one it cannot honour.
 */
const safeNow = (ports: Ports, run_id: string): string => {
  try {
    return ports.clock.now({ run_id })
  } catch {
    return '1970-01-01T00:00:00.000Z'
  }
}

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
  const { scope, request } = env
  // The terminal has already been established and its governed record
  // written (or atomically committed). From here, a late run timeout must
  // not relabel it. Journal completion and cleanup move to their own
  // finite settlement boundary instead.
  env.deadline.disarm()
  const settlement = env.deadline.settlement()
  const ports =
    env.cleanupPorts === undefined ? env.ports : guardPorts(env.cleanupPorts, settlement)
  const journalTick = env.journalTickThrough ?? (() => env.journalTick())
  try {
    await journalTick(ports)
    // One more attempt for anything a failed append left pending, so the
    // durable record is as complete as the journal allowed.
    await journalTick(ports)
    await scope.release(ports, false)
  } finally {
    settlement.disarm()
  }
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
  // A CONCLUSION MAY CLAIM ONLY DURABLE FACTS. Every conclusion below
  // this line makes a durability claim — `terminal` says the governed
  // record is complete, `held` says a durable resumable identity exists
  // — and the one outbox knows whether the durable walk actually
  // landed. A run whose required journal facts are still pending
  // reports the authorized settlement-failure semantics instead,
  // WHATEVER else physically landed: a written early-terminal record
  // over a journal missing an acquisition is not a durable terminal,
  // and an in-process object remembering a hold is not a held run.
  if (!scope.outbox.isEmpty()) {
    const missing =
      'a required durable journal fact is still pending; the conclusion cannot claim a durable record it does not have'
    if (isTerminal(state)) {
      return {
        ...base,
        kind: 'settlement_failed',
        state,
        intended_terminal: state,
        produced: 'none',
        detail: `${detail}; ${missing}`,
      }
    }
    return {
      ...base,
      kind: 'unterminated',
      state,
      produced: 'none',
      detail: `${detail}; ${missing}`,
    }
  }
  // A NON-TERMINAL CONCLUSION IS NOT AUTOMATICALLY A HOLD. `held` means a
  // precondition is unmet and the run waits; a machine that granted no
  // terminal at all is `unterminated`, which is what RO-INV-50 requires
  // the conclusion to report and what the flat shape had no way to say.
  if (isTerminal(state)) {
    if (produced === 'none') {
      return {
        ...base,
        kind: 'settlement_failed',
        state,
        intended_terminal: state,
        produced: 'none',
        detail: `${detail}; the lifecycle terminal has no governed durable record`,
      }
    }
    return { ...base, kind: 'terminal', state, produced, detail }
  }
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
    finished_at: safeNow(ports, request.run_id),
  })
  if (!record.ok) return stop(await conclude(env, 'none', record.detail))

  const written = await ports.evidence.write({
    ...scope.fence,
    // ONE logical early-terminal record per holder, whatever the retry
    // count. The record can land while its acknowledgement is lost; the
    // settlement retry then carries this same identity and the sink
    // answers it as a replay instead of appending a second record.
    record_id: `${request.run_id}#g${String(scope.fence.generation)}#early_termination_record`,
    kind: 'early_termination_record',
    record: record.record,
  })
  if (!written.ok) {
    scope.loseFence(written.detail)
    return stop(await conclude(env, 'none', detail))
  }
  scope.recorded = 'early_termination_record'
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
  try {
    const outcome = await authority.emitter.emit(body)
    // An emission the fence refused is not an emission failure to
    // terminate on — it is the run ceasing to be ours mid-phase.
    if (!outcome.ok && outcome.reason === 'stale_fence') env.scope.loseFence(outcome.detail)
    return outcome
  } finally {
    // An interrupted or throwing emission is no longer outstanding from
    // orchestration's perspective. Leaving the ledger open would make
    // the interrupt's own evidence fail seal-ordering and relabel a
    // truthful TIMED_OUT/CANCELLED terminal as OPERATIONAL_FAILURE.
    env.ledger.close()
  }
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
    finished_at: safeNow(ports, request.run_id),
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
  // EVERY category counts — transitions, rejections, acquisitions,
  // holds — which is why the gate asks the ONE outbox they all pass
  // through rather than enumerating categories: a pending entry of any
  // kind is a hole in the reconstructable record, and a retry landing
  // it after the seal would violate seal-last from the other side.
  await env.journalTick()
  if (!scope.outbox.isEmpty()) {
    return await failClosed(
      'the run walk could not be made durable; an entry is missing from the journal and the seal would describe an incomplete record',
    )
  }

  // Seal ELIGIBILITY and seal ORDER, both decided before the commit. The
  // ledger writes nothing now: it answers whether this run's other
  // writes are all in, and asks the core whether the bundle may seal.
  const eligible = ledger.prepareSeal({ bundle: assembled.bundle, outcome: assembled.outcome })
  if (!eligible.ok) return await failClosed(`${eligible.refused}: ${eligible.detail}`)

  const committed = await ports.finalization.commit({
    ...scope.fence,
    // THE LOGICAL COMMIT IDENTITY IS ESTABLISHED HERE, at the caller
    // boundary, before the port is called — stable across retries of
    // this same intent, distinct across intents. It is what lets a
    // commit whose acknowledgement was lost be reconciled instead of
    // published twice.
    commit_id: `${request.run_id}#g${String(scope.fence.generation)}#${terminal}`,
    terminal,
    transitions: projected.entries,
    event: authority.emitter.envelope({
      event_type: 'run.terminated',
      outcome: assembled.outcome,
    }),
    bundle: eligible.bundle,
    signal: env.commitSignal ?? env.deadline.signal,
  })
  if (!committed.ok) {
    // A commit the fence refused did not fail — it was declined. The run
    // is not terminated OPERATIONAL_FAILURE on it, because that would be
    // this attempt writing a verdict about a run that has moved on.
    if (committed.reason === 'stale_fence') {
      scope.loseFence(committed.detail)
      return stop(await conclude(env, 'none', committed.detail))
    }
    // AN ATTEMPT BOUND EXPIRING IS NOT THE RUN TIMING OUT. The
    // settlement/recovery ceiling bounds RECORDING; the lifecycle
    // terminal this commit intended still stands. The machine reaches
    // that intended terminal and the attempt reports the authorized
    // settlement-failure semantics — never a manufactured TIMED_OUT.
    // `already_committed` concludes the same way: the run has a durable
    // terminal this attempt cannot verify, and inventing another would
    // be the second-terminal bug wearing a reconciliation outcome.
    if (committed.reason === 'attempt_expired' || committed.reason === 'already_committed') {
      const reached = scope.reachTerminal(kind, committed.detail)
      return stop(
        await conclude(
          env,
          'none',
          reached.ok ? committed.detail : `${committed.detail}; ${reached.detail}`,
        ),
      )
    }
    // A commit the GOVERNED expiry refused is the run's timeout — the
    // publication point declining to publish after the run's own budget
    // is exactly what the wall clock means.
    return await failClosed(
      committed.detail,
      committed.reason === 'expired' ? 'timeout' : undefined,
    )
  }
  ledger.markSealed()
  // The machine adopts the entries that were COMMITTED, verbatim —
  // through the terminal owner, like every other machine mutation.
  scope.adoptCommitted(projected.capability)
  scope.recorded = 'evidence_bundle'
  return stop(await conclude(env, 'evidence_bundle', detail))
}

/**
 * Terminate a run interrupted while work was in flight.
 *
 * The session is INTERRUPTED first. Merely unwinding the orchestration
 * call would leave whatever the session started still running. Proving
 * the interrupt stops things is L9's; giving it something to prove is
 * this landing's.
 */
export const abortRun = async (
  env: RunEnvironment,
  authority: Authority,
  observations: Observations,
  // The raised deadline knows its own reason; a POLLED interrupt does
  // not set one, so the caller passes what it was told. Defaulting to
  // 'cancel' would report a timeout as a cancellation.
  reason: 'cancel' | 'timeout' = env.deadline.reason ?? 'cancel',
): Promise<Stop> => {
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
