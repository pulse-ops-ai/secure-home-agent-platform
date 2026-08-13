/**
 * A workspace lifecycle that isolates nothing and applies nothing.
 *
 * It mints a handle, records what it was asked to do, and reports
 * success. That is deliberate and disclosed: creating a genuinely
 * isolated writable workspace and performing a genuinely atomic
 * apply-back are the later enforcement landing's, and pretending
 * otherwise here would be the same defect as entering SANDBOX_STARTED
 * without starting anything.
 *
 * What this landing does own is the ORDERING, and that is real: the
 * workspace is provisioned before execution, the core is asked before
 * anything is applied, and nothing is sealed for a run whose changes did
 * not land.
 */
import type {
  ApplyBackOutcome,
  ApplyBackRequest,
  RunScoped,
  WorkspaceLifecyclePort,
  WorkspaceProvision,
} from '../ports/index.js'

export class InMemoryWorkspaceLifecycle implements WorkspaceLifecyclePort {
  readonly #applied = new Map<string, number>()

  provision(request: RunScoped & { readonly source_ref: string }): Promise<WorkspaceProvision> {
    return Promise.resolve({
      ok: true,
      handle: {
        workspace_ref: `workspace:${request.run_id}`,
        root: request.source_ref,
      },
    })
  }

  applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
    this.#applied.set(request.run_id, request.changes.length)
    return Promise.resolve({ ok: true, applied: request.changes.length })
  }

  discard(): Promise<void> {
    return Promise.resolve()
  }

  appliedFor(run_id: string): number {
    return this.#applied.get(run_id) ?? 0
  }
}
