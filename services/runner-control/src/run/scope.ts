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
import type { RunMachine } from '../lifecycle/index.js'

export class RunScope {
  readonly fence: RunFence
  readonly machine: RunMachine
  readonly startedAt: string

  /** Acquired during the spend phase; released on every exit. */
  session: SessionHandle | undefined
  workspace: WorkspaceHandle | undefined
  readonly timers: ReturnType<typeof setTimeout>[] = []

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

  loseFence(detail: string): void {
    this.fenceLost ??= detail
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
