/**
 * The workspace lifecycle: an isolated writable workspace, and the
 * verified apply-back of what a run did inside it.
 *
 * The boundary this exists to make explicit, with ownership stated
 * rather than left to be discovered:
 *
 *   isolated writable workspace   ← provisioned here; L9 makes it real
 *          ↓
 *   trusted host observes diff    ← L4 owns this, and does it
 *          ↓
 *   materialization decision      ← the CORE decides; L4 only asks
 *          ↓
 *   verified apply-back / refuse  ← L4 orders it; L9 performs it
 *
 * `decideMaterialization` had existed in the trusted core since L3 and
 * orchestration never called it. That is not a missing call — it is a
 * missing boundary: a run could change a workspace and nothing decided
 * whether those changes were allowed to leave it. Observation alone
 * answers "what happened", never "may this be kept".
 *
 * L4 owns the lifecycle and the ORDERING: provision before execution,
 * observe, ask the core, apply or discard, and never seal a run whose
 * changes did not land. L9 owns creating a genuinely isolated workspace
 * and performing a genuinely atomic apply-back. This landing ships an
 * implementation that isolates nothing and applies nothing, and says so.
 */
import type { ObservedChange } from '@secure-home/runner-core'
import type { RunScoped } from '../ports/values.js'

export interface WorkspaceHandle {
  readonly workspace_ref: string
  /** The root the run writes into. Isolated from the source of truth. */
  readonly root: string
}

export type WorkspaceProvision =
  | { readonly ok: true; readonly handle: WorkspaceHandle }
  | { readonly ok: false; readonly detail: string }

/**
 * What the core decided may be materialized, handed over for apply-back.
 * The change set is the AUTHORITATIVE observation — not the model's
 * claims, and not a re-derivation.
 */
export interface ApplyBackRequest extends RunScoped {
  readonly workspace_ref: string
  readonly changes: readonly ObservedChange[]
  /**
   * The identity of the path policy that authorized this. Carried so an
   * implementation can record WHICH authority permitted the write, and
   * so an apply-back can never be replayed under a different one.
   */
  readonly authorized_by: { readonly contract_id: string; readonly digest: string }
}

export type ApplyBackOutcome =
  { readonly ok: true; readonly applied: number } | { readonly ok: false; readonly detail: string }

export interface WorkspaceLifecyclePort {
  provision(request: RunScoped & { readonly source_ref: string }): Promise<WorkspaceProvision>
  applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome>
  /** Always called, on every exit. Discards the isolated workspace. */
  discard(request: RunScoped & { readonly workspace_ref: string }): Promise<void>
}
