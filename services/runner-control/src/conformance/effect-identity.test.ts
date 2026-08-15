/**
 * RO-EX-170/171: the reference implementations honour the identities the
 * D14 contract now REQUIRES.
 *
 * Round 12 made the identities load-bearing in the public SPI: the
 * caller mints them before the call, and resolution addresses the
 * maybe-created resource by them. These proofs pin the reference half —
 * an in-memory implementation that quietly minted its own names would
 * recreate the stranded-resource hazard the contract closed, and a sink
 * that accepted a different payload at a landed identity would let two
 * facts share one name.
 */
import { describe, expect, it } from 'vitest'
import {
  InMemoryExecutionSession,
  InMemoryRunJournal,
  InMemoryWorkspaceLifecycle,
  RecordingEventSink,
} from '../adapters/index.js'

const RUN = 'run-20260812-0001'

// Assurance aliases for the reviewer-authored round-13 proofs
// (falsification-round13.test.ts): RO-EX-172 (journal conflicting
// replay), RO-EX-173 (evidence conflicting replay), RO-EX-174
// (boundary-owned expiry stamp).

const LIMITS = {
  wall_clock_seconds: 600,
  cpu_cores: 1,
  memory_bytes: 1,
  pids: 1,
  output_bytes: 1,
}

describe('RO-EX-170: acquired resources are bound to the caller-known identity', () => {
  it('the in-memory session creates under the identity the caller minted', async () => {
    const session = new InMemoryExecutionSession()
    const prepared = await session.prepare({
      run_id: RUN,
      generation: 1,
      session_ref: 'session:caller-owned',
      profile: { name: 'p', version: '1.0.0', digest: 'sha256:a' },
      limits: LIMITS,
    })
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(
      prepared.handle.session_ref,
      'a resource named only inside the acknowledgement is unresolvable once that acknowledgement is lost',
    ).toBe('session:caller-owned')
  })

  it('the in-memory workspace creates under the identity the caller minted', async () => {
    const workspace = new InMemoryWorkspaceLifecycle()
    const provisioned = await workspace.provision({
      run_id: RUN,
      generation: 1,
      workspace_ref: 'workspace:caller-owned',
      source_ref: '/src',
    })
    expect(provisioned.ok).toBe(true)
    if (!provisioned.ok) return
    expect(provisioned.handle.workspace_ref).toBe('workspace:caller-owned')
  })
})

describe('RO-EX-175: journal replay validity is one rule across every category', () => {
  const fence = { run_id: RUN, generation: 1 }
  const acquisition = {
    epoch: 'production' as const,
    source: 'profile',
    outcome: 'acquired' as const,
  }

  it('an acquisition conflicting replay refuses and keeps the landed fact', async () => {
    const journal = new InMemoryRunJournal()
    const first = await journal.appendAcquisition({ ...fence, entry_id: 'j1', acquisition })
    const replay = await journal.appendAcquisition({ ...fence, entry_id: 'j1', acquisition })
    expect(first.ok && replay.ok).toBe(true)

    const conflict = await journal.appendAcquisition({
      ...fence,
      entry_id: 'j1',
      acquisition: { ...acquisition, outcome: 'failed' as const },
    })
    expect(conflict.ok).toBe(false)
    expect(!conflict.ok && conflict.reason).toBe('conflicting_replay')
    const journaled = await journal.readCurrentState({ run_id: RUN })
    expect(journaled?.acquisitions).toEqual([acquisition])
  })

  it('a CROSS-CATEGORY collision under one identity is a conflict, not a replay', async () => {
    // The canonicalization is shared across the four categories, so an
    // identity landed by one category can never be replayed by another —
    // a per-category ledger would have called this a fresh append.
    const journal = new InMemoryRunJournal()
    await journal.appendAcquisition({ ...fence, entry_id: 'shared', acquisition })
    const collided = await journal.appendHold({
      ...fence,
      entry_id: 'shared',
      hold: { state: 'ELIGIBLE', transition: 'commit_spend', detail: 'x', at: 'now' },
    })
    expect(collided.ok).toBe(false)
    expect(!collided.ok && collided.reason).toBe('conflicting_replay')
    expect((await journal.readCurrentState({ run_id: RUN }))?.held).toBeUndefined()
  })
})

describe('RO-EX-176: a materialization replays by identity AND canonical change set', () => {
  const request = {
    run_id: RUN,
    generation: 1,
    workspace_ref: 'workspace:caller-owned',
    changes: [{ path: 'packages/a.ts', kind: 'modified', bytes: 1 }] as const,
    authorized_by: { contract_id: 'path-policy', digest: 'sha256:policy' },
  }

  it('an exact replay applies once; a different change set refuses', async () => {
    const workspace = new InMemoryWorkspaceLifecycle()
    const first = await workspace.applyBack({ ...request })
    const replay = await workspace.applyBack({ ...request })
    expect(first.ok && replay.ok).toBe(true)
    expect(workspace.appliedFor(RUN)).toBe(1)

    const conflict = await workspace.applyBack({
      ...request,
      changes: [{ path: 'packages/b.ts', kind: 'modified', bytes: 9 }],
    })
    expect(conflict.ok).toBe(false)
    expect(!conflict.ok && conflict.reason, 're-applying a different set would double-write').toBe(
      'conflicting_replay',
    )
    expect(workspace.appliedFor(RUN)).toBe(1)
  })
})

describe('RO-EX-171: an event identity names exactly one event', () => {
  it('replaying the same event at the same identity lands it once', async () => {
    const sink = new RecordingEventSink()
    const event = { event_type: 'adapter.started' }
    const first = await sink.emit({ run_id: RUN, generation: 1, sequence: 0, event })
    const replay = await sink.emit({ run_id: RUN, generation: 1, sequence: 0, event })
    expect(first.ok && replay.ok).toBe(true)
    expect(
      sink.eventsOf(RUN),
      'a replay resolves a lost acknowledgement; it is not a second event',
    ).toHaveLength(1)
  })

  it('a DIFFERENT event wearing a landed identity is refused, never silently kept', async () => {
    const sink = new RecordingEventSink()
    await sink.emit({ run_id: RUN, generation: 1, sequence: 0, event: { event_type: 'a' } })
    await expect(
      sink.emit({ run_id: RUN, generation: 1, sequence: 0, event: { event_type: 'b' } }),
    ).rejects.toThrow('already carries a different event')
    expect(sink.eventsOf(RUN)).toHaveLength(1)
  })
})
