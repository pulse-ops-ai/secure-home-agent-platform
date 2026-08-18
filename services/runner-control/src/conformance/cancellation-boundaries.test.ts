/**
 * RO-EX-97: cancellation is honoured at EVERY declared boundary.
 *
 * `RunSignals.interrupt` says it is consulted before each declared
 * transition. It was not. `requested()` performed the whole production
 * acquisition without asking, and `eligible()` provisioned a workspace,
 * prepared a session and STARTED it — the spend — without asking either.
 * The first check a cancelled run met was in `sandboxStarted`, after
 * `run.started` and `capability.granted` had already been emitted.
 *
 * The killing fixture is small: return nothing the first time, cancel
 * afterwards. The old code passed its single check and then spent.
 *
 * These assert the EFFECTS THAT MUST NOT HAVE HAPPENED, not just the
 * terminal state. A run that reaches CANCELLED having already spent is
 * cancelled in name only.
 */
import { describe, expect, it } from 'vitest'
import { Runner } from '../runner.js'
import {
  RecordingSession,
  RecordingWorkspaceLifecycle,
  runRequest,
  testPorts,
} from '../testing-fixtures.js'

/** Nothing on the Nth check, cancel from then on. */
const cancelAfter = (checks: number) => {
  let seen = 0
  return () => {
    seen += 1
    return seen > checks ? ('cancel' as const) : undefined
  }
}

describe('RO-EX-97: REQUESTED honours cancellation before acquiring authority', () => {
  it('a run cancelled at the start reads no authority', async () => {
    const ports = testPorts()
    const conclusion = await new Runner(ports).run(runRequest(), { interrupt: cancelAfter(0) })

    expect(conclusion.state).toBe('CANCELLED')
    expect(
      ports.authority.reads,
      'a cancelled run must not acquire the authority it will never use',
    ).toHaveLength(0)
  })
})

describe('RO-EX-97: ELIGIBLE honours cancellation before spending', () => {
  it('a run cancelled after eligibility neither provisions nor starts a session', async () => {
    const workspace = new RecordingWorkspaceLifecycle()
    const session = new RecordingSession()
    // Two checks pass (REQUESTED, PROFILE_RESOLVED), then cancellation
    // becomes active. The spend must not happen on the strength of an
    // earlier answer.
    const ports = testPorts({ workspace, session })
    const conclusion = await new Runner(ports).run(runRequest(), { interrupt: cancelAfter(2) })

    expect(conclusion.state).toBe('CANCELLED')
    expect(workspace.calls, 'a cancelled run provisions nothing').not.toContain('provision')
    expect(session.calls, 'nor opens a session — opening one IS the spend').not.toContain('prepare')
    expect(ports.adapter.requests, 'and never reaches the provider').toHaveLength(0)
  })
})

describe('RO-EX-97: a cancelled run with an open session is INTERRUPTED, not merely closed', () => {
  it('cancellation after the session opened interrupts it', async () => {
    const session = new RecordingSession()
    // Three checks pass — REQUESTED, PROFILE_RESOLVED and ELIGIBLE — so
    // the session is open when cancellation arrives at SANDBOX_STARTED.
    const ports = testPorts({ session })
    const conclusion = await new Runner(ports).run(runRequest(), { interrupt: cancelAfter(3) })

    expect(conclusion.state).toBe('CANCELLED')
    expect(session.calls, 'the session was opened').toContain('start')
    // `finish()` closes; only `abortRun()` interrupts. A session left
    // running while the run reports CANCELLED is cancellation in name
    // only — stopping it is the session's job, and it has to be asked.
    expect(session.calls, 'an open session must be interrupted, not just closed').toContain(
      'interrupt',
    )
  })
})
