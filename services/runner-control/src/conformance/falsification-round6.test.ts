/**
 * FALSIFICATION ROUND 6 — the run-budget / cancellation coordinator.
 *
 * Round 5 closed seven counterexamples one at a time. What is left is not
 * seven more: it is ONE abstraction. `#walkOwned` races the whole walk
 * against the deadline and, when the grace elapses, ABANDONS it —
 *
 *     // The walk is abandoned, still running.
 *
 * — and a JavaScript continuation cannot be cancelled. So `Promise.race`
 * bounds THE CALLER'S WAIT, not the orchestration. Everything below falls
 * out of that one fact, plus the two places the budget does not reach at
 * all (before the lease is claimed, and after `release()` disarms it).
 *
 * Each test states the requirement it falsifies, carries a control
 * proving the fixture reaches the mechanism, and was RED when written.
 * None of them is repaired by another local `interrupted()` check.
 */
import { describe, expect, it, vi } from 'vitest'
import { Runner } from '../runner.js'
import { ABANDON_GRACE_MS, ACQUISITION_BUDGET_MS } from '../orchestration/controls.js'
import type { RunConclusion } from '../orchestration/result.js'
import {
  CountingAuthoritySource,
  governedWrites,
  HangingAdapter,
  profileDocument,
  RecordingWorkspaceLifecycle,
  runRequest,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'
import type { AuthorityBytes, AuthorityReadRequest, SessionPrepareRequest } from '../ports/index.js'

/**
 * The fixture's run id. `runRequest`'s consent record is bound to it, and
 * a run whose consent names a different run is held at ELIGIBLE — which
 * would stop every test below before the mechanism it is about.
 */
const RUN = 'run-20260812-0001'

const settle = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

/** Holds the FIRST authority read open until the test releases it. */
class GatedAuthority {
  readonly requested: string[] = []
  readonly #inner = new CountingAuthoritySource()
  readonly #gate: Promise<void>
  #open: (() => void) | undefined

  constructor() {
    this.#gate = new Promise<void>((resolve) => {
      this.#open = resolve
    })
  }

  release(): void {
    this.#open?.()
  }

  async read(request: AuthorityReadRequest): Promise<AuthorityBytes> {
    this.requested.push(request.source)
    if (request.source === 'profile') await this.#gate
    return await this.#inner.read(request)
  }
}

/** An observer whose base read never settles. Nothing wraps this port. */
class HangingBaseObserver {
  inFlight = false

  observe(): Promise<never> {
    return new Promise<never>(() => {})
  }

  observeBase(): Promise<never> {
    this.inFlight = true
    return new Promise<never>(() => {})
  }
}

// ======================================================================
// FINDING 1 (P1) — a run that has already CONCLUDED goes on performing
// control-plane effects.
//
// `runner-lifecycle`: "an operation that does not return SHALL NOT hold
// the run open" — satisfied. But RO-INV-70 says "An effect is not STARTED
// once the run is aborted", and the walk `#abandon` leaves running starts
// plenty. `requested()` does not re-consult the deadline after the epoch,
// and `runEpoch`'s stop hook observes `fenceLost` only — never the
// deadline — so once the hung read resolves the epoch reads the REMAINING
// authority sources and journals them, for a run that reported TIMED_OUT
// hundreds of milliseconds earlier.
//
// D13 is right that L9 owns stopping the sandbox. L9 cannot stop a
// control-plane continuation reading authority.
// ======================================================================

/** RO-EX-129, RO-EX-132 — RO-INV-74, RO-INV-77. Kills RO-MUT-68, RO-MUT-71. */
describe('a concluded run keeps performing control-plane effects', () => {
  it('the abandoned walk reads the remaining authority sources after run() returned', async () => {
    const authority = new GatedAuthority()
    const ports = testPorts({ authority })
    const runner = new Runner(ports, { deadline_ms: 20 })

    const conclusion = await runner.run(runRequest())

    // The control: the run really did hang inside acquisition, and the
    // governed wall clock really did elapse there.
    expect(authority.requested, 'the run is hung on the first authority read').toEqual(['profile'])
    expect(conclusion.state, 'and the deadline really did fire').toBe('TIMED_OUT')

    const atConclusion = [...authority.requested]

    // The hung port finally answers, long after the run is over.
    authority.release()
    await settle(150)

    // THE FINDING. `run()` resolved, the caller has its terminal, and the
    // orchestration went on reading authority for a run that has ended.
    expect(
      authority.requested,
      'a concluded run read authority it had already been told it would never use',
    ).toEqual(atConclusion)
  })

  // ====================================================================
  // The same abandonment, one layer up: the VALUE handed to the caller.
  //
  // Not in any prior round. `RunMachine.rejections` and
  // `.transitionRecord` return the machine's LIVE arrays, and `conclude`
  // and `#abandon` both put those references straight into the
  // `RunConclusion`. That is harmless while the walk is over when `run()`
  // returns — and this walk is not. It goes on to attempt
  // `resolve_profile` against a machine already at TIMED_OUT, and the
  // rejection lands in the array the caller is already holding.
  //
  // D9 has the transition record "durable, and returned to the caller".
  // A record that keeps changing after the run is reported finished is
  // not a record of what the run did; nothing downstream — evidence,
  // audit, a caller deciding whether to retry — can read it twice and get
  // the same answer.
  // ====================================================================
  it('the conclusion already returned to the caller keeps changing afterwards', async () => {
    const authority = new GatedAuthority()
    const ports = testPorts({ authority })

    const conclusion = await new Runner(ports, { deadline_ms: 20 }).run(runRequest())

    // The control: this is a finished run, reported terminal.
    expect(conclusion.kind, 'the run is over').toBe('terminal')
    const walk = {
      transitions: conclusion.transitions.length,
      rejections: conclusion.rejections.length,
    }

    authority.release()
    await settle(150)

    // THE FINDING. Same object, read twice, different answers.
    expect(
      { transitions: conclusion.transitions.length, rejections: conclusion.rejections.length },
      'the run record mutated after it was returned to the caller',
    ).toEqual(walk)
  })
})

// ======================================================================
// FINDING 2 (P1) — an abandoned terminal produces NO governed record, and
// which record a run gets is decided by scheduler latency.
//
// Failure Semantics, `runner-lifecycle`:
//
//   Termination in REQUESTED       → early-terminal refusal record
//   Cancellation/timeout at/after
//   PROFILE_RESOLVED               → declared terminal with a FULL sealed
//                                    bundle (empty sets where nothing ran)
//
// `#abandon` has the scope but neither an `Authority` nor `Observations`,
// so it writes nothing at all and returns `produced: 'none'` for a
// terminal it successfully reached. RO-INV-73 claims "An interrupted
// run's RECORD does not depend on which interrupt arrived"; it now
// depends on something worse — whether the hung port happens to answer
// inside `ABANDON_GRACE_MS`.
// ======================================================================

/** RO-EX-130, RO-EX-131 — RO-INV-75, RO-INV-76. Kills RO-MUT-69, RO-MUT-70. */
/** RO-EX-130, RO-EX-131 — RO-INV-75, RO-INV-76. Kills RO-MUT-69, RO-MUT-70. */
describe('an abandoned walk reaches a terminal and writes no governed record', () => {
  it('a timeout in REQUESTED produces no early-terminal refusal record', async () => {
    const authority = new GatedAuthority() // never released
    const ports = testPorts({ authority })

    const conclusion = await new Runner(ports, { deadline_ms: 20 }).run(runRequest())

    // The control: the run reached a terminal, from REQUESTED, before any
    // authority was captured — exactly the row of the table below.
    expect(conclusion.kind, 'the run reached a lifecycle terminal').toBe('terminal')
    expect(conclusion.state, 'from REQUESTED, by the governed wall clock').toBe('TIMED_OUT')

    // THE FINDING.
    expect(
      conclusion.produced,
      'a REQUESTED terminal produced no early-terminal refusal record',
    ).toBe('early_termination_record')
    expect(
      governedWrites(ports, RUN).map((write) => write.kind),
      'nothing durable records the terminal that was reached',
    ).toEqual(['early_termination_record'])
  })

  it('the SAME REQUESTED terminal writes the record when the port answers — the control', async () => {
    const ports = testPorts()

    const conclusion = await new Runner(ports).run(runRequest(), { interrupt: () => 'cancel' })

    expect(conclusion.state, 'the same state, a responsive port').toBe('CANCELLED')
    expect(conclusion.produced, 'and the governed record exists on that path').toBe(
      'early_termination_record',
    )
  })

  it('a timeout after PROFILE_RESOLVED seals no evidence bundle', async () => {
    const observer = new HangingBaseObserver()
    const ports = testPorts({ observer })

    const conclusion = await new Runner(ports, { deadline_ms: 40 }).run(runRequest())

    // The control: authority WAS captured and the session WAS started, so
    // this is a state the spec says can construct the full identity set.
    expect(observer.inFlight, 'the run reached the unwrapped observer call').toBe(true)
    expect(conclusion.state, 'and timed out past PROFILE_RESOLVED').toBe('TIMED_OUT')

    // THE FINDING.
    expect(conclusion.produced, 'a timeout past PROFILE_RESOLVED sealed no bundle').toBe(
      'evidence_bundle',
    )
  })

  it('the same timeout DOES seal when the port is one the bound wraps — the control', async () => {
    const conclusion = await new Runner(testPorts({ adapter: new HangingAdapter() }), {
      deadline_ms: 40,
    }).run(runRequest())

    expect(conclusion.state, 'the same terminal').toBe('TIMED_OUT')
    expect(conclusion.produced, 'seals a bundle when the walk is not abandoned').toBe(
      'evidence_bundle',
    )
  })
})

// ======================================================================
// FINDING 3 (P1) — the submitted run's ONE cancellation input is not
// global. It exists only while `until()` happens to be running.
//
// RO-INV-68: "the submitted run's one cancellation input is effective,
// not advisory: `interrupt` is polled while a call is OUTSTANDING rather
// than only between phases."
//
// The poll lives in `RunDeadline.until()`, and `expired()` waits on the
// AbortController alone. `observer.observeBase` is not wrapped, so a
// cancellation that becomes active while it is outstanding is polled by
// nothing — and the run waits out the entire wall clock instead.
// ======================================================================

/** RO-EX-129 — RO-INV-74. */
/** RO-EX-129 — RO-INV-74. */
describe('public cancellation is not effective against every outstanding call', () => {
  it('a cancellation raised during an unwrapped call is not seen until the wall clock', async () => {
    const observer = new HangingBaseObserver()
    const ports = testPorts({ observer })
    let concluded: RunConclusion | undefined

    void new Runner(ports, { deadline_ms: 800 })
      .run(runRequest(), { interrupt: () => (observer.inFlight ? 'cancel' : undefined) })
      .then((conclusion) => {
        concluded = conclusion
      })

    await settle(300)

    // The control: the call really is outstanding, so the interrupt
    // really is returning 'cancel' throughout the window above.
    expect(observer.inFlight, 'the cancellable call is in flight').toBe(true)

    // THE FINDING. 300ms of active cancellation, against an 800ms budget.
    expect(
      concluded,
      'cancellation raised while a call was outstanding reached nothing',
    ).toBeDefined()
  })

  it('the same interrupt DOES reach a call the bound wraps — the control', async () => {
    const adapter = new HangingAdapter()
    const ports = testPorts({ adapter })
    let concluded: RunConclusion | undefined

    void new Runner(ports, { deadline_ms: 5_000 })
      .run(runRequest(), { interrupt: () => (adapter.requests.length > 0 ? 'cancel' : undefined) })
      .then((conclusion) => {
        concluded = conclusion
      })

    await settle(300)

    expect(concluded?.state, 'the poll reaches a wrapped call').toBe('CANCELLED')
  })
})

// ======================================================================
// FINDING 4 (P1) — an aborted run still STARTS the next effect in the
// same phase.
//
// RO-INV-70 is stated generally — "An effect is not STARTED once the run
// is aborted" — but the thunk closed one call site. `sandboxStarted`
// emits `run.started`, then emits `capability.granted`, and only THEN
// consults `deadline.interrupted()`. A deadline that fires while the
// first emission is outstanding therefore publishes a capability grant
// for a run that has already been aborted.
//
// This is why the reviewer's "do not solve these as seven local
// conditionals" matters: a check between these two emissions closes this
// counterexample and none of the class.
// ======================================================================

/** Emits normally, but holds `run.started` past the deadline. */
class SlowRunStartedEvents {
  readonly emitted: string[] = []
  readonly #inner: TestPorts['events']

  constructor(inner: TestPorts['events']) {
    this.#inner = inner
  }

  async emit(
    request: Parameters<TestPorts['events']['emit']>[0],
  ): Promise<ReturnType<TestPorts['events']['emit']>> {
    const type = (request.event as { event_type?: string }).event_type ?? ''
    this.emitted.push(type)
    if (type === 'run.started') await settle(120)
    return await this.#inner.emit(request)
  }
}

/** RO-EX-129 — RO-INV-74. */
describe('an aborted run still starts the next effect of the phase it is in', () => {
  it('capability.granted is emitted after the deadline has already fired', async () => {
    const base = testPorts()
    const events = new SlowRunStartedEvents(base.events)
    const ports = { ...base, events } as unknown as TestPorts

    // Fires DURING `run.started`, before `capability.granted` is reached.
    const conclusion = await new Runner(ports, { deadline_ms: 40 }).run(runRequest())

    // The control: the run reached the emission that holds it open, and
    // the clock really did elapse inside it.
    expect(events.emitted, 'the run reached run.started').toContain('run.started')
    expect(conclusion.state, 'and the deadline really did fire').toBe('TIMED_OUT')

    // Settle past the abandoned continuation, so this observes the effect
    // rather than racing it.
    await settle(300)

    // THE FINDING. A capability grant published by an aborted run.
    expect(events.emitted, 'an aborted run emitted a capability grant').not.toContain(
      'capability.granted',
    )
  })

  it('the same fixture DOES emit capability.granted when nothing aborts it — the control', async () => {
    const base = testPorts()
    const events = new SlowRunStartedEvents(base.events)
    const ports = { ...base, events } as unknown as TestPorts

    await new Runner(ports, { deadline_ms: 5_000 }).run(runRequest())

    expect(events.emitted, 'the fixture reaches the grant when unaborted').toContain(
      'capability.granted',
    )
  })
})

// ======================================================================
// FINDING 5 (P1) — the budget does not cover ownership or cleanup, so
// `run()` itself is unbounded.
//
// `runner-lifecycle`: "Every run SHALL carry a deadline derived from its
// profile's declared wall clock; there is no unbounded run."
// RO-INV-64: "Every port that can hang is bounded by the run's wall
// clock."
//
// Two ports are outside the mechanism entirely:
//
//   lease.claim()        — before `#walkOwned`, so before `arm()`
//   workspace.discard()  — inside `RunScope.release()`, which calls
//                          `disarm()` FIRST and then awaits the port
//
// A throw is handled on both paths. A promise that never settles is not:
// there is no timer left running that could ever fire.
// ======================================================================

/** RO-EX-134 — RO-INV-79. Kills RO-MUT-73. */
describe('the run budget does not bound ownership or cleanup', () => {
  it('a lease store that never answers leaves run() unresolved forever', async () => {
    const ports = {
      ...testPorts(),
      lease: {
        claim: () => new Promise<never>(() => {}),
        renew: () => Promise.resolve(true),
        release: () => Promise.resolve(),
      },
    } as unknown as TestPorts
    let concluded: RunConclusion | undefined

    void new Runner(ports, { deadline_ms: 100 }).run(runRequest()).then((conclusion) => {
      concluded = conclusion
    })

    await settle(400)

    // THE FINDING. The budget is armed inside `#walkOwned`; the claim
    // happens before it, so nothing is ticking at all.
    expect(concluded, 'run() is unbounded before the lease is claimed').toBeDefined()
  })

  it('a cleanup port that never answers leaves run() unresolved forever', async () => {
    const inner = new RecordingWorkspaceLifecycle()
    let reachedDiscard = false
    const workspace = {
      provision: (request: { run_id: string; source_ref: string }) => inner.provision(request),
      applyBack: (request: Parameters<typeof inner.applyBack>[0]) => inner.applyBack(request),
      discard: () => {
        reachedDiscard = true
        return new Promise<never>(() => {})
      },
    }
    const ports = testPorts({ workspace })
    let concluded: RunConclusion | undefined

    void new Runner(ports, { deadline_ms: 100 }).run(runRequest()).then((conclusion) => {
      concluded = conclusion
    })

    await settle(400)

    // The control: the run really did get as far as teardown.
    expect(reachedDiscard, 'the run reached cleanup').toBe(true)

    // THE FINDING. `release()` disarms the wall clock and THEN awaits the
    // ports, so the run's own budget can no longer fire.
    expect(concluded, 'run() is unbounded once cleanup has begun').toBeDefined()
  })
})

// ======================================================================
// FINDING 6 (P1) — the profile's wall clock is EXTENDED by re-arming it.
//
// `runner-lifecycle`: "Every run SHALL carry a deadline derived from its
// profile's declared wall clock."
//
// `RunDeadline.arm()` keeps no absolute expiry: it clears the old timer
// and starts a fresh duration FROM NOW. `eligible` arms the profile's
// budget before `session.prepare`, and arms it AGAIN after
// `session.start` returns — so a profile granting one second buys one
// second PLUS however long prepare and start took.
//
// Stated in the units the profile declares, with no proof control
// involved: `wall_clock_seconds: 1` is the whole authority here.
// ======================================================================

const shortProfile = (seconds: number): AuthorityBytes => {
  const document = profileDocument()
  return {
    ok: true,
    source: { source: 'profile' },
    bytes: JSON.stringify({
      ...document,
      limits: { ...(document['limits'] as Record<string, unknown>), wall_clock_seconds: seconds },
    }),
  }
}

/** A session whose prepare and start each consume part of the budget. */
class SlowSession {
  readonly calls: string[] = []
  readonly #delayMs: number

  constructor(delayMs: number) {
    this.#delayMs = delayMs
  }

  async prepare(request: SessionPrepareRequest): Promise<unknown> {
    this.calls.push('prepare')
    await settle(this.#delayMs)
    return {
      ok: true,
      handle: {
        session_ref: `session:${request.run_id}`,
        deadline: { wall_clock_seconds: 600 },
      },
    }
  }

  async start(): Promise<unknown> {
    this.calls.push('start')
    await settle(this.#delayMs)
    return { ok: true }
  }

  interrupt(): Promise<unknown> {
    this.calls.push('interrupt')
    return Promise.resolve({ ok: true })
  }

  close(): Promise<unknown> {
    this.calls.push('close')
    return Promise.resolve({ torn_down: true })
  }
}

/** RO-EX-133 — RO-INV-78. Kills RO-MUT-72. */
/** RO-EX-133 — RO-INV-78. Kills RO-MUT-72. */
describe('the profile wall clock is restarted rather than held', () => {
  it('a one-second profile outlives one second when prepare and start are slow', async () => {
    vi.useFakeTimers()
    try {
      const authority = new CountingAuthoritySource({ profile: shortProfile(1) })
      const adapter = new HangingAdapter()
      const session = new SlowSession(400)
      const ports = { ...testPorts({ authority, adapter }), session } as unknown as TestPorts
      let concluded: RunConclusion | undefined

      // No `deadline_ms`: the profile's declared wall clock is the only
      // budget in play, which is exactly what the requirement names.
      void new Runner(ports).run(runRequest()).then((conclusion) => {
        concluded = conclusion
      })

      // 1000ms of profile budget, of which prepare and start consume 800.
      await vi.advanceTimersByTimeAsync(1_400)

      // The control: the run really did spend its budget inside the
      // session boundary — which is where the second arming happens — and
      // really did reach the call the budget then has to bound.
      expect(session.calls.slice(0, 2), 'the run reached prepare and start').toEqual([
        'prepare',
        'start',
      ])
      expect(adapter.requests.length, 'and reached the call the clock must bound').toBe(1)

      // THE FINDING.
      expect(
        concluded,
        'the profile granted one second and the run was still running after 1.4',
      ).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('the same profile DOES expire on time when prepare and start are instant — the control', async () => {
    vi.useFakeTimers()
    try {
      const authority = new CountingAuthoritySource({ profile: shortProfile(1) })
      const ports = testPorts({ authority, adapter: new HangingAdapter() })
      let concluded: RunConclusion | undefined

      void new Runner(ports).run(runRequest()).then((conclusion) => {
        concluded = conclusion
      })

      await vi.advanceTimersByTimeAsync(1_400)

      // Same profile, same hung adapter, same window: only the elapsed
      // prepare/start is removed. So the fixture — fake timers included —
      // does reach a conclusion when nothing moves the expiry.
      expect(concluded?.state, 'one second of profile budget expires within one second').toBe(
        'TIMED_OUT',
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

// ======================================================================
// FINDING 7 (P2) — `deadline_ms` is documented as shortening only, and
// LENGTHENS the standing acquisition ceiling.
//
//     env.deadline.arm(this.#controls.deadline_ms ?? ACQUISITION_BUDGET_MS)
//
// `??`, not `Math.min`. `RunControls.deadline_ms` says "Shorten the wall
// clock. Never lengthens it", and every other arming site honours that
// through `boundedDeadlineMs`. This one does not: a control of 120_000
// doubles the 60-second bound that exists to make "there is no unbounded
// run" true before any profile is captured.
//
// P2 rather than P1: `RunControls` is constructor-time and off the
// submitted-run surface, so this widens a bound for composition rather
// than for a caller. It is still a control doing the one thing its
// contract says it cannot do.
// ======================================================================

/** RO-EX-135 — RO-INV-59. Kills RO-MUT-74. */
/** RO-EX-135 — RO-INV-59. Kills RO-MUT-74. */
describe('a shortening-only control lengthens the acquisition ceiling', () => {
  it('a deadline_ms above the standing budget outlives the standing budget', async () => {
    vi.useFakeTimers()
    try {
      const authority = new GatedAuthority() // never released
      const ports = testPorts({ authority })
      let concluded: RunConclusion | undefined

      void new Runner(ports, { deadline_ms: ACQUISITION_BUDGET_MS * 2 })
        .run(runRequest())
        .then((conclusion) => {
          concluded = conclusion
        })

      await vi.advanceTimersByTimeAsync(ACQUISITION_BUDGET_MS + ABANDON_GRACE_MS + 1)

      // The control: the run really is hung in acquisition, under the
      // standing ceiling and before any profile exists to narrow it.
      expect(authority.requested, 'the run is hung on the first authority read').toEqual([
        'profile',
      ])

      // THE FINDING.
      expect(
        concluded,
        'a control that may only shorten doubled the standing acquisition budget',
      ).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a deadline_ms BELOW the standing budget concludes on it — the control', async () => {
    vi.useFakeTimers()
    try {
      const authority = new GatedAuthority() // never released
      const ports = testPorts({ authority })
      let concluded: RunConclusion | undefined

      void new Runner(ports, { deadline_ms: 1_000 }).run(runRequest()).then((conclusion) => {
        concluded = conclusion
      })

      await vi.advanceTimersByTimeAsync(1_000 + ABANDON_GRACE_MS + 1)

      // Same fixture, same hung read, same fake clock: only the control's
      // value changes. So a run that does not conclude above is one whose
      // ceiling moved, not one the harness failed to advance.
      expect(concluded?.state, 'a shortening control does bound the acquisition read').toBe(
        'TIMED_OUT',
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
