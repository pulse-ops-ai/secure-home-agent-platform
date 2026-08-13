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
  GateExecutionRequest,
  GateReport,
  RunScoped,
} from '../ports/index.js'

/** Gate reports supplied per gate identity; anything unlisted passes. */
export class DeterministicExecution implements ExecutionPort {
  readonly #reports: ReadonlyMap<string, GateReport>
  readonly #requests: GateExecutionRequest[] = []

  constructor(reports: Readonly<Record<string, GateReport>> = {}) {
    this.#reports = new Map(Object.entries(reports))
  }

  /** Every request this port received, for plan-construction proofs. */
  get requests(): readonly GateExecutionRequest[] {
    return this.#requests
  }

  runGate(request: GateExecutionRequest): Promise<GateReport> {
    this.#requests.push(request)
    return Promise.resolve(this.#reports.get(request.gate_id) ?? { outcome: 'passed' })
  }
}

export class DeterministicAdapterInvocation implements AdapterInvocationPort {
  readonly #report: AdapterReport
  readonly #requests: AdapterInvocationRequest[] = []

  constructor(report: AdapterReport = { outcome: 'completed', calls: [] }) {
    this.#report = report
  }

  get requests(): readonly AdapterInvocationRequest[] {
    return this.#requests
  }

  invoke(request: AdapterInvocationRequest): Promise<AdapterReport> {
    this.#requests.push(request)
    return Promise.resolve(this.#report)
  }
}

export interface RecordedWrite {
  readonly run_id: string
  readonly kind: 'evidence_bundle' | 'early_termination_record'
  readonly payload: unknown
}

export class RecordingEventSink implements EventSinkPort {
  readonly #byRun = new Map<string, unknown[]>()

  emit(request: RunScoped & { readonly event: unknown }): Promise<void> {
    const existing = this.#byRun.get(request.run_id) ?? []
    existing.push(request.event)
    this.#byRun.set(request.run_id, existing)
    return Promise.resolve()
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

  write(
    request: RunScoped &
      (
        | { readonly kind: 'evidence_bundle'; readonly bundle: unknown }
        | { readonly kind: 'early_termination_record'; readonly record: unknown }
      ),
  ): Promise<void> {
    this.#writes.push({
      run_id: request.run_id,
      kind: request.kind,
      payload: request.kind === 'evidence_bundle' ? request.bundle : request.record,
    })
    return Promise.resolve()
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
