/**
 * RO-EX-51…57: the execution session, and cancellation that can actually
 * reach a call in flight.
 *
 * Two gaps, one root.
 *
 * `SANDBOX_STARTED` was entered by asserting it. Consent succeeded, the
 * machine moved, and no execution operation had occurred — the execution
 * port's only operation was `runGate`, which has nothing to do with a
 * session existing. The lifecycle spec says the REAL sandbox start is
 * deferred; it does not say the state is entered without one.
 *
 * And cancellation was polled between phases, which cannot interrupt a
 * hung `invoke()` or `runGate()` — the two calls most likely to hang.
 * "Cancellation must be effective, not advisory" is unprovable against a
 * design that can only check when nothing is happening.
 *
 * Both want the same seam, and it wants to exist BEFORE L9: a session
 * with a handle, a deadline, and an interrupt. L9 supplies the real
 * implementation and proves teardown; forcing it to redesign the port
 * first would make effective cancellation L9's problem to invent rather
 * than L9's problem to enforce.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import {
  HangingAdapter,
  StaticWorkspaceObserver,
  HangingExecution,
  RecordingSession,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

describe('RO-EX-51: SANDBOX_STARTED is caused, not asserted', () => {
  it('the session is prepared and started before the state is entered', async () => {
    const session = new RecordingSession()
    const conclusion = await new Runner(testPorts({ session })).run(runRequest())

    expect(conclusion.state).toBe('COMPLETED')
    expect(session.calls.slice(0, 2)).toEqual(['prepare', 'start'])
    const entered = conclusion.transitions.find((entry) => entry.to === 'SANDBOX_STARTED')
    expect(entered, 'the run must actually reach the state').toBeDefined()
  })

  it('a session that cannot be prepared does not reach SANDBOX_STARTED', async () => {
    const session = new RecordingSession({ prepare: 'no capacity' })
    const ports = testPorts({ session })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.transitions.map((entry) => entry.to)).not.toContain('SANDBOX_STARTED')
    expect(conclusion.state).toBe('OPERATIONAL_FAILURE')
    expect(ports.adapter.requests, 'nothing may run without a session').toHaveLength(0)
  })

  it('a session that cannot be started does not reach SANDBOX_STARTED either', async () => {
    const session = new RecordingSession({ start: 'sandbox refused to start' })
    const ports = testPorts({ session })
    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.transitions.map((entry) => entry.to)).not.toContain('SANDBOX_STARTED')
    expect(ports.adapter.requests).toHaveLength(0)
  })
})

describe('RO-EX-52: the session is always closed', () => {
  it('a completed run closes its session', async () => {
    const session = new RecordingSession()
    await new Runner(testPorts({ session })).run(runRequest())
    expect(session.calls.at(-1)).toBe('close')
  })

  it('a refused run closes the session it opened', async () => {
    // The refusal has to happen AFTER the session opens, or the test
    // proves nothing about closing. An unknown gate is refused by
    // eligibility, before any session exists; a substituted workspace
    // base is refused in the phase after `commit_spend`.
    const session = new RecordingSession()
    const conclusion = await new Runner(
      testPorts({
        session,
        workspace: new StaticWorkspaceObserver(
          { ok: true, changes: [] },
          { ok: true, digest: `sha256:${'c'.repeat(64)}` },
        ),
      }),
    ).run(runRequest())

    expect(conclusion.state).toBe('REFUSED')
    expect(session.calls).toContain('start')
    expect(session.calls.at(-1)).toBe('close')
  })

  it('a run that never opened one closes nothing', async () => {
    const session = new RecordingSession()
    await new Runner(testPorts({ session })).run(runRequest({ profile_ref: null }))
    expect(session.calls).toEqual([])
  })
})

describe('RO-EX-53: a hung adapter invocation is interrupted', () => {
  it('the run times out rather than hanging forever', async () => {
    const session = new RecordingSession()
    const conclusion = await new Runner(testPorts({ session, adapter: new HangingAdapter() })).run(
      runRequest(),
      { deadline_ms: 20 },
    )

    expect(conclusion.state, 'a hung provider must not hold the run open').toBe('TIMED_OUT')
    // The session was told to interrupt — the seam L9 makes effective.
    expect(session.calls).toContain('interrupt')
    expect(session.calls.at(-1)).toBe('close')
  })
})

describe('RO-EX-54: a hung gate is interrupted', () => {
  it('the run times out rather than waiting on the gate', async () => {
    const session = new RecordingSession()
    const conclusion = await new Runner(
      testPorts({ session, execution: new HangingExecution() }),
    ).run(runRequest(), { deadline_ms: 20 })

    expect(conclusion.state).toBe('TIMED_OUT')
    expect(session.calls).toContain('interrupt')
  })
})

describe('RO-EX-55: cancellation reaches work in flight', () => {
  it('an abort during a hung call cancels the run, not merely records intent', async () => {
    const session = new RecordingSession()
    const adapter = new HangingAdapter()
    const conclusion = await new Runner(testPorts({ session, adapter })).run(runRequest(), {
      // Fires while the adapter is hung, not between phases.
      cancelAfterMs: 20,
    })

    expect(conclusion.state).toBe('CANCELLED')
    expect(session.calls).toContain('interrupt')
    // The port was actually told, through the signal it was handed.
    expect(adapter.aborted, 'the in-flight call must observe the abort').toBe(true)
  })
})

describe('RO-EX-56: the session handle and signal reach the work', () => {
  it('the adapter and the gates receive the session ref and an abort signal', async () => {
    const session = new RecordingSession()
    const ports = testPorts({ session })
    await new Runner(ports).run(runRequest())

    const invocation = ports.adapter.requests[0]
    expect(invocation?.workspace.session_ref).toBe(session.handle.session_ref)
    expect(invocation?.signal, 'L9 binds teardown to this').toBeDefined()

    const gate = ports.execution.requests[0]
    expect(gate?.session_ref).toBe(session.handle.session_ref)
    expect(gate?.signal).toBeDefined()
  })
})

describe('RO-EX-57: the deadline comes from the profile', () => {
  it('a run with no explicit deadline uses the profile wall clock', async () => {
    const session = new RecordingSession()
    await new Runner(testPorts({ session })).run(runRequest())
    // The fixture profile declares 600s; the prepared session carries it.
    expect(session.prepared?.limits.wall_clock_seconds).toBe(600)
  })

  it('the session is prepared with the run identity, never a bare handle', async () => {
    const session = new RecordingSession()
    await new Runner(testPorts({ session })).run(runRequest())
    expect(session.prepared?.run_id).toBe(RUN)
  })
})
