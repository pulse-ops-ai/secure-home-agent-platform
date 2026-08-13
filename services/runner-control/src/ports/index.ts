/**
 * The port INTERFACES (design D3). Orchestration depends only on these;
 * implementations are injected at the composition root.
 *
 * The read/execute asymmetry is deliberate and is what keeps this landing
 * on the near side of U4: acquisition and observation are reads, so this
 * landing ships real read-only implementations of them, while anything
 * that would RUN something has deterministic in-memory implementations
 * only. No interface here can express "launch a container": there is no
 * image, no mount, no socket, and no argv anywhere in the surface.
 */
import type { FinalizationPort, Retractable } from './finalization.js'
import type { RunJournalPort, RunLeasePort } from './journal.js'
import type {
  AdapterInvocationRequest,
  AdapterReport,
  BaseObservation,
  ArtifactObservation,
  ArtifactObserveRequest,
  AuthorityBytes,
  AuthorityReadRequest,
  GateExecutionRequest,
  GateReport,
  RunScoped,
  WorkspaceObservation,
  WorkspaceObserveRequest,
} from './values.js'

export interface AuthoritySourcePort {
  read(request: AuthorityReadRequest): Promise<AuthorityBytes>
}

export interface WorkspaceObserverPort {
  observe(request: WorkspaceObserveRequest): Promise<WorkspaceObservation>
  /** The base identity, observable before anything has run. */
  observeBase(request: WorkspaceObserveRequest): Promise<BaseObservation>
}

export interface ArtifactObserverPort {
  observe(request: ArtifactObserveRequest): Promise<ArtifactObservation>
}

export interface ExecutionPort {
  runGate(request: GateExecutionRequest): Promise<GateReport>
}

export interface AdapterInvocationPort {
  invoke(request: AdapterInvocationRequest): Promise<AdapterReport>
}

/** One emitted run event. The shape is the L2 contract's, by instance. */
export interface EventSinkPort extends Retractable {
  emit(request: RunScoped & { readonly event: unknown }): Promise<void>
}

/**
 * The durable record sink.
 *
 * `kind` distinguishes what a run can durably produce: a sealed L2
 * evidence bundle, the early-terminal refusal record for a run that
 * terminated before authority completed, and the orchestration-owned
 * TRANSITION RECORD — the full declared walk, including the states the
 * closed event vocabulary does not represent (design D9). A record held
 * only in memory reconstructs nothing once the process ends, so the walk
 * is written like any other durable output.
 *
 * A fabricated bundle is not among the options — it is unrepresentable.
 */
export interface EvidenceSinkPort extends Retractable {
  write(
    request: RunScoped &
      (
        | { readonly kind: 'evidence_bundle'; readonly bundle: unknown }
        | { readonly kind: 'early_termination_record'; readonly record: unknown }
        | { readonly kind: 'transition_record'; readonly transitions: unknown }
      ),
  ): Promise<void>
}

/**
 * The clock is RUN-SCOPED, like every other port operation.
 *
 * This is not ceremony. A clock that answers `now()` with no key must
 * either be stateless or hold unkeyed mutable state — and a shared
 * instance holding unkeyed per-run state is precisely what
 * `runner-execution-boundary`'s isolation requirement forbids, because
 * two concurrent runs then interleave each other's timestamps and neither
 * run's timing is its own (RO-INV-10). Passing the key lets an
 * implementation keep per-run state correctly, and lets a stateless one
 * ignore it.
 */
export interface ClockPort {
  /** An ISO-8601 instant, for this run. */
  now(request: RunScoped): string
}

export interface Ports {
  readonly authority: AuthoritySourcePort
  /** The orchestration-owned durable record of the walk (D9). */
  readonly journal: RunJournalPort
  /** One owner per run, across processes (D10). */
  readonly lease: RunLeasePort
  /** The all-or-none terminal commit. */
  readonly finalization: FinalizationPort
  readonly workspace: WorkspaceObserverPort
  readonly artifacts: ArtifactObserverPort
  readonly execution: ExecutionPort
  readonly adapter: AdapterInvocationPort
  readonly events: EventSinkPort
  readonly evidence: EvidenceSinkPort
  readonly clock: ClockPort
}

export * from './values.js'
export * from './journal.js'
export * from './finalization.js'
export type { RejectionEntry, TransitionEntry } from '../lifecycle/machine.js'
