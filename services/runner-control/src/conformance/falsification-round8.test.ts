/**
 * FALSIFICATION ROUND 8 — truth and authority on interrupted paths.
 *
 * The call-boundary architecture is now structurally sound. These cases
 * attack what terminalization KNOWS and which authority remains live
 * while it records that knowledge: partial RUNNING facts, lifecycle
 * control errors, one-shot session interruption, recovery precedence,
 * ownership acquisition, mandatory-record failure, and absolute expiry
 * when timer callbacks have not been serviced.
 */
import { EvidenceBundle } from '@secure-home/events'
import { describe, expect, it, vi } from 'vitest'
import { DeterministicAdapterInvocation, InMemoryRunLease } from '../adapters/index.js'
import { RunDeadline } from '../orchestration/deadline.js'
import { guardPorts } from '../orchestration/ports.js'
import type {
  CommitOutcome,
  FinalizationCommit,
  FinalizationPort,
  LeaseClaim,
  LeaseClaimRequest,
  RunJournalPort,
} from '../ports/index.js'
import { Runner } from '../runner.js'
import {
  governedWrites,
  RecordingSession,
  runRequest,
  sharedPorts,
  testPorts,
  type TestPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'

// Assurance aliases for this reviewer-authored round.
// RO-EX-142 RO-EX-143 RO-EX-144 RO-EX-145 RO-EX-146 RO-EX-147

const adapterWithCalls = () =>
  new DeterministicAdapterInvocation({
    outcome: 'observed',
    observation: {
      calls: [
        { tool: 'household.read', disposition: 'permitted' },
        { tool: 'household.write', disposition: 'denied' },
      ],
      claims: [],
      events: [],
      terminal: { exit_code: 0 },
      usage: [],
    },
  })

const parsedBundle = (ports: TestPorts): ReturnType<typeof EvidenceBundle.parse> =>
  EvidenceBundle.parse(governedWrites(ports, RUN)[0]?.payload)

describe('partial RUNNING facts survive interruption and recovery', () => {
  it('cancellation while workspace observation hangs preserves already-recorded calls', async () => {
    let observing = false
    const observer = {
      observeBase: () =>
        Promise.resolve({
          ok: true as const,
          digest: `sha256:${'b'.repeat(64)}`,
        }),
      observe: () => {
        observing = true
        return new Promise<never>(() => {})
      },
    }
    const ports = testPorts({ adapter: adapterWithCalls(), observer })

    const conclusion = await new Runner(ports, { deadline_ms: 5_000 }).run(runRequest(), {
      interrupt: () => (observing ? 'cancel' : undefined),
    })

    expect(observing, 'the control: RUNNING reached workspace observation').toBe(true)
    expect(conclusion.state).toBe('CANCELLED')
    const bundle = parsedBundle(ports)
    expect(bundle.operations.attempted.map((entry) => entry.operation.name)).toEqual([
      'household.read',
      'household.write',
    ])
    expect(bundle.operations.permitted.map((entry) => entry.operation.name)).toEqual([
      'household.read',
    ])
    expect(bundle.operations.denied.map((entry) => entry.operation.name)).toEqual([
      'household.write',
    ])
  })

  it('a port throw after recorded calls preserves them in INDETERMINATE recovery', async () => {
    const observer = {
      observeBase: () =>
        Promise.resolve({
          ok: true as const,
          digest: `sha256:${'b'.repeat(64)}`,
        }),
      observe: () => {
        throw new Error('workspace observer exploded after call events')
      },
    }
    const ports = testPorts({ adapter: adapterWithCalls(), observer })

    const conclusion = await new Runner(ports).run(runRequest())

    expect(conclusion.state).toBe('INDETERMINATE')
    const bundle = parsedBundle(ports)
    expect(bundle.operations.attempted.map((entry) => entry.operation.name)).toEqual([
      'household.read',
      'household.write',
    ])
  })
})

const controlPreservingJournal = (
  base: RunJournalPort,
  hang: (request: Parameters<RunJournalPort['appendTransition']>[0]) => boolean,
): RunJournalPort => ({
  stageTransitions: base.stageTransitions.bind(base),
  appendTransition: (request) =>
    hang(request) ? new Promise<never>(() => {}) : base.appendTransition(request),
  appendRejection: base.appendRejection.bind(base),
  appendAcquisition: base.appendAcquisition.bind(base),
  appendHold: base.appendHold.bind(base),
  readCurrentState: base.readCurrentState.bind(base),
})

describe('journal boundaries preserve lifecycle control errors', () => {
  it('deadline during an ordinary journal append remains TIMED_OUT', async () => {
    const base = testPorts()
    const journal = controlPreservingJournal(
      base.journal,
      ({ transition }) => transition.to === 'PROFILE_RESOLVED',
    )
    const ports = { ...base, journal } as unknown as TestPorts

    const conclusion = await new Runner(ports, { deadline_ms: 20 }).run(runRequest())

    expect(conclusion.state).toBe('TIMED_OUT')
    expect(conclusion.detail).not.toMatch(/walk could not be made durable|operational/i)
  })

  it('settlement expiry is not swallowed as a transient journal fault', async () => {
    const shared = sharedPorts()
    let attempts = 0
    const journal: RunJournalPort = {
      stageTransitions: shared.journal.stageTransitions.bind(shared.journal),
      appendTransition: (request) => {
        if (request.transition.to !== 'RUNNING') {
          return shared.journal.appendTransition(request)
        }
        attempts += 1
        if (attempts === 1) return Promise.reject(new Error('transient journal fault'))
        return new Promise<never>(() => {})
      },
      appendRejection: shared.journal.appendRejection.bind(shared.journal),
      appendAcquisition: shared.journal.appendAcquisition.bind(shared.journal),
      appendHold: shared.journal.appendHold.bind(shared.journal),
      readCurrentState: shared.journal.readCurrentState.bind(shared.journal),
    }
    const ports = testPorts({
      journal,
      events: shared.events,
      evidence: shared.evidence,
      visibility: shared.visibility,
      adapter: {
        invoke: () => new Promise<never>(() => {}),
      },
    })

    const conclusion = await new Runner(ports, { cancelAfterMs: 10 }).run(runRequest())

    expect(conclusion.kind, 'settlement failure must be explicit, never a lifecycle terminal').toBe(
      'settlement_failed',
    )
    expect(conclusion.produced).toBe('none')
    expect(conclusion.detail).toMatch(/settlement|journal|record/i)
    expect(attempts, 'the transition was retried during settlement').toBeGreaterThan(1)
  })
})

describe('interrupted settlement stops the session exactly once', () => {
  it('a successful dedicated interrupt is not repeated from the record window', async () => {
    const session = new RecordingSession()
    const ports = testPorts({
      session,
      adapter: {
        invoke: () => new Promise<never>(() => {}),
      },
    })

    const conclusion = await new Runner(ports, { cancelAfterMs: 10 }).run(runRequest())

    expect(conclusion.state).toBe('CANCELLED')
    expect(session.calls.filter((call) => call === 'interrupt')).toHaveLength(1)
    expect(conclusion.produced).toBe('evidence_bundle')
  })
})

class PendingRecoveryFinalization implements FinalizationPort {
  recoveryStarted = false
  recoverySignalAborted = false
  readonly #inner: FinalizationPort

  constructor(inner: FinalizationPort) {
    this.#inner = inner
  }

  commit(commit: FinalizationCommit): Promise<CommitOutcome> {
    if (commit.terminal !== 'INDETERMINATE') {
      return this.#inner.commit(commit)
    }
    this.recoveryStarted = true
    return new Promise<CommitOutcome>((resolveCommit) => {
      const answer = (): void => {
        this.recoverySignalAborted = commit.signal.aborted
        resolveCommit({ ok: false, detail: 'recovery was interrupted before publication' })
      }
      if (commit.signal.aborted) answer()
      else commit.signal.addEventListener('abort', answer, { once: true })
    })
  }
}

describe('generic recovery keeps the governed deadline live until publication', () => {
  it('caller cancellation interrupts pending INDETERMINATE finalization', async () => {
    const base = testPorts()
    const finalization = new PendingRecoveryFinalization(base.finalization)
    const observer = {
      observeBase: () =>
        Promise.resolve({
          ok: true as const,
          digest: `sha256:${'b'.repeat(64)}`,
        }),
      observe: () => {
        throw new Error('force recovery after authority capture')
      },
    }
    const ports = { ...base, finalization, observer } as unknown as TestPorts

    const conclusion = await new Runner(ports, { deadline_ms: 5_000 }).run(runRequest(), {
      interrupt: () => (finalization.recoveryStarted ? 'cancel' : undefined),
    })

    expect(finalization.recoveryStarted).toBe(true)
    expect(finalization.recoverySignalAborted).toBe(true)
    expect(conclusion.state).toBe('CANCELLED')
  })
})

class AbortAwareLease {
  claimStarted = false
  claimSignalAborted = false
  granted = false
  readonly inner = new InMemoryRunLease()

  claim(request: LeaseClaimRequest) {
    this.claimStarted = true
    return new Promise<LeaseClaim>((resolveClaim) => {
      const abort = (): void => {
        this.claimSignalAborted = true
        resolveClaim({
          ok: false,
          reason: 'claim_aborted',
          detail: `claim attempt ${request.attempt_id} was aborted before ownership`,
        })
      }
      if (request.signal.aborted) abort()
      else request.signal.addEventListener('abort', abort, { once: true })
    })
  }

  renew(request: Parameters<InMemoryRunLease['renew']>[0]) {
    return this.inner.renew(request)
  }

  release(request: Parameters<InMemoryRunLease['release']>[0]) {
    return this.inner.release(request)
  }
}

describe('ownership acquisition is guarded before invocation and abortable at the resource', () => {
  it('an already-expired acquisition budget never starts lease.claim', async () => {
    const lease = new AbortAwareLease()
    const conclusion = await new Runner(testPorts({ lease }), { deadline_ms: 0 }).run(runRequest())

    expect(conclusion.kind).toBe('not_started')
    expect(lease.claimStarted, 'the claim thunk must not be invoked after absolute expiry').toBe(
      false,
    )
  })

  it('a claim outstanding at expiry sees abort and cannot become ownership later', async () => {
    const lease = new AbortAwareLease()
    const conclusion = await new Runner(testPorts({ lease }), { deadline_ms: 10 }).run(runRequest())

    expect(lease.claimStarted).toBe(true)
    expect(lease.claimSignalAborted).toBe(true)
    expect(lease.granted).toBe(false)
    expect(conclusion.kind).toBe('not_started')
  })
})

describe('mandatory terminal recording failure has an explicit public conclusion', () => {
  it('a non-returning post-authority finalization is settlement_failed, not terminal + none', async () => {
    const ports = testPorts({
      adapter: {
        invoke: () => new Promise<never>(() => {}),
      },
    })
    const original = ports.finalization.commit.bind(ports.finalization)
    const finalization: FinalizationPort = {
      commit: (commit) =>
        commit.terminal === 'TIMED_OUT' ? new Promise<never>(() => {}) : original(commit),
    }

    const conclusion = await new Runner({ ...ports, finalization }, { deadline_ms: 20 }).run(
      runRequest(),
    )

    expect(conclusion.kind).toBe('settlement_failed')
    expect(conclusion.produced).toBe('none')
    if (conclusion.kind === 'settlement_failed') {
      expect(conclusion.intended_terminal).toBe('TIMED_OUT')
    }
  })
})

describe('absolute expiry is checked synchronously, not only by timer callback', () => {
  it('a guarded thunk never starts after Date.now passes the armed expiry', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
      const deadline = new RunDeadline()
      deadline.armAcquisition(100)
      const invoked = vi.fn(() => Promise.resolve('started'))
      const port = guardPorts(
        testPorts({
          authority: {
            read: invoked as never,
          },
        }),
        deadline,
      ).authority

      // Advance wall time without servicing the queued timeout callback.
      vi.setSystemTime(new Date('2026-08-14T00:00:00.101Z'))

      await expect(
        port.read({ run_id: RUN, epoch: 'production', source: 'profile' }),
      ).rejects.toMatchObject({ name: 'RunInterrupted', reason: 'timeout' })
      expect(invoked).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('interrupted() raises timeout when the absolute expiry elapsed without timer service', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
      const deadline = new RunDeadline()
      deadline.armAcquisition(100)
      vi.setSystemTime(new Date('2026-08-14T00:00:00.101Z'))

      expect(deadline.interrupted()).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })
})
