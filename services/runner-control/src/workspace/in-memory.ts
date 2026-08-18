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
  FenceOutcome,
  RunFence,
  WorkspaceLifecyclePort,
  WorkspaceProvision,
} from '../ports/index.js'
import { FenceLedger } from '../run-state/fence.js'

export class InMemoryWorkspaceLifecycle implements WorkspaceLifecyclePort {
  readonly #applied = new Map<string, number>()
  /** Materialization identity → the canonical change set that landed. */
  readonly #materialized = new Map<string, string>()
  readonly #fence = new FenceLedger()

  provision(
    request: RunFence & { readonly workspace_ref: string; readonly source_ref: string },
  ): Promise<WorkspaceProvision> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    // The caller's identity is the workspace's identity — a resource
    // created under a name minted only in the response would be
    // unresolvable once that response is lost.
    return Promise.resolve({
      ok: true,
      handle: {
        workspace_ref: request.workspace_ref,
        root: request.source_ref,
      },
    })
  }

  applyBack(request: ApplyBackRequest): Promise<ApplyBackOutcome> {
    const refused = this.#fence.refuse(request)
    // The most consequential fence in the service: apply-back is how a
    // run's changes LEAVE isolation. A dispossessed holder applying its
    // observations over the current owner's workspace would materialize
    // work that the run in progress never did.
    if (refused !== undefined) {
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    }
    // THE SAME REPLAY RULE AS EVERY ACKNOWLEDGED EFFECT: identity AND
    // canonical intent. The materialization's identity is the fenced
    // (run, generation, workspace); a repeat carrying the same observed
    // change set and authority is a lost acknowledgement resolved
    // without re-applying, and a DIFFERENT materialization wearing a
    // landed identity refuses — re-applying it would double-write the
    // one effect that escapes isolation.
    const identity = `${request.run_id}#g${String(request.generation)}#${request.workspace_ref}`
    const canonical = JSON.stringify({
      changes: request.changes,
      authorized_by: request.authorized_by,
    })
    const landed = this.#materialized.get(identity)
    if (landed !== undefined) {
      if (landed === canonical) {
        return Promise.resolve({ ok: true, applied: request.changes.length })
      }
      return Promise.resolve({
        ok: false,
        reason: 'conflicting_replay',
        detail: `workspace ${request.workspace_ref} already materialized a different change set for generation ${String(request.generation)}`,
      })
    }
    this.#materialized.set(identity, canonical)
    this.#applied.set(request.run_id, request.changes.length)
    return Promise.resolve({ ok: true, applied: request.changes.length })
  }

  discard(request: RunFence & { readonly workspace_ref: string }): Promise<FenceOutcome> {
    return Promise.resolve(this.#fence.outcome(request))
  }

  appliedFor(run_id: string): number {
    return this.#applied.get(run_id) ?? 0
  }
}
