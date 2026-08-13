/**
 * A deterministic execution session that starts nothing.
 *
 * It mints a handle, records the lifecycle it was driven through, and
 * reports teardown. There is no process, no container, and no socket —
 * this landing launches nothing, and the port exists so that L9 can
 * supply an implementation that does and PROVE teardown through it,
 * rather than having to invent the seam first.
 */
import type {
  ExecutionSessionPort,
  FenceOutcome,
  RunFence,
  SessionClosure,
  SessionHandle,
  SessionPreparation,
  SessionPrepareRequest,
  SessionStart,
} from '../ports/index.js'
import { FenceLedger } from '../run-state/fence.js'

export class InMemoryExecutionSession implements ExecutionSessionPort {
  readonly #interrupted = new Set<string>()
  readonly #closed = new Set<string>()
  readonly #fence = new FenceLedger()

  prepare(request: SessionPrepareRequest): Promise<SessionPreparation> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined)
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    return Promise.resolve({
      ok: true,
      handle: {
        session_ref: `session:${request.run_id}`,
        deadline: { wall_clock_seconds: request.limits.wall_clock_seconds },
      } satisfies SessionHandle,
    })
  }

  start(request: RunFence & { readonly session_ref: string }): Promise<SessionStart> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined)
      return Promise.resolve({ ok: false, reason: 'stale_fence', detail: refused })
    return Promise.resolve({ ok: true })
  }

  interrupt(
    request: RunFence & {
      readonly session_ref: string
      readonly reason: 'cancel' | 'timeout'
    },
  ): Promise<FenceOutcome> {
    const refused = this.#fence.outcome(request)
    // A stale interrupt is REFUSED rather than recorded: the session it
    // names belongs to whoever holds the run now, and stopping their
    // work is precisely the damage the fence exists to prevent.
    if (!refused.ok) return Promise.resolve(refused)
    this.#interrupted.add(request.session_ref)
    return Promise.resolve(refused)
  }

  close(request: RunFence & { readonly session_ref: string }): Promise<SessionClosure> {
    const refused = this.#fence.refuse(request)
    if (refused !== undefined) {
      return Promise.resolve({ torn_down: false, reason: 'stale_fence', detail: refused })
    }
    this.#closed.add(request.session_ref)
    // Nothing was started, so teardown is trivially complete. An
    // implementation that started something must report honestly here —
    // `torn_down: false` is a real answer, not a failure to check.
    return Promise.resolve({ torn_down: true })
  }

  interruptedRefs(): readonly string[] {
    return [...this.#interrupted]
  }

  closedRefs(): readonly string[] {
    return [...this.#closed]
  }
}
