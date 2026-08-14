/**
 * Event emission at the moments the closed L2 vocabulary represents
 * (design D9).
 *
 * The vocabulary has seven event types and this service emits exactly
 * those seven, for exactly the moments they name. It invents nothing and
 * overloads nothing: `PROFILE_RESOLVED`, `ELIGIBLE`, `VERIFYING` and
 * `EVIDENCE_SEALED` have no event type, so they are NOT squeezed into a
 * neighbouring one — they land in the transition record instead, where
 * the full walk stays reconstructable without an L2 amendment. If a later
 * landing wants transitions as first-class events, that is a governed
 * contract change, and this module is where its absence is visible.
 *
 * Emission failure is operational and surfaces to the caller. A run whose
 * events are silently dropped is a run nobody can audit, so "the sink
 * threw and we carried on" is not an available behaviour here.
 */
import { RunEvent, type RunEventT } from '@secure-home/events'
import type { ClockPort, EventSinkPort } from '../ports/index.js'
import { RunAborted } from '../orchestration/bound-ports.js'

export interface EventIdentity {
  readonly run_id: string
  readonly adapter: string
  /**
   * The lease generation this emitter writes under. An emitter belongs
   * to one run AND to one holder of it: carrying the fence here rather
   * than at each call site means no emission can accidentally be made
   * without it.
   */
  readonly generation: number
}

export type EmitOutcome =
  | { readonly ok: true; readonly event: RunEventT }
  | {
      readonly ok: false
      /**
       * `stale_fence` is kept apart from `sink_failed`: the sink is
       * working perfectly and is refusing this caller, which is a fact
       * about ownership rather than about the event stream.
       */
      readonly reason: 'contract_invalid' | 'sink_failed' | 'stale_fence'
      readonly detail: string
    }

/**
 * Per-run event emission. The sequence counter is per run — the emitter
 * belongs to one run and is never shared, so concurrent runs cannot
 * interleave into one another's numbering (RO-INV-10).
 */
export class RunEventEmitter {
  readonly #identity: EventIdentity
  readonly #sink: EventSinkPort
  readonly #clock: ClockPort
  readonly #emitted: RunEventT[] = []
  #sequence = 0

  constructor(identity: EventIdentity, sink: EventSinkPort, clock: ClockPort) {
    this.#identity = identity
    this.#sink = sink
    this.#clock = clock
  }

  get emitted(): readonly RunEventT[] {
    return this.#emitted
  }

  /**
   * `body` carries the event type and its type-specific fields; the
   * envelope is this emitter's to fill. Validating against the authored
   * contract before the write means a malformed event fails here rather
   * than becoming an unparseable line in the stream.
   */
  /**
   * The envelope this emitter would put on `body`, without emitting.
   *
   * Finalization needs the terminal event as DATA so it can be committed
   * with the seal rather than sent before it. Building it here keeps the
   * envelope the emitter's — a hand-built terminal event is how the
   * sequence number and run id drift.
   */
  envelope(body: Record<string, unknown>): Record<string, unknown> {
    return {
      ...body,
      contract_id: 'run-event',
      contract_version: '1.0.0',
      run_id: this.#identity.run_id,
      sequence: this.#sequence,
      timestamp: this.#clock.now({ run_id: this.#identity.run_id }),
      adapter: this.#identity.adapter,
    }
  }

  async emit(body: Record<string, unknown>): Promise<EmitOutcome> {
    // The envelope is spread LAST. Spreading `body` last let a caller
    // replace run_id, sequence, adapter, or the contract identity — so
    // an event could be attributed to another run, or renumbered, by the
    // code that emits it. The envelope is this emitter's to state, and
    // no body field may override it.
    const candidate = {
      ...body,
      contract_id: 'run-event',
      contract_version: '1.0.0',
      run_id: this.#identity.run_id,
      sequence: this.#sequence,
      timestamp: this.#clock.now({ run_id: this.#identity.run_id }),
      adapter: this.#identity.adapter,
    }
    const parsed = RunEvent.safeParse(candidate)
    if (!parsed.success) {
      return {
        ok: false,
        reason: 'contract_invalid',
        detail: parsed.error.issues
          .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
          .join('; '),
      }
    }
    let emitted
    try {
      emitted = await this.#sink.emit({
        run_id: this.#identity.run_id,
        generation: this.#identity.generation,
        event: parsed.data,
      })
    } catch (error) {
      // AN ABORT IS NOT A SINK FAILURE. The run's budget reaching an
      // outstanding emit means the RUN is over, not that the sink is
      // broken — reporting it as `sink_failed` made a timed-out run
      // terminate OPERATIONAL_FAILURE, describing a defect in the event
      // system for something the run's own clock did. It unwinds to the
      // handler that knows what the run established.
      if (error instanceof RunAborted) throw error
      return {
        ok: false,
        reason: 'sink_failed',
        detail: error instanceof Error ? error.message : String(error),
      }
    }
    if (!emitted.ok) {
      // NOT counted and NOT retained. A refused emission never happened,
      // so advancing the sequence would leave a permanent gap that reads
      // as a lost event rather than as one that was never written.
      return { ok: false, reason: 'stale_fence', detail: emitted.detail }
    }
    this.#sequence += 1
    this.#emitted.push(parsed.data)
    return { ok: true, event: parsed.data }
  }
}
