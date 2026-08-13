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
  RunScoped,
  SessionClosure,
  SessionHandle,
  SessionPreparation,
  SessionPrepareRequest,
  SessionStart,
} from '../ports/index.js'

export class InMemoryExecutionSession implements ExecutionSessionPort {
  readonly #interrupted = new Set<string>()
  readonly #closed = new Set<string>()

  prepare(request: SessionPrepareRequest): Promise<SessionPreparation> {
    return Promise.resolve({
      ok: true,
      handle: {
        session_ref: `session:${request.run_id}`,
        deadline: { wall_clock_seconds: request.limits.wall_clock_seconds },
      } satisfies SessionHandle,
    })
  }

  start(): Promise<SessionStart> {
    return Promise.resolve({ ok: true })
  }

  interrupt(request: RunScoped & { readonly session_ref: string }): Promise<void> {
    this.#interrupted.add(request.session_ref)
    return Promise.resolve()
  }

  close(request: RunScoped & { readonly session_ref: string }): Promise<SessionClosure> {
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
