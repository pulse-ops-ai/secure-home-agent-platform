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
  InMemoryWorkspaceLifecycle,
  RecordingEventSink,
} from '../adapters/index.js'

const RUN = 'run-20260812-0001'

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
