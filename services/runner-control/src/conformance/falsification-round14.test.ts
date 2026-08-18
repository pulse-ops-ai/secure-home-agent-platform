/**
 * FINAL FALSIFICATION — a typed conflicting event replay must not rewind the
 * emitter's sequence allocation.
 *
 * The public EventSinkPort returns FenceOutcome. Its widened union includes
 * conflicting_replay, which is not ownership loss. This proof uses a
 * conforming sink that physically retains the first event, acknowledges an
 * exact replay, and reports a conflicting replay without throwing.
 */
import { describe, expect, it } from 'vitest'
import { RunEventEmitter } from '../events/index.js'
import type { ClockPort, EventSinkPort, FenceOutcome, Staging } from '../ports/index.js'

const RUN = 'run-20260814-round14'
const T0 = '2026-08-14T12:00:00.000Z'
const clock: ClockPort = { now: () => T0 }

class ConflictAwareEventSink implements EventSinkPort {
  readonly requests: Array<{ readonly sequence: number; readonly event: unknown }> = []
  readonly #landed = new Map<number, string>()

  emit(request: Parameters<EventSinkPort['emit']>[0]): Promise<FenceOutcome> {
    this.requests.push({ sequence: request.sequence, event: request.event })
    const canonical = JSON.stringify(request.event)
    const landed = this.#landed.get(request.sequence)
    if (landed === undefined) {
      this.#landed.set(request.sequence, canonical)
      return Promise.resolve({ ok: true })
    }
    if (landed === canonical) return Promise.resolve({ ok: true })
    return Promise.resolve({
      ok: false,
      reason: 'conflicting_replay',
      detail: `sequence ${String(request.sequence)} already contains a different event`,
    })
  }

  stageEmit(request: Parameters<EventSinkPort['stageEmit']>[0]): Promise<Staging> {
    return Promise.resolve({
      ok: true,
      staged: { commitId: request.commit_id, abandon: () => undefined },
    })
  }
}

const emitter = (sink: EventSinkPort): RunEventEmitter =>
  new RunEventEmitter({ run_id: RUN, adapter: 'adapter', generation: 1 }, sink, clock)

describe('event conflicting replay does not corrupt sequence allocation', () => {
  it('the exact-replay control advances to N+1', async () => {
    const sink = new ConflictAwareEventSink()
    const first = emitter(sink)
    expect((await first.emit({ event_type: 'adapter.started' })).ok).toBe(true)

    const retry = emitter(sink)
    expect((await retry.emit({ event_type: 'adapter.started' })).ok).toBe(true)
    const next = await retry.emit({ event_type: 'adapter.completed' })

    expect(next.ok).toBe(true)
    expect(sink.requests.at(-1)?.sequence).toBe(1)
  })

  it('a typed conflicting replay consumes N and leaves N+1 usable', async () => {
    const sink = new ConflictAwareEventSink()
    const first = emitter(sink)
    expect((await first.emit({ event_type: 'adapter.started' })).ok).toBe(true)

    const retry = emitter(sink)
    const conflict = await retry.emit({ event_type: 'different.event' })
    expect(conflict.ok).toBe(false)
    expect(conflict).not.toMatchObject({ reason: 'stale_fence' })

    const next = await retry.emit({ event_type: 'adapter.completed' })
    expect(next.ok, 'the conflict is not ownership loss; the emitter must not reuse N').toBe(true)
    expect(sink.requests.at(-1)?.sequence).toBe(1)
  })
})
