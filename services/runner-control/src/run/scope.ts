/**
 * ONE RUN'S STATE, owned by the caller of the walk.
 *
 * This exists because of a correctness bug, not because 1,391 lines is a
 * lot. The machine, the provisioned workspace, the open session and the
 * armed timers all lived in closures inside the walk, so the exception
 * handler wrapping that walk could reach none of them. When a port threw
 * it did the only thing it could: it built a FRESH `RunMachine`, which
 * starts in `REQUESTED`, and reported that.
 *
 * A run that reached `RUNNING` and then hit a throwing port therefore
 * reported one invented transition instead of the five it took, wrote
 * the early-terminal record reserved for runs that never had authority,
 * leaked its workspace and its deadline timer, and left the journal
 * entries pending at the throw unflushed.
 *
 * None of that is fixable inside the handler while the state is out of
 * reach. So the state is here, and the handler is handed the run that
 * actually happened.
 *
 * WHAT IS AND IS NOT HERE. This holds what the RECOVERY path needs: the
 * machine, the resources to release, the fence, and whether authority
 * was ever established. The walk's accumulated observations
 * (dispositions, change set, artifacts, operations) stay in the walk,
 * because recovery deliberately seals no bundle — see `#walkOwned`.
 * Moving those out too, and passing the captured authority to phases as
 * a parameter rather than sharing it through closures, is the next
 * decomposition step; it is what will finally delete the definite-
 * assignment assertions the walk still relies on.
 */
import type { Ports, RunFence, SessionHandle, WorkspaceHandle } from '../ports/index.js'
import type { CommitCapability, RunMachine, TransitionKind } from '../lifecycle/index.js'
import type { WalkState } from '../orchestration/state.js'

export class RunScope {
  readonly fence: RunFence
  readonly machine: RunMachine
  readonly startedAt: string

  /** Acquired during the spend phase; released on every exit. */
  session: SessionHandle | undefined
  workspace: WorkspaceHandle | undefined
  readonly timers: ReturnType<typeof setTimeout>[] = []

  /**
   * Set when a precondition holds the run where it is.
   *
   * Distinguishes a HOLD — the run waits, resumable — from a run the
   * machine granted no terminal for, which is `unterminated`. Both leave
   * the machine at a progress state, and only this tells them apart.
   */
  held: string | undefined

  /** Set the first time any port refuses this run's fence. */
  fenceLost: string | undefined

  /**
   * Whether this run ever captured an execution profile.
   *
   * The recovery path turns on exactly this. A run with no identities
   * can only produce the early-terminal record; a run that resolved a
   * profile, a principal and an adapter must never be given that shape,
   * because it describes a different run than the one that happened.
   */
  authorityCaptured = false

  constructor(fence: RunFence, machine: RunMachine, startedAt: string) {
    this.fence = fence
    this.machine = machine
    this.startedAt = startedAt
  }

  /** What the walk has established so far. See `WalkState`. */
  established: WalkState = { at: 'requested' }

  loseFence(detail: string): void {
    this.fenceLost ??= detail
  }

  /**
   * THE ONE OWNER of a terminal transition taken outside the walk engine.
   *
   * The engine makes the machine authoritative on the ordinary path.
   * The failure paths were converted to check `advance()` one at a time,
   * and two were missed — `failClosed`, and the exception handler's
   * INDETERMINATE. Both applied a terminal, ignored the answer, and then
   * reported `machine.state`; when the machine refused, that state was
   * unchanged, so the run concluded in a PROGRESS state. A run abandoned
   * mid-walk is exactly what the lifecycle requirement forbids, and it
   * happened only on the paths that run when something already failed.
   *
   * Having one owner is the fix rather than three more checks: a fourth
   * local helper would have been missed the same way.
   *
   * The fallback is not a workaround. A run whose declared terminal the
   * machine refuses is a run whose terminal state cannot be established,
   * and INDETERMINATE is exactly that — a failure class, never a quiet
   * success. If the table grants no terminal at all, nothing is invented:
   * the refusal is already recorded, and the caller is told so it can
   * report the run as unterminated instead of claiming otherwise.
   */
  reachTerminal(
    kind: TransitionKind,
    why: string,
  ):
    | { readonly ok: true; readonly kind: TransitionKind }
    | { readonly ok: false; readonly detail: string } {
    const from = this.machine.state
    if (this.machine.advance(kind, why).kind === 'advanced') return { ok: true, kind }
    if (kind !== 'indeterminate') {
      const cause = `${why}; and the machine declares no ${kind} from ${from}, so the terminal state cannot be established`
      if (this.machine.advance('indeterminate', cause).kind === 'advanced') {
        return { ok: true, kind: 'indeterminate' }
      }
    }
    return {
      ok: false,
      detail: `the machine granted no terminal from ${this.machine.state}: ${kind} was refused, and so was indeterminate`,
    }
  }

  /**
   * Adopt the entries a finalization commit made durable.
   *
   * Also a machine advance — it sets the state, appends a transition and
   * bumps the version — so it lives with the other one. The guard that
   * asserts "only the declared owners advance the machine" scanned for
   * `.advance(` alone and could not see this; scanning one name is the
   * same weakness the landing rejected when it made the terminal-
   * classification guard a FIELD scan.
   */
  adoptCommitted(capability: CommitCapability): void {
    this.machine.commitProjected(capability)
  }

  /** Stop the deadline and cancellation timers. Safe to call twice. */
  disarm(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.length = 0
  }

  /**
   * Release everything this run holds.
   *
   * Called from the ordinary conclusion AND from the exception handler,
   * which is the point: a workspace provisioned before execution used to
   * survive any throw, because the only release path was inside the walk
   * that threw. Each step is independent and best-effort — a session
   * that will not close must not stop the workspace being discarded.
   *
   * Nothing is released once the fence is lost. The workspace and
   * session named here belong to whoever holds the run now, and
   * discarding them would destroy the state of a run in progress.
   */
  async release(ports: Ports): Promise<void> {
    this.disarm()
    const workspace = this.workspace
    const session = this.session
    this.workspace = undefined
    this.session = undefined
    if (this.fenceLost !== undefined) return
    if (workspace !== undefined) {
      try {
        await ports.workspace.discard({ ...this.fence, workspace_ref: workspace.workspace_ref })
      } catch {
        // Reported by the implementation; never a reason to fail a run
        // that has already concluded.
      }
    }
    if (session !== undefined) {
      try {
        await ports.session.close({ ...this.fence, session_ref: session.session_ref })
      } catch {
        // A session that will not close is reported by L9's
        // implementation, not by failing an already-concluded run.
      }
    }
  }
}
