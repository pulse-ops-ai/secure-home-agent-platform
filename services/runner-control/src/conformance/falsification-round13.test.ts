/**
 * FALSIFICATION ROUND 13 — conflicting replay payloads.
 *
 * A stable identity makes an exact retry safe, but it cannot make a
 * different payload the same fact. These proofs keep the physical first
 * write visible while requiring a conflicting retry to refuse rather than
 * acknowledge a replay.
 */
import { describe, expect, it } from 'vitest'
import type { CallGuard } from '../orchestration/deadline.js'
import { guardPorts } from '../orchestration/ports.js'
import {
  InMemoryRunJournal,
  InMemoryRunLease,
  RecordingEvidenceSink,
  TransactionalFinalization,
} from '../adapters/index.js'
import type { FinalizationCommit, FinalizationPort, Ports } from '../ports/index.js'
import { sharedPorts } from '../testing-fixtures.js'

const RUN = 'run-20260814-round13'

const transitionA = {
  run_id: RUN,
  from: 'REQUESTED' as const,
  to: 'PROFILE_RESOLVED' as const,
  kind: 'resolve_profile' as const,
  cause: 'A',
  at: '2026-08-14T12:00:00.000Z',
}

const transitionB = { ...transitionA, to: 'REFUSED' as const, kind: 'refuse' as const, cause: 'B' }

const accepted = async (operation: () => Promise<{ readonly ok: boolean }>): Promise<boolean> => {
  try {
    return (await operation()).ok
  } catch {
    return false
  }
}

describe('journal identity rejects a conflicting payload', () => {
  it('keeps the landed fact, acknowledges an exact replay, and refuses a different fact', async () => {
    const journal = new InMemoryRunJournal()
    const first = await journal.appendTransition({
      run_id: RUN,
      generation: 1,
      entry_id: 'journal-entry-1',
      transition: transitionA,
    })
    const replay = await journal.appendTransition({
      run_id: RUN,
      generation: 1,
      entry_id: 'journal-entry-1',
      transition: transitionA,
    })

    expect(first.ok && replay.ok).toBe(true)
    expect((await journal.readCurrentState({ run_id: RUN }))?.transitions).toEqual([transitionA])

    const conflictingReplayAccepted = await accepted(() =>
      journal.appendTransition({
        run_id: RUN,
        generation: 1,
        entry_id: 'journal-entry-1',
        transition: transitionB,
      }),
    )

    expect(
      conflictingReplayAccepted,
      'a different transition wearing a landed entry identity is not the same logical fact',
    ).toBe(false)
    expect((await journal.readCurrentState({ run_id: RUN }))?.transitions).toEqual([transitionA])
  })
})

describe('evidence identity rejects a conflicting payload', () => {
  it('keeps the landed record, acknowledges an exact replay, and refuses a different record', async () => {
    const evidence = new RecordingEvidenceSink()
    const first = {
      run_id: RUN,
      generation: 1,
      record_id: 'record-1',
      kind: 'early_termination_record' as const,
      record: { cause: 'A' },
    }

    const replay = await evidence.write(first)
    const exactReplay = await evidence.write(first)
    expect(replay.ok && exactReplay.ok).toBe(true)
    expect(evidence.writesOf(RUN)).toHaveLength(1)
    expect(evidence.writesOf(RUN)[0]?.payload).toEqual({ cause: 'A' })

    const conflictingReplayAccepted = await accepted(() =>
      evidence.write({ ...first, record: { cause: 'B' } }),
    )

    expect(
      conflictingReplayAccepted,
      'a different record wearing a landed record identity is not the same logical record',
    ).toBe(false)
    expect(evidence.writesOf(RUN)).toHaveLength(1)
    expect(evidence.writesOf(RUN)[0]?.payload).toEqual({ cause: 'A' })
  })
})

describe('finalization expiry provenance is boundary-owned', () => {
  it('does not let request metadata override the winning expiry stamp', async () => {
    const shared = sharedPorts()
    const lease = new InMemoryRunLease()
    const claim = await lease.claim({
      run_id: RUN,
      attempt_id: 'round13-finalization',
      signal: new AbortController().signal,
    })
    if (!claim.ok) throw new Error('the finalization fixture could not claim its run')
    const actual = new TransactionalFinalization({ ...shared, lease })
    const received: FinalizationCommit[] = []
    const finalization: FinalizationPort = {
      commit: async (request) => {
        received.push(request)
        return actual.commit(request)
      },
    }
    const winningAt = Date.now() + 50_000
    const boundary: CallGuard = {
      call: async <T>(work: () => Promise<T>): Promise<T> => work(),
      commit: async <T>(work: () => Promise<T>): Promise<T> => work(),
      expiry: () => ({ at: winningAt, source: 'governed' }),
      expiresAtEpoch: () => winningAt,
      bound: () => 'governed',
    }
    const emptyPort = {}
    const guarded = guardPorts(
      {
        authority: emptyPort,
        journal: emptyPort,
        lease: emptyPort,
        finalization,
        session: emptyPort,
        workspace: emptyPort,
        observer: emptyPort,
        artifacts: emptyPort,
        execution: emptyPort,
        adapter: emptyPort,
        events: emptyPort,
        evidence: emptyPort,
        clock: { now: () => '2026-08-14T12:00:00.000Z' },
      } as unknown as Ports,
      boundary,
    )

    const outcome = await guarded.finalization.commit({
      run_id: RUN,
      generation: claim.generation,
      commit_id: 'commit-round13-boundary',
      terminal: 'CANCELLED',
      transitions: [transitionA],
      event: { event_type: 'run.terminated', sequence: 0 },
      bundle: { cause: 'A' },
      signal: new AbortController().signal,
      expires_at_epoch_ms: winningAt + 50_000,
      expires_at_bound: 'attempt',
    })

    expect(outcome.ok).toBe(true)
    expect(received[0]).toMatchObject({
      expires_at_epoch_ms: winningAt,
      expires_at_bound: 'governed',
    })
    expect(shared.evidence.all).toHaveLength(1)
  })
})
