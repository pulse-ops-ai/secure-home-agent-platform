/**
 * FALSIFICATION ROUND 9 — the acquisition protocol and the boundaries a
 * result can slip through.
 *
 * Round 8 made the call boundary check absolute expiry BEFORE work
 * starts. These cases attack what remains: a grant the resource commits
 * but the caller never sees, an attempt identity that is not one, a
 * journal category the seal gate forgot, a result that lands after the
 * expiry it started inside, and a design document still describing the
 * architecture the implementation deleted.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryRunLease } from '../adapters/index.js'
import { TRANSITIONS, type ProgressState, type TransitionKind } from '../lifecycle/index.js'
import { ABANDON_GRACE_MS } from '../orchestration/controls.js'
import { RunDeadline } from '../orchestration/deadline.js'
import type {
  LeaseClaim,
  LeaseClaimRequest,
  RunJournalPort,
  RunScoped,
} from '../ports/index.js'
import { Runner } from '../runner.js'
import {
  governedWrites,
  RecordingSession,
  runRequest,
  sharedPorts,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

// Assurance aliases for this reviewer-authored round.
// RO-EX-148 RO-EX-149 RO-EX-150 RO-EX-151 RO-EX-152

const withoutTransition = (from: ProgressState, kind: TransitionKind): typeof TRANSITIONS => {
  const row = { ...TRANSITIONS[from] }
  delete row[kind]
  return { ...TRANSITIONS, [from]: row }
}

/** The in-memory lease, with every claim's attempt identity recorded. */
class AttemptRecordingLease extends InMemoryRunLease {
  readonly attempts: string[] = []

  override claim(request: LeaseClaimRequest): Promise<LeaseClaim> {
    this.attempts.push(request.attempt_id)
    return super.claim(request)
  }
}

/**
 * A lease whose resource COMMITS ownership before the caller's deadline
 * and acknowledges it only after. This is the distributed commit/ack
 * ambiguity a Promise cancellation cannot solve: by the time the caller
 * gives up, the grant has already happened — only the resource can
 * resolve what became of the attempt.
 */
class AckDelayedLease {
  held: number | undefined
  readonly abandoned: string[] = []
  readonly #attempts = new Map<string, number>()

  claim(request: LeaseClaimRequest): Promise<LeaseClaim> {
    // Ownership commits NOW, while the caller's signal is still healthy.
    this.held = 1
    this.#attempts.set(request.attempt_id, 1)
    return new Promise((resolveClaim) => {
      setTimeout(() => {
        resolveClaim({ ok: true, generation: 1 })
      }, 60)
    })
  }

  abandon(request: RunScoped & { readonly attempt_id: string }): Promise<void> {
    this.abandoned.push(request.attempt_id)
    const generation = this.#attempts.get(request.attempt_id)
    if (generation !== undefined && this.held === generation) this.held = undefined
    return Promise.resolve()
  }

  renew(): Promise<boolean> {
    return Promise.resolve(this.held !== undefined)
  }

  release(request: RunScoped & { readonly generation: number }): Promise<void> {
    if (this.held === request.generation) this.held = undefined
    return Promise.resolve()
  }
}

describe('RO-EX-148: an attempt identity identifies ONE attempt', () => {
  it('two competing runners for the same run present distinct attempt ids', async () => {
    // A durable lease may legitimately answer a REPLAYED attempt with the
    // same successful generation — that is what attempt idempotency is
    // for. Two callers sharing an attempt id would therefore BOTH be told
    // they own the run, which defeats the fence at the protocol level
    // regardless of how the store is implemented.
    const lease = new AttemptRecordingLease()
    const ports = testPorts({ lease })
    await Promise.all([new Runner(ports).run(runRequest()), new Runner(ports).run(runRequest())])

    expect(lease.attempts).toHaveLength(2)
    expect(new Set(lease.attempts).size, 'two attempts must never share an identity').toBe(2)
  })

  it('a later retry of the same run is a NEW attempt, not a replay of the old one', async () => {
    const lease = new AttemptRecordingLease()
    await new Runner(testPorts({ lease })).run(runRequest())
    await new Runner(testPorts({ lease })).run(runRequest())

    expect(lease.attempts).toHaveLength(2)
    expect(new Set(lease.attempts).size).toBe(2)
  })
})

describe('RO-EX-149: an unacknowledged grant is resolved at the resource', () => {
  it('a grant committed before the deadline, acknowledged after it, is not orphaned', async () => {
    const lease = new AckDelayedLease()
    const conclusion = await new Runner(testPorts({ lease }), {
      deadline_ms: 10,
    }).run(runRequest())

    expect(conclusion.kind).toBe('not_started')
    // The caller could not await the answer, so it must have TOLD the
    // resource to resolve the attempt — leaving generation 1 owned with
    // no runner holding the result parks the run id forever.
    expect(lease.abandoned, 'the unresolved attempt must be abandoned at the resource').not.toEqual(
      [],
    )
    expect(lease.held, 'no runner returned, so no ownership may remain').toBeUndefined()
  })
})

describe('RO-EX-149 (the resource half): attempt state is kept where the grants are', () => {
  const signal = () => new AbortController().signal

  it('an abandoned attempt can no longer become ownership', async () => {
    const lease = new InMemoryRunLease()
    await lease.abandon({ run_id: RUN, attempt_id: 'late' })
    const granted = await lease.claim({ run_id: RUN, attempt_id: 'late', signal: signal() })
    expect(granted.ok, 'a resolved attempt must never be granted afterwards').toBe(false)
  })

  it('a replayed attempt is answered with its original grant, never a second one', async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN, attempt_id: 'same', signal: signal() })
    const replay = await lease.claim({ run_id: RUN, attempt_id: 'same', signal: signal() })
    expect(first.ok && replay.ok).toBe(true)
    if (!first.ok || !replay.ok) return
    expect(replay.generation, 'a retransmission gets its own answer back').toBe(first.generation)

    const competitor = await lease.claim({ run_id: RUN, attempt_id: 'other', signal: signal() })
    expect(competitor.ok, 'a DIFFERENT attempt is still one owner too many').toBe(false)
  })

  it('abandoning a granted attempt releases the run for the next claimant', async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN, attempt_id: 'a1', signal: signal() })
    expect(first.ok).toBe(true)
    await lease.abandon({ run_id: RUN, attempt_id: 'a1' })
    const next = await lease.claim({ run_id: RUN, attempt_id: 'a2', signal: signal() })
    expect(next.ok, 'an abandoned grant must not park the run id').toBe(true)
  })

  it("abandoning a stale attempt does not touch the CURRENT holder's grant", async () => {
    const lease = new InMemoryRunLease()
    const first = await lease.claim({ run_id: RUN, attempt_id: 'a1', signal: signal() })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    await lease.release({ run_id: RUN, generation: first.generation })
    const second = await lease.claim({ run_id: RUN, attempt_id: 'a2', signal: signal() })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    await lease.abandon({ run_id: RUN, attempt_id: 'a1' })
    expect(
      await lease.renew({ run_id: RUN, generation: second.generation }),
      "a superseded attempt's abandon must not dispossess the live run",
    ).toBe(true)
  })
})

describe('RO-EX-150: the seal gate covers EVERY pending journal category', () => {
  it('evidence does not seal while a rejection is missing from the durable journal', async () => {
    // The machine records a rejection; its append faults and stays
    // pending for retry. The pre-seal gate checked pending TRANSITIONS
    // only, so the run sealed with its durable record short one
    // rejection — and a later successful retry would land AFTER the
    // seal, violating seal-last from the other side.
    const shared = sharedPorts()
    const journal: RunJournalPort = {
      stageTransitions: shared.journal.stageTransitions.bind(shared.journal),
      appendTransition: shared.journal.appendTransition.bind(shared.journal),
      appendRejection: () => Promise.reject(new Error('journal down')),
      appendAcquisition: shared.journal.appendAcquisition.bind(shared.journal),
      appendHold: shared.journal.appendHold.bind(shared.journal),
      readCurrentState: shared.journal.readCurrentState.bind(shared.journal),
    }
    const table = withoutTransition('ELIGIBLE', 'commit_spend')
    const ports = testPorts({ ...shared, journal })
    const conclusion = await new Runner(ports, { transitions: table }).run(runRequest())

    expect(conclusion.state).not.toBe('COMPLETED')
    expect(
      governedWrites(ports, RUN).filter((write) => write.kind === 'evidence_bundle'),
      'a sealed bundle over an incomplete durable record is a partial finalization',
    ).toHaveLength(0)
  })
})

describe('RO-EX-151: absolute expiry binds when a call RETURNS, not only when it starts', () => {
  it('a result resolving after wall-clock expiry is rejected by the ordinary call boundary', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
      const deadline = new RunDeadline()
      deadline.armAcquisition(100)

      // The work starts legitimately inside the budget, wall time crosses
      // the expiry while it runs, and it resolves BEFORE the timer
      // callback has had an event-loop turn. The value must not be
      // accepted: synchronous phase logic would consume it and earn a
      // transition after the run's absolute budget was already spent.
      await expect(
        deadline.call(() => {
          vi.setSystemTime(new Date('2026-08-14T00:00:00.101Z'))
          return Promise.resolve('late result')
        }),
      ).rejects.toMatchObject({ name: 'RunInterrupted', reason: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovery rejects a result that resolves after the governed deadline', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
      const deadline = new RunDeadline()
      deadline.armAcquisition(100)
      const recovery = deadline.recovery()
      try {
        await expect(
          recovery.call(() => {
            vi.setSystemTime(new Date('2026-08-14T00:00:00.101Z'))
            return Promise.resolve('late result')
          }),
        ).rejects.toMatchObject({ name: 'RunInterrupted', reason: 'timeout' })
      } finally {
        recovery.disarm()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovery rejects a result that resolves after its own settlement ceiling', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
      const deadline = new RunDeadline()
      const recovery = deadline.recovery()
      try {
        await expect(
          recovery.call(() => {
            vi.setSystemTime(
              new Date(Date.parse('2026-08-14T00:00:00.000Z') + ABANDON_GRACE_MS + 1),
            )
            return Promise.resolve('late result')
          }),
        ).rejects.toMatchObject({ name: 'RunSettlementExpired' })
      } finally {
        recovery.disarm()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('a session start returning after expiry earns no transition', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
      const session = new RecordingSession()
      const late = {
        prepare: session.prepare.bind(session),
        start: () => {
          // The sandbox starts inside the 200ms budget and reports ready
          // after the budget is spent, before any timer fires.
          vi.setSystemTime(new Date('2026-08-14T00:00:00.201Z'))
          return session.start()
        },
        interrupt: session.interrupt.bind(session),
        close: session.close.bind(session),
      }
      const conclusion = await new Runner(testPorts({ session: late }), {
        deadline_ms: 200,
      }).run(runRequest())

      expect(conclusion.state).toBe('TIMED_OUT')
      expect(
        conclusion.transitions.map((entry) => entry.to),
        'a state entered on an expired result is a transition the budget never authorized',
      ).not.toContain('SANDBOX_STARTED')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('RO-EX-152: the design describes the finalization that ships', () => {
  it('D7 prescribes staged publication and no undo-after-visibility architecture', () => {
    // U11 inherits the finalization contract from D7. A design section
    // still requiring every participant to support undoing published
    // writes describes the architecture this change deliberately removed
    // — an implementer following the document would rebuild it.
    const design = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        '..',
        'openspec',
        'changes',
        'runner-control-orchestration',
        'design.md',
      ),
      'utf8',
    )
    const d7 = /### D7: [\s\S]*?(?=\n### )/.exec(design)?.[0]
    expect(d7, 'design.md must have a D7 section').toBeDefined()
    expect(d7).not.toMatch(/retract/i)
    expect(d7).not.toMatch(/roll(s|ed)? ?back|rollback/i)
    expect(d7).not.toMatch(/reverse order|in reverse/i)
    expect(d7).toMatch(/stag(e|es|ed|ing)/i)
    expect(d7).toMatch(/publish|publication/i)
  })
})
