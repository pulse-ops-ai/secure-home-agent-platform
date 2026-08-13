/**
 * Deterministic in-memory implementations of the ports that would RUN
 * something (design D3, OQ1's resolution).
 *
 * Execution and adapter invocation stay fake in this landing, and the
 * fakes are the only implementations of those ports in the repository.
 * That is the whole point: the concrete launcher is L9's, after U4/#9,
 * and the adapter SPI is L7's. Until then a run can be orchestrated,
 * proven, and evidenced end to end without anything in this service being
 * able to start a process.
 *
 * Nothing here imports a child-process, container, or network module —
 * there is no spawn to disable, because there is no spawn.
 *
 * The sinks record what they were given so a test can read the ordering
 * back. They key everything by `run_id` precisely because a single sink
 * instance may be shared by concurrent runs: unkeyed per-run state here
 * would be the exact defect `runner-execution-boundary`'s isolation
 * requirement forbids (RO-INV-10).
 */
import type {
  AdapterInvocationPort,
  AdapterInvocationRequest,
  AdapterReport,
  ClockPort,
  EventSinkPort,
  EvidenceSinkPort,
  ExecutionPort,
  FenceOutcome,
  GateExecutionRequest,
  GateReport,
  RunFence,
  RunScoped,
  Staging,
} from '../ports/index.js'
import { FenceLedger } from '../run-state/fence.js'

/** Gate reports supplied per gate identity; anything unlisted passes. */
export class DeterministicExecution implements ExecutionPort {
  readonly #reports: ReadonlyMap<string, GateReport>
  readonly #requests: GateExecutionRequest[] = []
  readonly #fence = new FenceLedger()

  constructor(reports: Readonly<Record<string, GateReport>> = {}) {
    this.#reports = new Map(Object.entries(reports))
  }

  /** Every request this port received, for plan-construction proofs. */
  get requests(): readonly GateExecutionRequest[] {
    return this.#requests
  }

  runGate(request: GateExecutionRequest): Promise<GateReport> {
    const refused = this.#fence.refuse(request)
    // Refused BEFORE the request is recorded, so a proof asserting "the
    // stale holder ran no gate" reads the request log and finds nothing
    // — rather than finding an attempt that merely returned an error.
    if (refused !== undefined) return Promise.resolve({ outcome: 'stale_fence', detail: refused })
    this.#requests.push(request)
    return Promise.resolve(this.#reports.get(request.gate_id) ?? { outcome: 'passed' })
  }
}

export class DeterministicAdapterInvocation implements AdapterInvocationPort {
  readonly #report: AdapterReport
  readonly #requests: AdapterInvocationRequest[] = []
  readonly #fence = new FenceLedger()

  constructor(
    report: AdapterReport = {
      outcome: 'observed',
      observation: { calls: [], claims: [], events: [], terminal: { exit_code: 0 }, usage: [] },
    },
  ) {
    this.#report = report
  }

  get requests(): readonly AdapterInvocationRequest[] {
    return this.#requests
  }

  invoke(request: AdapterInvocationRequest): Promise<AdapterReport> {
    const refused = this.#fence.refuse(request)
    // The fence is checked before the provider is engaged at all. A run
    // that lost ownership must not spend — the whole point of fencing
    // the invocation rather than only its result.
    if (refused !== undefined) return Promise.resolve({ outcome: 'stale_fence', detail: refused })
    this.#requests.push(request)
    return Promise.resolve(this.#report)
  }
}

export interface RecordedWrite {
  readonly run_id: string
  readonly kind: 'evidence_bundle' | 'early_termination_record' | 'transition_record'
  readonly payload: unknown
}

export class RecordingEventSink implements EventSinkPort {
  readonly #byRun = new Map<string, unknown[]>()
  readonly #fence = new FenceLedger()

  emit(request: RunFence & { readonly event: unknown }): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    if (!refused.ok) return Promise.resolve(refused)
    const existing = this.#byRun.get(request.run_id) ?? []
    existing.push(request.event)
    this.#byRun.set(request.run_id, existing)
    return Promise.resolve(refused)
  }

  /** Prepare the terminal event. Absent from `eventsOf` until published. */
  stageEmit(request: RunFence & { readonly event: unknown }): Promise<Staging> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    const event = request.event
    const run_id = request.run_id
    return Promise.resolve({
      ok: true,
      staged: {
        publish: () => {
          const existing = this.#byRun.get(run_id) ?? []
          existing.push(event)
          this.#byRun.set(run_id, existing)
        },
        abandon: () => {
          // The event was never in the stream.
        },
      },
    })
  }

  /** Events of ONE run — the filtering RO-INV-10 requires, at the source. */
  eventsOf(run_id: string): readonly unknown[] {
    return this.#byRun.get(run_id) ?? []
  }

  get runs(): readonly string[] {
    return [...this.#byRun.keys()]
  }
}

export class RecordingEvidenceSink implements EvidenceSinkPort {
  readonly #writes: RecordedWrite[] = []
  readonly #fence = new FenceLedger()

  write(
    request: RunFence &
      (
        | { readonly kind: 'evidence_bundle'; readonly bundle: unknown }
        | { readonly kind: 'early_termination_record'; readonly record: unknown }
        | { readonly kind: 'transition_record'; readonly transitions: unknown }
      ),
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    // The seal is the run's final and most consequential write. A stale
    // holder sealing a bundle would produce a second, contradictory
    // record of one run — two answers to "what happened", both signed.
    if (!refused.ok) return Promise.resolve(refused)
    this.#writes.push({
      run_id: request.run_id,
      kind: request.kind,
      payload:
        request.kind === 'evidence_bundle'
          ? request.bundle
          : request.kind === 'early_termination_record'
            ? request.record
            : request.transitions,
    })
    return Promise.resolve(refused)
  }

  /** Prepare the seal. Absent from `writesOf` until published. */
  stageWrite(
    request: RunFence & { readonly kind: 'evidence_bundle'; readonly bundle: unknown },
  ): Promise<Staging> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    const entry: RecordedWrite = {
      run_id: request.run_id,
      kind: 'evidence_bundle',
      payload: request.bundle,
    }
    return Promise.resolve({
      ok: true,
      staged: {
        publish: () => {
          this.#writes.push(entry)
        },
        abandon: () => {
          // The bundle was never in the sink, so a failed commit leaves
          // no bundle to remove — and no removal that could itself fail.
        },
      },
    })
  }

  writesOf(run_id: string): readonly RecordedWrite[] {
    return this.#writes.filter((write) => write.run_id === run_id)
  }

  get all(): readonly RecordedWrite[] {
    return this.#writes
  }
}

/**
 * A clock that advances one second per reading from a fixed origin,
 * counted PER RUN.
 *
 * Deterministic on purpose: a run's timing must be reproducible for the
 * proofs, and a real clock would make ordering assertions flaky rather
 * than true. Keyed by `run_id` for a stronger reason — a single instance
 * of this clock is shared by concurrent runs, and a per-INSTANCE counter
 * would let one run's readings advance another's timestamps. That is
 * unkeyed mutable per-run state, which the isolation requirement forbids,
 * and it is exactly what RO-PROP-04 detects: each run's bundle would stop
 * matching the bundle that run produces alone.
 */
export class SteppingClock implements ClockPort {
  readonly #ticks = new Map<string, number>()
  readonly #originMs: number

  constructor(origin = '2026-01-01T00:00:00.000Z') {
    this.#originMs = Date.parse(origin)
  }

  now(request: RunScoped): string {
    const tick = this.#ticks.get(request.run_id) ?? 0
    this.#ticks.set(request.run_id, tick + 1)
    return new Date(this.#originMs + tick * 1000).toISOString()
  }
}
