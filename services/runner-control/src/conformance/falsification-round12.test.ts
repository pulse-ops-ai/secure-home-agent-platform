/**
 * FALSIFICATION ROUND 12 — D14 public-contract seams.
 *
 * These proofs attack properties the round-11 implementation comments claim
 * but the public port shapes do not require: logical intent identity,
 * winning-bound provenance, event identity after a lost acknowledgement,
 * replayable evidence writes, and resource resolution before an acquisition
 * acknowledgement is received.
 */
import { describe, expect, it, vi } from 'vitest'
import { RunEventEmitter } from '../events/index.js'
import {
  InMemoryRunLease,
  RecordingEventSink,
  TransactionalFinalization,
} from '../adapters/index.js'
import { RunDeadline } from '../orchestration/deadline.js'
import { ABANDON_GRACE_MS } from '../orchestration/controls.js'
import { guardPorts } from '../orchestration/ports.js'
import { Runner } from '../runner.js'
import type {
  ApplyBackOutcome,
  ApplyBackRequest,
  ClockPort,
  EventSinkPort,
  EvidenceSinkPort,
  ExecutionSessionPort,
  FenceOutcome,
  FinalizationCommit,
  RunFence,
  RunJournalPort,
  RunScoped,
  SessionClosure,
  SessionPreparation,
  SessionPrepareRequest,
  SessionStart,
  WorkspaceLifecyclePort,
  WorkspaceProvision,
} from '../ports/index.js'
import type { TransitionEntry } from '../lifecycle/index.js'
import { InMemoryWorkspaceLifecycle } from '../workspace/index.js'
import {
  CountingAuthoritySource,
  governedWrites,
  HangingAdapter,
  runRequest,
  sharedPorts,
  testPorts,
} from '../testing-fixtures.js'

const RUN = 'run-20260812-0001'
const T0 = '2026-08-14T00:00:00.000Z'
const epoch = (offsetMs: number): number => Date.parse(T0) + offsetMs

const cancelledTransition = (detail: string): TransitionEntry => ({
  run_id: RUN,
  from: 'RUNNING',
  to: 'CANCELLED',
  kind: 'cancel',
  cause: detail,
  at: T0,
})

const commitFor = (generation: number, detail: string): FinalizationCommit => ({
  run_id: RUN,
  generation,
  // One identity per generation, DELIBERATELY shared across intents:
  // RO-EX-162's aliasing probe needs A and B to wear the same identity.
  commit_id: `commit-round12-g${String(generation)}`,
  terminal: 'CANCELLED',
  transitions: [cancelledTransition(detail)],
  event: {
    event_type: 'run.terminated',
    sequence: 0,
    intent: detail,
    outcome: { terminal_state: 'CANCELLED', detail },
  },
  bundle: { terminal: 'CANCELLED', detail },
  signal: new AbortController().signal,
})

describe('RO-EX-162: finalization identity names logical intent', () => {
  it('a different CANCELLED intent cannot reconcile as an already-published replay', async () => {
    const shared = sharedPorts()
    const lease = new InMemoryRunLease()
    const claim = await lease.claim({
      run_id: RUN,
      attempt_id: 'round-12-finalization',
      signal: new AbortController().signal,
    })
    expect(claim.ok).toBe(true)
    if (!claim.ok) return

    const finalization = new TransactionalFinalization({
      journal: shared.journal,
      events: shared.events,
      evidence: shared.evidence,
      visibility: shared.visibility,
      lease,
    })

    const first = await finalization.commit(commitFor(claim.generation, 'A'))
    expect(first.ok).toBe(true)

    // Exact replay is the healthy control: one publication reconciles to ok.
    const replay = await finalization.commit(commitFor(claim.generation, 'A'))
    expect(replay.ok).toBe(true)
    expect(shared.evidence.all).toHaveLength(1)

    const differentIntent = await finalization.commit(commitFor(claim.generation, 'B'))
    expect(
      differentIntent,
      'B must not be answered ok merely because A used the same terminal state',
    ).toMatchObject({ ok: false, reason: 'already_committed' })

    // The durable record must remain A; accepting B would be an orchestration
    // success over evidence that still describes a different intent.
    expect((shared.evidence.all[0]?.payload as { detail: string }).detail).toBe('A')
    expect((shared.events.eventsOf(RUN)[0] as { intent: string }).intent).toBe('A')
    expect((await shared.journal.readCurrentState({ run_id: RUN }))?.transitions[0]?.cause).toBe(
      'A',
    )
  })
})

const recoveryCommit = async (
  governedDeadlineMs: number,
  publicationCheckpointMs: number,
): Promise<{
  readonly outcome: Awaited<ReturnType<TransactionalFinalization['commit']>>
  readonly evidence: readonly unknown[]
}> => {
  const deadline = new RunDeadline()
  deadline.armAcquisition(governedDeadlineMs)
  const recovery = deadline.recovery()
  expect(recovery.expiresAtEpoch()).toBe(epoch(Math.min(governedDeadlineMs, ABANDON_GRACE_MS)))
  const shared = sharedPorts()
  const lease = new InMemoryRunLease()
  const claim = await lease.claim({
    run_id: RUN,
    attempt_id: `round-12-recovery-${String(governedDeadlineMs)}`,
    signal: new AbortController().signal,
  })
  if (!claim.ok) throw new Error('the recovery fixture could not claim its run')

  const checkpointLease = {
    claim: lease.claim.bind(lease),
    abandon: lease.abandon.bind(lease),
    renew: async (request: RunScoped & { readonly generation: number }): Promise<boolean> => {
      const owned = await lease.renew(request)
      if (request.generation === claim.generation)
        vi.setSystemTime(new Date(epoch(publicationCheckpointMs)))
      return owned
    },
    release: lease.release.bind(lease),
  }
  const finalization = new TransactionalFinalization({
    journal: shared.journal,
    events: shared.events,
    evidence: shared.evidence,
    visibility: shared.visibility,
    lease: checkpointLease,
  })
  const rawPorts = testPorts({
    journal: shared.journal,
    events: shared.events,
    evidence: shared.evidence,
    lease: checkpointLease,
    finalization,
    visibility: shared.visibility,
  })

  try {
    const outcome = await guardPorts(rawPorts, recovery).finalization.commit(
      commitFor(claim.generation, 'recovery'),
    )
    expect(Date.now()).toBe(epoch(publicationCheckpointMs))
    return { outcome, evidence: shared.evidence.all }
  } finally {
    recovery.disarm()
    deadline.disarm()
  }
}

describe('RO-EX-163: recovery expiry preserves the bound that won', () => {
  it('classifies governed expiry as expired when it wins before the recovery ceiling', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const result = await recoveryCommit(100, 101)
      expect(result.outcome).toMatchObject({ ok: false, reason: 'expired' })
      expect(result.evidence).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('classifies recovery-ceiling expiry as attempt_expired, never lifecycle TIMED_OUT', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const result = await recoveryCommit(500, ABANDON_GRACE_MS + 1)
      expect(result.outcome).toMatchObject({ ok: false, reason: 'attempt_expired' })
      expect(result.outcome).not.toMatchObject({ reason: 'expired' })
      expect(result.evidence).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

class LostEventAcknowledgement implements EventSinkPort {
  readonly landed: unknown[] = []

  emit(request: RunFence & { readonly event: unknown }): Promise<never> {
    this.landed.push(request.event)
    return Promise.reject(new Error('event acknowledgement lost'))
  }

  stageEmit(): Promise<never> {
    return Promise.reject(new Error('unused in this proof'))
  }
}

const fixedClock: ClockPort = { now: () => T0 }

describe('RO-EX-164: event identity survives a lost acknowledgement', () => {
  it('advances the next durable event after the first event physically lands', async () => {
    const sink = new LostEventAcknowledgement()
    const emitter = new RunEventEmitter(
      { run_id: RUN, adapter: 'copilot-cli', generation: 1 },
      sink,
      fixedClock,
    )

    const first = await emitter.emit({ event_type: 'adapter.started' })
    expect(first).toMatchObject({ ok: false, reason: 'sink_failed' })
    expect(
      sink.landed,
      'the proof must reach the physical write before losing its ack',
    ).toHaveLength(1)
    expect((sink.landed[0] as { sequence: number }).sequence).toBe(0)

    const terminal = emitter.envelope({
      event_type: 'run.terminated',
      outcome: { terminal_state: 'CANCELLED', detail: 'cancelled' },
    })
    expect(
      terminal['sequence'],
      'a landed event and the later terminal event must not share (run_id, sequence)',
    ).toBe(1)
  })

  it('uses sequence one for the next event when the first acknowledgement is healthy', async () => {
    const sink = new RecordingEventSink()
    const emitter = new RunEventEmitter(
      { run_id: RUN, adapter: 'copilot-cli', generation: 1 },
      sink,
      fixedClock,
    )

    const first = await emitter.emit({ event_type: 'adapter.started' })
    expect(first.ok).toBe(true)
    expect((sink.eventsOf(RUN)[0] as { sequence: number }).sequence).toBe(0)
    expect(
      emitter.envelope({
        event_type: 'run.terminated',
        outcome: { terminal_state: 'CANCELLED', detail: 'cancelled' },
      })['sequence'],
    ).toBe(1)
  })
})

const invalidProfile = {
  ok: true as const,
  source: { source: 'profile' },
  bytes: '{}',
}

describe('RO-EX-165: evidence write replay is identity-bound', () => {
  it('does not duplicate an early-terminal record whose first acknowledgement is lost', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const shared = sharedPorts()
      const authority = new CountingAuthoritySource({ profile: invalidProfile })
      let first = true
      let landed = false
      const evidence: EvidenceSinkPort = {
        write: (request) => {
          if (first && request.kind === 'early_termination_record') {
            first = false
            landed = true
            void shared.evidence.write(request)
            return new Promise<never>(() => {})
          }
          return shared.evidence.write(request)
        },
        stageWrite: shared.evidence.stageWrite.bind(shared.evidence),
      }
      const ports = testPorts({ authority, evidence })
      const pending = new Runner(ports, { deadline_ms: 200 }).run(runRequest(), {
        interrupt: () => (landed ? 'cancel' : undefined),
      })
      await vi.advanceTimersByTimeAsync(10)
      const conclusion = await pending

      expect(landed, 'the early-terminal record must physically land before its ack is lost').toBe(
        true,
      )
      expect(conclusion.state).toBe('REFUSED')
      expect(
        shared.evidence.writesOf(RUN),
        'settlement replay of one logical early terminal must not append a second record',
      ).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes one early-terminal record when the acknowledgement is healthy', async () => {
    const authority = new CountingAuthoritySource({ profile: invalidProfile })
    const ports = testPorts({ authority })
    const conclusion = await new Runner(ports).run(runRequest())
    expect(conclusion.kind).toBe('terminal')
    expect(governedWrites(ports, RUN)).toHaveLength(1)
  })
})

class NondeterministicSession implements ExecutionSessionPort {
  readonly created: string[] = []
  readonly interrupted: string[] = []
  readonly closed: string[] = []
  readonly #loseAcknowledgement: boolean

  constructor(loseAcknowledgement: boolean) {
    this.#loseAcknowledgement = loseAcknowledgement
  }

  prepare(request: SessionPrepareRequest): Promise<SessionPreparation> {
    // The resource may still be internally allocated nondeterministically,
    // but its caller-known acquisition identity is the address by which
    // teardown must resolve it after a lost acknowledgement.
    const session_ref = request.session_ref
    this.created.push(session_ref)
    if (this.#loseAcknowledgement) return new Promise<never>(() => {})
    return Promise.resolve({
      ok: true,
      handle: { session_ref, deadline: { wall_clock_seconds: request.limits.wall_clock_seconds } },
    })
  }

  start(): Promise<SessionStart> {
    return Promise.resolve({ ok: true })
  }

  interrupt(
    request: RunFence & { readonly session_ref: string; readonly reason: 'cancel' | 'timeout' },
  ): Promise<FenceOutcome> {
    this.interrupted.push(request.session_ref)
    return Promise.resolve({ ok: true })
  }

  close(request: RunFence & { readonly session_ref: string }): Promise<SessionClosure> {
    this.closed.push(request.session_ref)
    return Promise.resolve({ torn_down: true })
  }
}

describe('RO-EX-166: acquisition identity exists before the acknowledgement', () => {
  it('a lost session.prepare acknowledgement still resolves the exact resource', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const session = new NondeterministicSession(true)
      const pending = new Runner(testPorts({ session }), { cancelAfterMs: 10 }).run(runRequest())
      await vi.advanceTimersByTimeAsync(20)
      const conclusion = await pending

      expect(session.created).toHaveLength(1)
      expect(conclusion.state).toBe('CANCELLED')
      expect(
        session.closed,
        'the resource must be closed or otherwise resolved even when prepare acknowledgement is lost',
      ).toEqual(session.created)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a received session handle lets cancellation close the exact resource', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const session = new NondeterministicSession(false)
      const pending = new Runner(testPorts({ session, adapter: new HangingAdapter() }), {
        cancelAfterMs: 10,
      }).run(runRequest())
      await vi.advanceTimersByTimeAsync(20)
      await pending

      expect(session.created).toHaveLength(1)
      expect(session.interrupted).toEqual(session.created)
      expect(session.closed).toEqual(session.created)
    } finally {
      vi.useRealTimers()
    }
  })
})

class NondeterministicWorkspace implements WorkspaceLifecyclePort {
  readonly created: string[] = []
  readonly discarded: string[] = []
  readonly #loseAcknowledgement: boolean

  constructor(loseAcknowledgement: boolean) {
    this.#loseAcknowledgement = loseAcknowledgement
  }

  provision(
    request: RunFence & { readonly workspace_ref: string; readonly source_ref: string },
  ): Promise<WorkspaceProvision> {
    // Preserve the adversarial lost acknowledgement while binding the
    // physical resource to the identity the caller supplied before the call.
    const workspace_ref = request.workspace_ref
    this.created.push(workspace_ref)
    if (this.#loseAcknowledgement) return new Promise<never>(() => {})
    return Promise.resolve({ ok: true, handle: { workspace_ref, root: request.source_ref } })
  }

  applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
    return Promise.resolve({ ok: true, applied: request.changes.length })
  }

  discard(request: RunFence & { readonly workspace_ref: string }): Promise<FenceOutcome> {
    this.discarded.push(request.workspace_ref)
    return Promise.resolve({ ok: true })
  }
}

describe('RO-EX-167: workspace acquisition identity exists before the acknowledgement', () => {
  it('a lost workspace.provision acknowledgement still resolves the exact resource', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const workspace = new NondeterministicWorkspace(true)
      const pending = new Runner(testPorts({ workspace }), { deadline_ms: 200 }).run(runRequest(), {
        interrupt: () => (workspace.created.length > 0 ? 'cancel' : undefined),
      })
      await vi.advanceTimersByTimeAsync(20)
      const conclusion = await pending

      expect(workspace.created).toHaveLength(1)
      expect(conclusion.state).toBe('CANCELLED')
      expect(
        workspace.discarded,
        'the resource must be discarded or otherwise resolved even when provision acknowledgement is lost',
      ).toEqual(workspace.created)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a received workspace handle lets cancellation discard the exact resource', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(T0))
      const workspace = new NondeterministicWorkspace(false)
      const pending = new Runner(testPorts({ workspace, adapter: new HangingAdapter() }), {
        cancelAfterMs: 10,
      }).run(runRequest())
      await vi.advanceTimersByTimeAsync(20)
      await pending

      expect(workspace.created).toHaveLength(1)
      expect(workspace.discarded).toEqual(workspace.created)
    } finally {
      vi.useRealTimers()
    }
  })
})

class LostAcknowledgementReferenceWorkspace implements WorkspaceLifecyclePort {
  readonly #reference = new InMemoryWorkspaceLifecycle()
  #first = true

  provision(
    request: Parameters<WorkspaceLifecyclePort['provision']>[0],
  ): Promise<WorkspaceProvision> {
    return this.#reference.provision(request)
  }

  async applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
    const outcome = await this.#reference.applyBack(request)
    if (this.#first) {
      this.#first = false
      throw new Error('apply acknowledgement lost after physical apply')
    }
    return outcome
  }

  discard(request: Parameters<WorkspaceLifecyclePort['discard']>[0]): Promise<FenceOutcome> {
    return this.#reference.discard(request)
  }

  appliedFor(run_id: string): number {
    return this.#reference.appliedFor(run_id)
  }
}

describe('RO-EX-168: apply-back replay has a stable logical identity', () => {
  it('the reference implementation applies one lost-ack materialization once', async () => {
    const workspace = new LostAcknowledgementReferenceWorkspace()
    const request: ApplyBackRequest = {
      run_id: RUN,
      generation: 1,
      workspace_ref: 'workspace:random',
      changes: [{ path: 'packages/a.ts', kind: 'modified', bytes: 1 }],
      authorized_by: { contract_id: 'path-policy', digest: 'sha256:policy' },
    }

    await expect(workspace.applyBack(request)).rejects.toThrow('acknowledgement lost')
    expect(workspace.appliedFor(RUN)).toBe(1)
    await expect(workspace.applyBack(request)).resolves.toMatchObject({ ok: true })
    expect(workspace.appliedFor(RUN)).toBe(1)
  })
})

describe('RO-EX-169: durable identities are required by the public SPI', () => {
  it('does not let a journal append omit entry_id', () => {
    const transition: TransitionEntry = cancelledTransition('journal')
    const omitted = { run_id: RUN, generation: 1, transition }
    // @ts-expect-error D14 requires the retry identity on every durable append
    const request: Parameters<RunJournalPort['appendTransition']>[0] = omitted
    expect(request.run_id).toBe(RUN)
  })

  it('does not let finalization omit commit_id', () => {
    const omitted = {
      run_id: RUN,
      generation: 1,
      terminal: 'CANCELLED' as const,
      transitions: [],
      event: {},
      bundle: {},
      signal: new AbortController().signal,
    }
    // @ts-expect-error D14 requires caller-owned logical commit identity
    const request: FinalizationCommit = omitted
    expect(request.run_id).toBe(RUN)
  })

  it('does not let an evidence write omit its replay identity', () => {
    const omitted = { run_id: RUN, generation: 1, kind: 'evidence_bundle' as const, bundle: {} }
    // @ts-expect-error D14 requires a stable identity for acknowledged evidence writes
    const request: Parameters<EvidenceSinkPort['write']>[0] = omitted
    expect(request.run_id).toBe(RUN)
  })

  it('does not let an event sink accept an event without its identity envelope', () => {
    const omitted = { run_id: RUN, generation: 1, event: { event_type: 'adapter.started' } }
    // @ts-expect-error D14 requires emitter-owned event identity at the public sink contract
    const request: Parameters<EventSinkPort['emit']>[0] = omitted
    expect(request.run_id).toBe(RUN)
  })

  it('does not let acquisition create a session without a caller-known identity', () => {
    const omitted = {
      run_id: RUN,
      generation: 1,
      profile: { name: 'profile', version: '1.0.0', digest: 'sha256:profile' },
      limits: {
        wall_clock_seconds: 1,
        cpu_cores: 1,
        memory_bytes: 1,
        pids: 1,
        output_bytes: 1,
      },
    }
    // @ts-expect-error D14 requires the resource identity before prepare
    const request: SessionPrepareRequest = omitted
    expect(request.run_id).toBe(RUN)
  })

  it('does not let acquisition create a workspace without a caller-known identity', () => {
    const omitted = { run_id: RUN, generation: 1, source_ref: '/workspace' }
    // @ts-expect-error D14 requires the resource identity before provision
    const request: Parameters<WorkspaceLifecyclePort['provision']>[0] = omitted
    expect(request.run_id).toBe(RUN)
  })

  it('does not let apply-back omit a stable materialization identity', () => {
    const omitted = {
      run_id: RUN,
      generation: 1,
      workspace_ref: 'workspace:run',
      changes: [],
      authorized_by: { contract_id: 'path-policy', digest: 'sha256:policy' },
    }
    // @ts-expect-error D14 requires a logical apply-back identity distinct from authorization provenance
    const request: ApplyBackRequest = omitted
    expect(request.run_id).toBe(RUN)
  })
})
