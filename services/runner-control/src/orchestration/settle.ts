/**
 * TERMINAL SETTLEMENT after interruption or an escaping port fault.
 *
 * Ordinary orchestration runs behind the governed deadline. Once that
 * deadline fires, its boundary must not also reject the writes that record
 * the terminal. Settlement therefore receives a fresh, short call guard:
 * long enough to interrupt/close and write the governed record, still
 * finite if any cleanup port is broken.
 *
 * No walk is raced or abandoned here. Each awaited call is guarded, so a
 * rejection unwinds at that exact call and no continuation later resumes.
 */
import { isTerminal } from '../lifecycle/index.js'
import type { Ports } from '../ports/index.js'
import type { RunScope } from '../run/scope.js'
import type { RunEnvironment } from './environment.js'
import { guardPorts } from './ports.js'
import type { RunConclusion } from './result.js'
import { noObservations, type EstablishedRun } from './state.js'
import { finish, terminateEarly, writeEarlyTerminalRecord } from './terminate.js'

type FlushJournal = (scope: RunScope, ports: Ports) => Promise<void>

const cleanupEnvironment = (
  env: RunEnvironment,
  ports: Ports,
  commitSignal: AbortSignal,
  flushJournal: FlushJournal,
): RunEnvironment => ({
  ...env,
  ports,
  commitSignal,
  journalTick: () => flushJournal(env.scope, ports),
  journalTickThrough: (through) => flushJournal(env.scope, through),
  journalAcquisition: async () => {},
})

/**
 * A cancellation or timeout interrupted a port call.
 *
 * Session interruption gets its own bounded attempt so a broken L9 stop
 * does not consume the record's entire settlement window.
 */
export const settleInterrupt = async (
  env: RunEnvironment,
  state: EstablishedRun,
  reason: 'cancel' | 'timeout',
  rawPorts: Ports,
  flushJournal: FlushJournal,
): Promise<RunConclusion> => {
  const { scope } = env
  const detail = `the run was ${reason === 'cancel' ? 'cancelled' : 'timed out'} while a port was in flight`
  env.deadline.disarm()

  if (scope.session !== undefined) {
    const stopWindow = env.deadline.settlement()
    try {
      await guardPorts(rawPorts, stopWindow).session.interrupt({
        ...scope.fence,
        session_ref: scope.session.session_ref,
        reason,
      })
    } catch {
      // Best effort. The record below still has to say the interrupt
      // happened even if the concrete stop mechanism is broken.
    } finally {
      stopWindow.disarm()
    }
  }

  const recordWindow = env.deadline.settlement()
  const ports = guardPorts(rawPorts, recordWindow)
  const cleanupEnv = cleanupEnvironment(env, ports, recordWindow.signal, flushJournal)
  try {
    if (state.at !== 'requested') {
      const stopped = await finish(
        cleanupEnv,
        state.authority,
        state.at === 'observed' ? state.observations : noObservations(),
        reason,
        detail,
        reason === 'cancel' ? 'CANCELLED' : 'TIMED_OUT',
      )
      return stopped.value
    }

    // An explicit boundary check may already have advanced REQUESTED to
    // its terminal before the original guarded evidence write noticed
    // the raised abort. Terminalizing twice is correctly refused, so
    // resume at the missing WRITE rather than asking for the transition
    // again.
    if (isTerminal(scope.machine.state)) {
      return (await writeEarlyTerminalRecord(cleanupEnv, detail)).value
    }
    return (await terminateEarly(cleanupEnv, reason, detail)).value
  } catch (error) {
    return await interruptFallback(cleanupEnv, reason, detail, error, flushJournal)
  } finally {
    recordWindow.disarm()
  }
}

const interruptFallback = async (
  env: RunEnvironment,
  reason: 'cancel' | 'timeout',
  detail: string,
  error: unknown,
  flushJournal: FlushJournal,
): Promise<RunConclusion> => {
  const { scope, request } = env
  if (scope.fenceLost === undefined) scope.reachTerminal(reason, detail)
  try {
    await flushJournal(scope, env.ports)
  } catch {
    // The truthful in-memory conclusion below remains available.
  }
  try {
    await scope.release(env.ports, false)
  } catch {
    // The settlement boundary already bounded this cleanup.
  }

  let produced: RunConclusion['produced'] = 'none'
  if (
    !scope.authorityCaptured &&
    scope.fenceLost === undefined &&
    isTerminal(scope.machine.state)
  ) {
    try {
      produced = (await writeEarlyTerminalRecord(env, detail)).value.produced
    } catch {
      // A record sink that did not settle cannot be described as written.
    }
  }

  const base = {
    run_id: request.run_id,
    detail: `${detail}; terminal settlement was incomplete: ${describe(error)}`,
    transitions: scope.machine.transitionRecord,
    rejections: scope.machine.rejections,
  }
  const final = scope.machine.state
  if (scope.fenceLost !== undefined) {
    return { ...base, kind: 'ownership_lost', state: final, produced: 'none' }
  }
  if (isTerminal(final)) return { ...base, kind: 'terminal', state: final, produced }
  return { ...base, kind: 'unterminated', state: final, produced: 'none' }
}

/**
 * Last-resort recovery for an escaping port fault.
 *
 * The record shape follows the state the real run established. A fault
 * before authority still attempts the governed early-terminal record; a
 * fault at or after PROFILE_RESOLVED retries terminalization as
 * INDETERMINATE with the captured authority and truthful observations,
 * so D11's full-bundle rule also holds on the exception path. The fresh
 * settlement capability keeps that retry finite.
 */
export const recoverRun = async (
  env: RunEnvironment,
  detail: string,
  rawPorts: Ports,
  flushJournal: FlushJournal,
): Promise<RunConclusion> => {
  env.deadline.disarm()
  const window = env.deadline.settlement()
  const ports = guardPorts(rawPorts, window)
  const cleanupEnv = cleanupEnvironment(env, ports, window.signal, flushJournal)
  const { scope, request } = cleanupEnv
  const dispossessed = scope.fenceLost !== undefined
  let reported = detail
  let produced: RunConclusion['produced'] = 'none'

  if (!dispossessed && scope.established.at !== 'requested') {
    try {
      const stopped = await finish(
        cleanupEnv,
        scope.established.authority,
        scope.established.at === 'observed' ? scope.established.observations : noObservations(),
        'indeterminate',
        detail,
        'INDETERMINATE',
      )
      return stopped.value
    } catch (error) {
      reported = `${detail}; full-bundle recovery was incomplete: ${describe(error)}`
    }
  }

  const reached = dispossessed
    ? { ok: false as const, detail: scope.fenceLost ?? 'ownership moved' }
    : scope.reachTerminal('indeterminate', reported)
  reported = reached.ok ? reported : `${reported}; ${reached.detail}`

  try {
    await flushJournal(scope, ports)
  } catch {
    // Entries that did not land remain pending; the conclusion does not
    // pretend otherwise.
  }

  if (!scope.authorityCaptured && !dispossessed) {
    try {
      produced = (await writeEarlyTerminalRecord(cleanupEnv, reported)).value.produced
    } catch {
      // The last-resort boundary still guarantees `run()` resolves.
    }
  } else {
    try {
      await scope.release(ports, false)
    } catch {
      // The settlement window bounds a broken teardown.
    }
  }
  window.disarm()

  const base = {
    run_id: request.run_id,
    detail: reported,
    transitions: scope.machine.transitionRecord,
    rejections: scope.machine.rejections,
  }
  const final = scope.machine.state
  if (dispossessed) return { ...base, kind: 'ownership_lost', state: final, produced: 'none' }
  if (!isTerminal(final)) return { ...base, kind: 'unterminated', state: final, produced: 'none' }
  return { ...base, kind: 'terminal', state: final, produced }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
