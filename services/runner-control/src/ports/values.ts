/**
 * Port VALUE shapes (design D3).
 *
 * Every run-scoped request carries its `run_id`. That is not decoration:
 * `runner-execution-boundary`'s isolation requirement lets one port
 * instance be shared by concurrent runs, and the key is what makes such
 * sharing safe — an implementation keys whatever per-run state it keeps,
 * and nothing can bleed between runs (RO-INV-10).
 *
 * These shapes carry no authority. Acquisition results are the L3 value
 * types verbatim, so the orchestrator has nothing to reshape on the way
 * into a decision.
 */
import type { CapabilityGrantT, GateSpecT } from '@secure-home/contracts'
import type {
  ArtifactObservation,
  AuthorityBytes,
  WorkspaceObservation,
} from '@secure-home/runner-core'

/** The two declared acquisition epoch roles (design D4). */
export const ACQUISITION_EPOCHS = ['production', 'verification'] as const
export type AcquisitionEpoch = (typeof ACQUISITION_EPOCHS)[number]

/** Every run-scoped port request states which run it belongs to. */
export interface RunScoped {
  readonly run_id: string
}

/**
 * THE FENCING TOKEN, presented to the operation it fences.
 *
 * `RunLeasePort` already minted a generation, and the walk renewed it
 * between phases. That is a LIVENESS check, not a fence: ownership can
 * move during a phase, and the stale holder then keeps writing until the
 * next boundary — through sinks that had no way to tell it apart from
 * the real owner, because nothing but `renew` ever saw a generation.
 *
 * So the token travels with the effect. Every operation that CHANGES
 * something carries the fence, and the receiving implementation rejects
 * a generation it has already been superseded by. Reads do not carry it:
 * a stale reader learns nothing a current one could not, and fencing
 * reads would only make lost ownership look like a read failure.
 *
 * This is the classic fencing rule, and the reason it is enforced at the
 * RESOURCE rather than by asking the lease: a sink that must consult the
 * lease store to accept a write is a sink that accepts writes whenever
 * the lease store is unreachable. Remembering the highest generation it
 * has admitted costs one integer and needs nobody's cooperation.
 */
export interface RunFence extends RunScoped {
  readonly generation: number
}

/**
 * The answer from an effectful operation that had nothing else to say.
 *
 * Operations that already carry a discriminated outcome express a stale
 * fence in their own vocabulary. The ones that used to return
 * `Promise<void>` had no way to refuse at all — so they return this
 * instead of throwing, because a rejected write is a fact the caller has
 * to act on, and an exception thrown through a `catch {}` that exists to
 * tolerate transient sink faults would be silently swallowed.
 */
export type FenceOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'stale_fence'; readonly detail: string }

export interface AuthorityReadRequest extends RunScoped {
  readonly epoch: AcquisitionEpoch
  readonly source: string
  /**
   * For the profile source, the reference the run asked for. An
   * implementation that can resolve by reference SHOULD; the
   * orchestrator verifies the captured identity against it regardless,
   * so a source that ignores this cannot widen the run's authority.
   */
  readonly requested?: { readonly name: string; readonly version: string }
}

export interface WorkspaceObserveRequest extends RunScoped {
  readonly root: string
}

/**
 * The observed identity of the workspace BASE, distinct from the changes
 * observed later. It exists as its own operation because the comparison
 * against the pinned base has to happen before the adapter runs, and a
 * change-set observation taken afterwards cannot answer that question.
 */
export type BaseObservation =
  { readonly ok: true; readonly digest: string } | { readonly ok: false; readonly failure: string }

/** The evidence operation sets, as the bundle records them. */
export interface EvidenceOperation {
  readonly call_id: string
  readonly operation: { readonly name: string; readonly target?: string }
}

export interface EvidenceOperations {
  readonly attempted: EvidenceOperation[]
  readonly permitted: EvidenceOperation[]
  readonly denied: EvidenceOperation[]
}

export interface ArtifactObserveRequest extends RunScoped {
  readonly paths: readonly string[]
}

/**
 * A gate execution request names a gate IDENTITY and carries the spec
 * taken from the captured registry. A caller cannot hand over argv: the
 * scheduling interface never accepts one, so widening the executed
 * command is unexpressible rather than merely rejected (RO-INV-05).
 */
export interface GateExecutionRequest extends RunFence {
  readonly gate_id: string
  readonly spec: GateSpecT
  /** The session this gate runs inside — L9 binds teardown to it. */
  readonly session_ref: string
  /**
   * Aborted when the run is cancelled or its deadline elapses. Handed to
   * the call rather than polled around it: an implementation that
   * honours it stops immediately, and one that does not is raced by the
   * orchestrator anyway, so a hung gate cannot hold the run open.
   */
  readonly signal: AbortSignal
}

/**
 * What the execution port observed. `toolchain_unavailable` and
 * `truncated` are REPORTS, not dispositions — the mapping to the closed
 * disposition vocabulary happens once, at the recording boundary, and is
 * never renormalized downstream (design D6).
 */
export type GateReport =
  | { readonly outcome: 'passed' }
  | { readonly outcome: 'failed'; readonly reason: string; readonly truncated: boolean }
  | { readonly outcome: 'declared_skip'; readonly reason: string }
  | { readonly outcome: 'toolchain_unavailable'; readonly reason: string }
  | { readonly outcome: 'environmental_fault'; readonly detail: string }
  /**
   * The caller no longer owns this run. Distinct from an environmental
   * fault on purpose: nothing is wrong with the gate or the host, and
   * the run must not be terminated on this — it must stop writing.
   */
  | { readonly outcome: 'stale_fence'; readonly detail: string }

/**
 * THE ADAPTER SPI, frozen to ADR-0013.
 *
 * The invocation is PLATFORM-BUILT. It carries what an adapter needs to
 * translate faithfully and nothing it could widen with: no image, no
 * argv, no mount path, no socket. An adapter that cannot express "launch
 * this" cannot be argued into launching it.
 *
 * Frozen here rather than at L7 deliberately. L7's authorized scope is
 * `adapters/` and images — not this service. An L7 that discovered the
 * SPI could not carry what the ADR requires would have to reopen L4 or
 * widen its own authorization, and a landing does not get to do either
 * to itself.
 */
export interface RunInput {
  readonly kind: 'task'
  /** The workload. Immutable, and passed through unchanged. */
  readonly task: string
  readonly parameters: Readonly<Record<string, string>>
}

export interface AdapterInvocationRequest extends RunFence {
  readonly adapter: string
  /** The captured profile identity — WHICH bytes governed. */
  readonly profile: { readonly name: string; readonly version: string; readonly digest: string }
  readonly input: RunInput
  /**
   * The grant, for the adapter to translate into the provider's visible
   * tool surface and explicit denials (ADR-0013 decision 2). Narrowing
   * what the model can even see is real defense in depth; it is NOT the
   * security boundary, which the substrate enforces at L9.
   */
  readonly grant: CapabilityGrantT
  readonly routing: {
    readonly routing_class: string
    readonly model_route: string
    readonly fallback: string
  }
  readonly limits: {
    readonly wall_clock_seconds: number
    readonly cpu_cores: number
    readonly memory_bytes: number
    readonly pids: number
    readonly output_bytes: number
  }
  /**
   * Credential REFERENCES — environment-variable names. There is no
   * field here a value could occupy, so "the adapter never holds a
   * credential" (decision 7) is a property of the shape rather than a
   * rule someone must remember.
   */
  readonly credentials: readonly { readonly env_var: string }[]
  /** Opaque references. The adapter resolves nothing itself. */
  readonly workspace: { readonly session_ref: string; readonly root_ref: string }
  /** Aborted on cancellation or deadline; see `GateExecutionRequest`. */
  readonly signal: AbortSignal
}

/** One tool call the provider reported, with the disposition it saw. */
export interface AdapterCall {
  readonly tool: string
  readonly disposition: 'permitted' | 'denied'
}

/**
 * Model output. A CLAIM, always — "untrusted text until the platform
 * validates it" (decision 4). Nothing downstream may treat this as fact,
 * which is why it never reaches the authoritative change set.
 */
export interface UntrustedClaim {
  readonly kind: 'text' | 'structured'
  readonly content: string
}

/**
 * A provider event, normalized at the adapter boundary (decision 5).
 * Provider-native shapes do not leak upward: what arrives is a name and
 * data, already translated.
 */
export interface NormalizedProviderEvent {
  readonly name: string
  readonly at: string
  readonly data: Readonly<Record<string, string>>
}

/**
 * What the provider was OBSERVED to do at the end — separate fields
 * precisely so they can DISAGREE (decision 3).
 *
 * The spike found exit 124 alongside `exitCode: 0`. A single "terminal"
 * field would have had to pick one and lose the disagreement; carrying
 * them apart lets the lifecycle see the conflict and classify the run
 * INDETERMINATE, which is a failure class. There is deliberately no
 * field here that could name a terminal state: an adapter has no way to
 * report that the run succeeded.
 */
export interface TerminalObservations {
  readonly exit_code?: number
  /** The provider's own words about its outcome. Opaque, untrusted. */
  readonly reported_outcome?: string
  readonly transcript_terminal?: string
  readonly signalled?: string
}

/** Usage in NATIVE units. Money is not modeled (decision 6). */
export interface UsageMeasure {
  readonly unit: string
  readonly amount: number
}

export interface AdapterObservation {
  readonly calls: readonly AdapterCall[]
  readonly claims: readonly UntrustedClaim[]
  readonly events: readonly NormalizedProviderEvent[]
  readonly terminal: TerminalObservations
  readonly usage: readonly UsageMeasure[]
  /** A reference to the transcript, never its content. */
  readonly transcript?: { readonly ref: string; readonly digest: string }
}

/**
 * `observed`, not `completed`. The adapter reports what it saw; the
 * lifecycle decides what it means.
 */
export type AdapterReport =
  | { readonly outcome: 'observed'; readonly observation: AdapterObservation }
  | { readonly outcome: 'environmental_fault'; readonly detail: string }
  /** The caller no longer owns this run; see `GateReport`. */
  | { readonly outcome: 'stale_fence'; readonly detail: string }

export type { ArtifactObservation, AuthorityBytes, WorkspaceObservation }
