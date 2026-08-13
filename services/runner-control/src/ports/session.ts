/**
 * The execution session: the seam that makes `SANDBOX_STARTED` a state
 * something CAUSED, and cancellation something that can reach a call
 * already in flight.
 *
 * Before this, consent succeeding moved the machine to `SANDBOX_STARTED`
 * with no execution operation having occurred at all — the execution
 * port's only operation was `runGate`, which has nothing to do with a
 * session existing. The lifecycle spec defers the REAL sandbox start; it
 * does not say the state is entered without one.
 *
 * And cancellation was polled between phases, which cannot interrupt a
 * hung `invoke()` or `runGate()` — precisely the two calls most likely to
 * hang. "Cancellation must be effective, not advisory" is not provable
 * against a design that can only look when nothing is happening.
 *
 * WHY NOW RATHER THAN AT L9. L9's scope is the real launcher, network and
 * resource enforcement, and effective cancellation and teardown. If the
 * port has no session handle, no deadline, and no interrupt, L9 has to
 * invent the seam before it can enforce anything through it — turning
 * effective cancellation into L9's problem to DESIGN rather than L9's
 * problem to PROVE. This landing ships a deterministic implementation
 * that starts nothing; L9 replaces it.
 */
import type { RunScoped } from './values.js'

/**
 * What a started session gives the rest of the run: something to name it
 * by, something to bind teardown to, and when it must be over.
 */
export interface SessionHandle {
  readonly session_ref: string
  readonly deadline: { readonly wall_clock_seconds: number }
}

export interface SessionLimits {
  readonly wall_clock_seconds: number
  readonly cpu_cores: number
  readonly memory_bytes: number
  readonly pids: number
  readonly output_bytes: number
}

export interface SessionPrepareRequest extends RunScoped {
  readonly profile: { readonly name: string; readonly version: string; readonly digest: string }
  readonly limits: SessionLimits
}

export type SessionPreparation =
  | { readonly ok: true; readonly handle: SessionHandle }
  | { readonly ok: false; readonly detail: string }

export type SessionStart = { readonly ok: true } | { readonly ok: false; readonly detail: string }

/** What closing observed. Teardown is REPORTED here and proven at L9. */
export interface SessionClosure {
  readonly torn_down: boolean
  readonly detail?: string
}

export interface ExecutionSessionPort {
  prepare(request: SessionPrepareRequest): Promise<SessionPreparation>
  start(request: RunScoped & { readonly session_ref: string }): Promise<SessionStart>
  /**
   * Stop the session's work NOW. Called while a call may still be in
   * flight, which is the whole point: an interrupt that could only run
   * between operations would be the polling design again.
   */
  interrupt(
    request: RunScoped & { readonly session_ref: string; readonly reason: 'cancel' | 'timeout' },
  ): Promise<void>
  close(request: RunScoped & { readonly session_ref: string }): Promise<SessionClosure>
}
