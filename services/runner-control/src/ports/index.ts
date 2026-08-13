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
import type { FinalizationPort, Staging } from './finalization.js'
import type { RunJournalPort, RunLeasePort } from '../run-state/ports.js'
import type { ExecutionSessionPort } from '../execution/ports.js'
import type { WorkspaceLifecyclePort } from '../workspace/ports.js'
import type {
  AdapterInvocationRequest,
  AdapterReport,
  BaseObservation,
  ArtifactObservation,
  ArtifactObserveRequest,
  AuthorityBytes,
  AuthorityReadRequest,
  FenceOutcome,
  GateExecutionRequest,
  GateReport,
  RunFence,
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

export type AdapterInvocation = AdapterInvocationRequest

/** One emitted run event. The shape is the L2 contract's, by instance. */
export interface EventSinkPort {
  emit(request: RunFence & { readonly event: unknown }): Promise<FenceOutcome>
  /**
   * Prepare the terminal event as part of a finalization commit. Not
   * observable until published — `run.terminated` must never announce an
   * outcome before the bundle recording it exists.
   */
  stageEmit(
    request: RunFence & { readonly commit_id: string; readonly event: unknown },
  ): Promise<Staging>
}

/**
 * The durable record sink.
 *
 * `kind` distinguishes what a run can durably produce: a sealed L2
 * evidence bundle, and the early-terminal refusal record for a run that
 * terminated before authority completed. Exactly two, and a fabricated
 * bundle is not among them — it is unrepresentable.
 *
 * The orchestration-owned TRANSITION RECORD is deliberately NOT here.
 * The requirement is real — every declared transition must land in a
 * durable record distinct from the L2 event stream — but `RunJournalPort`
 * owns it, appended as the walk happens (design D9). This sink briefly
 * declared a third `transition_record` shape as well; nothing ever wrote
 * it, and a second declared authority for one concept is how the two
 * drift apart. A record written here after the seal would also make the
 * seal not the run's last write.
 */
export interface EvidenceSinkPort {
  write(
    request: RunFence &
      (
        | { readonly kind: 'evidence_bundle'; readonly bundle: unknown }
        | { readonly kind: 'early_termination_record'; readonly record: unknown }
      ),
  ): Promise<FenceOutcome>
  /**
   * Prepare the sealed bundle as part of a finalization commit. Staged
   * last, so the participant most likely to refuse does so while
   * refusing is still free.
   */
  stageWrite(
    request: RunFence & {
      readonly commit_id: string
      readonly kind: 'evidence_bundle'
      readonly bundle: unknown
    },
  ): Promise<Staging>
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
  /** The execution session: what makes SANDBOX_STARTED a caused state. */
  readonly session: ExecutionSessionPort
  /** The isolated workspace, and the apply-back the core authorizes. */
  readonly workspace: WorkspaceLifecyclePort
  readonly observer: WorkspaceObserverPort
  readonly artifacts: ArtifactObserverPort
  readonly execution: ExecutionPort
  readonly adapter: AdapterInvocationPort
  readonly events: EventSinkPort
  readonly evidence: EvidenceSinkPort
  readonly clock: ClockPort
}

export * from './values.js'
export * from '../run-state/ports.js'
export * from './finalization.js'
export * from '../execution/ports.js'
export * from '../workspace/ports.js'
export type { RejectionEntry, TransitionEntry } from '../lifecycle/machine.js'
