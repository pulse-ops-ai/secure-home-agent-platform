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
import { CommitLedger, isVisible } from '../run-state/visibility.js'
import type { CommitVisibility } from '../ports/index.js'

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
  readonly kind: 'evidence_bundle' | 'early_termination_record'
  readonly payload: unknown
  /** Present only while the write belongs to an unpublished commit. */
  readonly commit_id?: string
}

interface StoredEvent {
  readonly event: unknown
  readonly commit_id?: string
}

export class RecordingEventSink implements EventSinkPort {
  readonly #byRun = new Map<string, StoredEvent[]>()
  readonly #fence = new FenceLedger()
  readonly #visibility: CommitVisibility
  /** (run, sequence) → canonical landed event: the replay ledger. */
  readonly #landed = new Map<string, string>()
  /**
   * (run, sequence) → the unpublished staged reservation of that
   * identity: ONE canonical fact, and the independently owned physical
   * stage of each transaction that staged it. Two transactions may
   * intend the same durable fact, but durable-fact equivalence is NOT
   * ownership of unpublished mutable staging state — each commit owns
   * its own invisible row, and only its own.
   */
  readonly #reserved = new Map<
    string,
    { readonly canonical: string; readonly stages: Map<string, StoredEvent> }
  >()

  constructor(visibility: CommitVisibility = new CommitLedger()) {
    this.#visibility = visibility
  }

  /**
   * THE ONE EVENT-DOMAIN IDENTITY AUTHORITY. What durably occupies
   * (run, sequence) is either an ordinarily-landed event or a STAGED
   * event whose commit has published — `commit_id` names the atomic
   * transaction, never the event's own identity, so a staged terminal
   * event answers to the same ledger as every ordinary emission.
   */
  #durableCanonical(run_id: string, sequence: number): string | undefined {
    const identity = `${run_id}#e${String(sequence)}`
    const landed = this.#landed.get(identity)
    if (landed !== undefined) return landed
    for (const row of this.#byRun.get(run_id) ?? []) {
      if (row.commit_id === undefined || !isVisible(this.#visibility, row.commit_id)) continue
      const staged = row.event as { readonly sequence?: unknown }
      if (staged.sequence === sequence) return JSON.stringify(row.event)
    }
    return undefined
  }

  emit(
    request: RunFence & { readonly sequence: number; readonly event: unknown },
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    if (!refused.ok) return Promise.resolve(refused)
    // (run_id, sequence) is the event's identity. A repeat carrying the
    // SAME event is a lost acknowledgement resolved — acknowledged
    // without a second physical event. A DIFFERENT event wearing a
    // landed identity is refused outright: two events must never share
    // one identity, whatever went wrong with the first acknowledgement.
    const identity = `${request.run_id}#e${String(request.sequence)}`
    const canonical = JSON.stringify(request.event)
    const durable = this.#durableCanonical(request.run_id, request.sequence)
    if (durable !== undefined) {
      if (durable === canonical) return Promise.resolve(refused)
      // The typed refusal, not a throw: a caller must be able to tell
      // "this identity already carries a different event" apart from a
      // broken sink — the emitter advances past an occupied identity,
      // which a thrown error would hide as an unknown outcome.
      return Promise.resolve({
        ok: false,
        reason: 'conflicting_replay',
        detail: `event identity ${identity} already carries a different event`,
      })
    }
    // ONE event-domain authority, not two. An identity reserved by an
    // UNPUBLISHED staged event is not free: a different canonical fact
    // cannot occupy it merely because the reservation is not yet
    // durable — otherwise publication would expose two events at one
    // identity. (An ordinary emission of the EXACT reserved canonical
    // is deliberately left to today's behavior: that cell has no
    // executable falsification yet and its semantics are not decided
    // here.)
    const reserved = this.#liveReservation(identity)
    if (reserved !== undefined && reserved.canonical !== canonical) {
      return Promise.resolve({
        ok: false,
        reason: 'conflicting_replay',
        detail: `event identity ${identity} is reserved by an unpublished staged event`,
      })
    }
    this.#landed.set(identity, canonical)
    const existing = this.#byRun.get(request.run_id) ?? []
    existing.push({ event: request.event })
    this.#byRun.set(request.run_id, existing)
    return Promise.resolve(refused)
  }

  /**
   * Record the terminal event against `commit_id`, invisibly — under
   * the SAME event-domain identity authority as `emit`, with the staged
   * state machine explicit and identity enforcement UNCONDITIONAL (the
   * type guarantees the envelope carries its sequence):
   *
   *   UNUSED         → reserve the identity, stage ONE physical row
   *   EXACT REPLAY   → same identity, same canonical event: ok, and no
   *                    second row is ever created
   *   CONFLICT       → same identity, different canonical event —
   *                    whatever the commit_id says, because equality of
   *                    the TRANSACTION identity does not make different
   *                    domain facts equivalent: conflicting_replay, the
   *                    first reservation unchanged, the conflicting
   *                    event never staged
   *   ABANDON        → releases only THIS stage's unpublished
   *                    reservation and row; idempotent; cannot erase a
   *                    published event or an unrelated stage
   *   PUBLISH        → exactly one event becomes visible and the
   *                    identity is permanently occupied
   */
  stageEmit(
    request: RunFence & {
      readonly commit_id: string
      readonly event: Record<string, unknown> & {
        readonly event_type: string
        readonly sequence: number
      }
    },
  ): Promise<Staging> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    const commit_id = request.commit_id
    const run_id = request.run_id
    const sequence = request.event.sequence
    const canonical = JSON.stringify(request.event)
    const identity = `${run_id}#e${String(sequence)}`

    const durable = this.#durableCanonical(run_id, sequence)
    if (durable !== undefined) {
      if (durable !== canonical) {
        return Promise.resolve({
          ok: false,
          reason: 'conflicting_replay',
          detail: `event identity ${identity} already carries a different durable event; the terminal event cannot occupy it`,
        })
      }
      // The same logical fact is already durable: stage nothing, so
      // publication cannot duplicate it, and abandon has nothing to do.
      return Promise.resolve({
        ok: true,
        staged: { commitId: commit_id, abandon: () => undefined },
      })
    }

    const reserved = this.#liveReservation(identity)
    if (reserved !== undefined) {
      if (reserved.canonical !== canonical) {
        return Promise.resolve({
          ok: false,
          reason: 'conflicting_replay',
          detail: `event identity ${identity} is already reserved for a different event`,
        })
      }
      const own = reserved.stages.get(commit_id)
      if (own !== undefined) {
        // EXACT same-transaction replay: this commit's one physical row
        // already exists; the handle shares ITS OWN scoped cleanup
        // rather than staging a twin.
        return Promise.resolve({
          ok: true,
          staged: {
            commitId: commit_id,
            abandon: () => this.#releaseStage(identity, commit_id, own),
          },
        })
      }
      // EXACT cross-transaction replay: the durable FACT is equivalent,
      // but ownership of unpublished staging state is not. This commit
      // stages its OWN invisible row under the shared canonical
      // reservation — a capability whose label says this commit must
      // never carry cleanup authority over another commit's row, and a
      // transaction must never depend on staged state it does not own
      // to publish a complete record.
      const row: StoredEvent = { event: request.event, commit_id }
      const rows = this.#byRun.get(run_id) ?? []
      rows.push(row)
      this.#byRun.set(run_id, rows)
      reserved.stages.set(commit_id, row)
      return Promise.resolve({
        ok: true,
        staged: {
          commitId: commit_id,
          abandon: () => this.#releaseStage(identity, commit_id, row),
        },
      })
    }

    const row: StoredEvent = { event: request.event, commit_id }
    const existing = this.#byRun.get(run_id) ?? []
    existing.push(row)
    this.#byRun.set(run_id, existing)
    this.#reserved.set(identity, { canonical, stages: new Map([[commit_id, row]]) })
    return Promise.resolve({
      ok: true,
      staged: {
        commitId: commit_id,
        abandon: () => this.#releaseStage(identity, commit_id, row),
      },
    })
  }

  /**
   * The reservation currently holding `identity`, if any of its stages
   * is still unpublished. Published stages are durable — the durable
   * ledger answers for them — and a reservation whose every stage
   * published or abandoned no longer reserves anything.
   */
  #liveReservation(
    identity: string,
  ): { readonly canonical: string; readonly stages: Map<string, StoredEvent> } | undefined {
    const reservation = this.#reserved.get(identity)
    if (reservation === undefined) return undefined
    for (const row of reservation.stages.values()) {
      if (row.commit_id !== undefined && !isVisible(this.#visibility, row.commit_id)) {
        return reservation
      }
    }
    return undefined
  }

  /**
   * Release ONE transaction's stage: its row, its entry in the shared
   * reservation — never a published event, never another transaction's
   * stage, and idempotent.
   */
  #releaseStage(identity: string, commit_id: string, row: StoredEvent): void {
    if (row.commit_id !== undefined && isVisible(this.#visibility, row.commit_id)) return
    const reservation = this.#reserved.get(identity)
    if (reservation !== undefined && reservation.stages.get(commit_id) === row) {
      reservation.stages.delete(commit_id)
      if (reservation.stages.size === 0) this.#reserved.delete(identity)
    }
    for (const [run_id, rows] of this.#byRun) {
      const index = rows.indexOf(row)
      if (index !== -1) {
        rows.splice(index, 1)
        this.#byRun.set(run_id, rows)
        return
      }
    }
  }

  /** Events of ONE run — the filtering RO-INV-10 requires, at the source. */
  eventsOf(run_id: string): readonly unknown[] {
    return (this.#byRun.get(run_id) ?? [])
      .filter((row) => isVisible(this.#visibility, row.commit_id))
      .map((row) => row.event)
  }

  get runs(): readonly string[] {
    return [...this.#byRun.keys()]
  }
}

export class RecordingEvidenceSink implements EvidenceSinkPort {
  #writes: RecordedWrite[] = []
  readonly #fence = new FenceLedger()
  readonly #visibility: CommitVisibility

  constructor(visibility: CommitVisibility = new CommitLedger()) {
    this.#visibility = visibility
  }

  #visibleWrites(): readonly RecordedWrite[] {
    return this.#writes.filter((write) => isVisible(this.#visibility, write.commit_id))
  }

  /** Record identity → the canonical record that landed under it. */
  readonly #landed = new Map<string, string>()

  write(
    request: RunFence & { readonly record_id: string } & (
        | { readonly kind: 'evidence_bundle'; readonly bundle: unknown }
        | { readonly kind: 'early_termination_record'; readonly record: unknown }
      ),
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    // The seal is the run's final and most consequential write. A stale
    // holder sealing a bundle would produce a second, contradictory
    // record of one run — two answers to "what happened", both signed.
    if (!refused.ok) return Promise.resolve(refused)
    // A repeated record identity carrying the SAME canonical record —
    // the governed kind and the payload both — is a lost acknowledgement
    // being resolved: acknowledged, nothing appended, the first landed
    // version stands. A DIFFERENT record wearing a landed identity is a
    // CONFLICTING replay: refused without touching the first record,
    // because identity equality must imply record equality.
    const canonical = JSON.stringify({
      kind: request.kind,
      payload: request.kind === 'evidence_bundle' ? request.bundle : request.record,
    })
    const landed = this.#landed.get(request.record_id)
    if (landed !== undefined) {
      if (landed === canonical) return Promise.resolve(refused)
      return Promise.resolve({
        ok: false,
        reason: 'conflicting_replay',
        detail: `evidence record ${request.record_id} already landed a different record`,
      })
    }
    this.#landed.set(request.record_id, canonical)
    this.#writes.push({
      run_id: request.run_id,
      kind: request.kind,
      payload: request.kind === 'evidence_bundle' ? request.bundle : request.record,
    })
    return Promise.resolve(refused)
  }

  /** Record the seal against `commit_id`, invisibly. */
  stageWrite(
    request: RunFence & {
      readonly commit_id: string
      readonly kind: 'evidence_bundle'
      readonly bundle: unknown
    },
  ): Promise<Staging> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    const commit_id = request.commit_id
    this.#writes.push({
      run_id: request.run_id,
      kind: 'evidence_bundle',
      payload: request.bundle,
      commit_id,
    })
    return Promise.resolve({
      ok: true,
      staged: {
        commitId: commit_id,
        abandon: () => {
          this.#writes = this.#writes.filter((write) => write.commit_id !== commit_id)
        },
      },
    })
  }

  writesOf(run_id: string): readonly RecordedWrite[] {
    return this.#visibleWrites().filter((write) => write.run_id === run_id)
  }

  get all(): readonly RecordedWrite[] {
    return this.#visibleWrites()
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
