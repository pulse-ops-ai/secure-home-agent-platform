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
 * WHAT IS AND IS NOT HERE. This holds what every terminal owner needs:
 * the machine, resources, fence, deadline, and the typed value describing
 * what the run has established so far. Keeping captured authority and
 * observations reachable here is what lets interruption and last-resort
 * recovery produce the state-appropriate governed record instead of
 * fabricating an early shape or returning none.
 */
import type { Ports, RunFence, SessionHandle, WorkspaceHandle } from '../ports/index.js'
import type { CommitCapability, RunMachine, TransitionKind } from '../lifecycle/index.js'
import { JournalOutbox } from '../run-state/outbox.js'
import type { RunDeadline } from '../orchestration/deadline.js'
import {
  emptyTerminalEvidence,
  type EstablishedRun,
  type TerminalEvidence,
} from '../orchestration/state.js'
import type { RunConclusion } from '../orchestration/result.js'

export class RunScope {
  readonly fence: RunFence
  readonly machine: RunMachine
  readonly startedAt: string

  /**
   * Every journal fact of every category, pending until it lands.
   * The pre-seal gate asks this one queue; see `JournalOutbox`.
   */
  readonly outbox: JournalOutbox

  /** Acquired during the spend phase; released on every exit. */
  session: SessionHandle | undefined
  workspace: WorkspaceHandle | undefined
  deadline: RunDeadline | undefined

  /**
   * ACQUISITIONS WHOSE OUTCOME IS UNKNOWN. Set to the caller-known
   * resource identity immediately before prepare/provision, cleared on
   * a definitive answer (a handle, or a refusal that by contract
   * created nothing). While set, the resource MAY exist with no handle
   * to name it — so teardown resolves it by this identity, which is why
   * the identity had to exist before the call.
   */
  sessionAttempt: string | undefined
  workspaceAttempt: string | undefined

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

  /** What the walk has established, available to every terminal owner. */
  established: EstablishedRun = { at: 'requested' }

  /** Incremental audit facts produced before RUNNING fully completes. */
  terminalEvidence: TerminalEvidence = emptyTerminalEvidence()

  /** The governed terminal record already made durable, if any. */
  recorded: RunConclusion['produced'] = 'none'

  constructor(fence: RunFence, machine: RunMachine, startedAt: string) {
    this.fence = fence
    this.machine = machine
    this.startedAt = startedAt
    // Entry identities are scoped to this run AND this ownership
    // generation, so two attempts at one run can never replay each
    // other's facts.
    this.outbox = new JournalOutbox(`${fence.run_id}#g${String(fence.generation)}`)
  }

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
    this.deadline?.disarm()
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
  async release(ports: Ports, disarm = true): Promise<void> {
    const workspace = this.workspace
    const session = this.session
    // A handle is the definitive name; an unresolved ATTEMPT identity is
    // the fallback — the resource may exist even though the
    // acknowledgement carrying its handle never arrived, and the
    // caller-known identity is the only name teardown has for it.
    const workspaceRef = workspace?.workspace_ref ?? this.workspaceAttempt
    const sessionRef = session?.session_ref ?? this.sessionAttempt
    this.workspace = undefined
    this.session = undefined
    this.workspaceAttempt = undefined
    this.sessionAttempt = undefined
    try {
      if (this.fenceLost !== undefined) return
      // Start both independent cleanup operations before awaiting either.
      // A workspace implementation that never answers must not prevent
      // the session close from even being attempted (and vice versa).
      const cleanup: Promise<unknown>[] = []
      if (workspaceRef !== undefined) {
        cleanup.push(
          ports.workspace.discard({
            ...this.fence,
            workspace_ref: workspaceRef,
          }),
        )
      }
      if (sessionRef !== undefined) {
        cleanup.push(
          ports.session.close({
            ...this.fence,
            session_ref: sessionRef,
          }),
        )
      }
      await Promise.allSettled(cleanup)
    } finally {
      // Keep the wall clock alive THROUGH cleanup. Disarming before an
      // awaited discard or close made teardown the one unbounded part of
      // `run()`.
      if (disarm) this.disarm()
    }
  }
}
