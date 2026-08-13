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
import type { GateSpecT } from '@secure-home/contracts'
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

export interface AuthorityReadRequest extends RunScoped {
  readonly epoch: AcquisitionEpoch
  readonly source: string
}

export interface WorkspaceObserveRequest extends RunScoped {
  readonly root: string
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
export interface GateExecutionRequest extends RunScoped {
  readonly gate_id: string
  readonly spec: GateSpecT
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

export interface AdapterInvocationRequest extends RunScoped {
  readonly adapter: string
  readonly profile_ref: { readonly name: string; readonly version: string }
}

export type AdapterReport =
  | {
      readonly outcome: 'completed'
      readonly calls: readonly AdapterCall[]
    }
  | { readonly outcome: 'environmental_fault'; readonly detail: string }

export interface AdapterCall {
  readonly tool: string
  readonly disposition: 'permitted' | 'denied'
}

export type { ArtifactObservation, AuthorityBytes, WorkspaceObservation }
